import assert from "node:assert";
import { describe, it } from "mocha";
import { IFF_LOOPBACK, IFF_PROMISC, IFF_RUNNING, IFF_UP } from "./constants.ts";
import { formatLinkFlags, parseLinkFlags, type TLinkFlags } from "./link-flags.ts";

describe("link flags", () => {
  describe("formatLinkFlags", () => {
    it("should set flags that are true and change all given flags", () => {
      assert.deepStrictEqual(formatLinkFlags({ flags: { IFF_UP: true, IFF_PROMISC: false } }), {
        ifi_flags: IFF_UP,
        ifi_change: IFF_UP | IFF_PROMISC,
      });
    });

    it("should change nothing without flags", () => {
      assert.deepStrictEqual(formatLinkFlags({ flags: {} }), { ifi_flags: 0n, ifi_change: 0n });
    });

    it("should throw for unknown flags", () => {
      assert.throws(() => {
        formatLinkFlags({ flags: { IFF_FOO: true } as TLinkFlags });
      }, /unknown link flag "IFF_FOO"/);
    });
  });

  describe("parseLinkFlags", () => {
    it("should report all known flags", () => {
      const flags = parseLinkFlags({ ifi_flags: IFF_UP | IFF_LOOPBACK | IFF_RUNNING | 0x8000_0000n });

      assert.strictEqual(Object.keys(flags).length, 19);
      assert.strictEqual(flags.IFF_UP, true);
      assert.strictEqual(flags.IFF_LOOPBACK, true);
      assert.strictEqual(flags.IFF_RUNNING, true);
      assert.strictEqual(flags.IFF_PROMISC, false);
    });
  });
});
