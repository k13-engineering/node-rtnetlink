import assert from "node:assert";
import { describe, it } from "mocha";
import { compileAndCompare } from "ya-struct";
import { hostAbi } from "po6";
import {
  createRtnetlinkStructuresFor,
  hostStructures,
  ifinfomsgDefinition,
  ifaddrmsgDefinition,
  rtattrDefinition
} from "./structures.ts";
import { compileAndRun } from "./test-support/compile-and-run.ts";

const globalCode = `
#include <sys/socket.h>
#include <linux/rtnetlink.h>
#include <linux/if_addr.h>
`;

const structs = [
  { cStructName: "ifinfomsg", structDefinition: ifinfomsgDefinition },
  { cStructName: "rtattr", structDefinition: rtattrDefinition },
  { cStructName: "ifaddrmsg", structDefinition: ifaddrmsgDefinition },
];

describe("structures", () => {
  describe("layout", () => {
    structs.forEach(({ cStructName, structDefinition }) => {
      it(`should match struct ${cStructName} of the C headers`, async () => {
        const { layoutErrors } = await compileAndCompare({
          structDefinition,
          abi: hostAbi,
          globalCode,
          cStructName,
          compileAndRun,
        });

        assert.deepStrictEqual(layoutErrors, []);
      });
    });
  });

  describe("sizes", () => {
    it("should have the sizes defined by the kernel ABI", () => {
      assert.strictEqual(hostStructures.ifinfomsg.size, 16);
      assert.strictEqual(hostStructures.rtattr.size, 4);
      assert.strictEqual(hostStructures.ifaddrmsg.size, 8);
    });
  });

  describe("byte order", () => {
    it("should format big endian structures for big endian ABIs", () => {
      const structures = createRtnetlinkStructuresFor({
        abi: { endianness: "big", dataModel: "ILP32", compiler: "gcc" },
      });

      const data = structures.rtattr.format({ value: { rta_len: 8n, rta_type: 3n } });

      assert.deepStrictEqual([...data], [0, 8, 0, 3]);
    });
  });
});
