import assert from "node:assert";
import { describe, it } from "mocha";
import * as constants from "./constants.ts";
import { compileAndRun } from "./test-support/compile-and-run.ts";

const printStatementFor = ({ name }: { name: string }) => {
  return `#ifdef ${name}
  printf("${name} %lld\\n", (long long) ${name});
#else
  printf("${name} missing\\n");
#endif`;
};

// enums of the kernel headers are no macros, so they are printed directly
const enumNames = new Set(Object.keys(constants).filter((name) => {
  return ["IFLA_", "RTM_", "IFF_", "MACVLAN_"].some((prefix) => {
    return name.startsWith(prefix);
  });
}));

const statementFor = ({ name }: { name: string }) => {
  // ~(NLA_F_NESTED | NLA_F_NET_BYTEORDER) is an int, the mask applies to the 16 bit rta_type
  if (name === "NLA_TYPE_MASK") {
    return `  printf("${name} %lld\\n", (long long) (unsigned short) ${name});`;
  }

  if (enumNames.has(name)) {
    return `  printf("${name} %lld\\n", (long long) ${name});`;
  }

  return printStatementFor({ name });
};

const valuesFromCHeaders = async ({ names }: { names: string[] }) => {
  const sourceCode = `#include <stdio.h>
#include <sys/socket.h>
#include <linux/netlink.h>
#include <linux/rtnetlink.h>
#include <linux/if_link.h>
#include <linux/if.h>

int main(void) {
${names.map((name) => {
    return statementFor({ name });
  }).join("\n")}
  return 0;
}
`;

  const { output } = await compileAndRun({ sourceCode });

  return output.trim().split("\n").map((line) => {
    const [name, value] = line.split(" ");
    return { name, value };
  });
};

describe("constants", () => {
  it("should match the values of the C headers", async () => {
    const names = Object.keys(constants);
    const valuesFromC = await valuesFromCHeaders({ names });

    assert.strictEqual(valuesFromC.length, names.length);

    valuesFromC.forEach(({ name, value }) => {
      assert.notStrictEqual(value, "missing", `${name} is not defined by the C headers`);
      assert.strictEqual(constants[name as keyof typeof constants], BigInt(value), `${name} differs from the C headers`);
    });
  });
});
