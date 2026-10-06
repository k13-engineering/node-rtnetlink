import assert from "node:assert";
import { describe, it } from "mocha";
import { AF_INET6, IFA_ADDRESS } from "./constants.ts";
import { formatIfaddrPayload, parseIfaddrPayload } from "./ifaddr.ts";
import { hostStructures } from "./structures.ts";

const structures = hostStructures;

describe("ifaddr", () => {
  it("should fill missing ifaddrmsg fields with 0", () => {
    const payload = formatIfaddrPayload({ ifa: { ifa_index: 3n }, structures });

    assert.strictEqual(payload.length, 8);
    assert.deepStrictEqual(parseIfaddrPayload({ payload, structures }), {
      ifa: { ifa_family: 0n, ifa_prefixlen: 0n, ifa_flags: 0n, ifa_scope: 0n, ifa_index: 3n },
      rta: [],
    });
  });

  it("should round trip ifaddrmsg and attributes", () => {
    const ifa = { ifa_family: AF_INET6, ifa_prefixlen: 64n, ifa_flags: 0x80n, ifa_scope: 253n, ifa_index: 0xFFFF_FFFFn };
    const rta = [{ rta_type: IFA_ADDRESS, data: new Uint8Array(16) }];

    const payload = formatIfaddrPayload({ ifa, rta, structures });

    assert.strictEqual(payload.length, 8 + 20);
    assert.deepStrictEqual(parseIfaddrPayload({ payload, structures }), { ifa, rta });
  });

  it("should throw if the payload is too short", () => {
    assert.throws(() => {
      parseIfaddrPayload({ payload: new Uint8Array(4), structures });
    }, /4 bytes, but at least 8 bytes are needed/);
  });
});
