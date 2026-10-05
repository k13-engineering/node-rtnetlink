import assert from "node:assert";
import { describe, it } from "mocha";
import { AF_PACKET } from "./constants.ts";
import { formatIfinfoPayload, parseIfinfoPayload } from "./ifinfo.ts";
import { hostStructures } from "./structures.ts";

const structures = hostStructures;

describe("ifinfo", () => {
  it("should fill missing ifinfomsg fields with 0", () => {
    const payload = formatIfinfoPayload({ ifi: { ifi_index: 7n }, structures });

    assert.strictEqual(payload.length, 16);
    assert.deepStrictEqual(parseIfinfoPayload({ payload, structures }), {
      ifi: { ifi_family: 0n, ifi_type: 0n, ifi_index: 7n, ifi_flags: 0n, ifi_change: 0n },
      rta: [],
    });
  });

  it("should round trip ifinfomsg and attributes", () => {
    const ifi = { ifi_family: AF_PACKET, ifi_type: 772n, ifi_index: -1n, ifi_flags: 0x41n, ifi_change: 0xFFFF_FFFFn };
    const rta = [{ rta_type: 3n, data: Uint8Array.from([0x6C, 0x6F, 0]) }];

    const payload = formatIfinfoPayload({ ifi, rta, structures });

    assert.strictEqual(payload.length, 16 + 8);
    assert.deepStrictEqual(parseIfinfoPayload({ payload, structures }), { ifi, rta });
  });

  it("should throw if the payload is too short", () => {
    assert.throws(() => {
      parseIfinfoPayload({ payload: new Uint8Array(8), structures });
    }, /8 bytes, but at least 16 bytes are needed/);
  });
});
