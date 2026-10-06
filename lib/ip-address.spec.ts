import assert from "node:assert";
import { describe, it } from "mocha";
import { formatIpAddress, parseIpAddress } from "./ip-address.ts";

const zeros = ({ count }: { count: number }) => {
  return Array.from({ length: count }, () => {
    return 0;
  });
};

const bytesOf = ({ address }: { address: string }) => {
  return [...parseIpAddress({ address }).bytes];
};

describe("ip address", () => {
  describe("parseIpAddress", () => {
    it("should parse IPv4 addresses", () => {
      assert.deepStrictEqual(parseIpAddress({ address: "192.0.2.10" }), { family: "inet", bytes: Uint8Array.from([192, 0, 2, 10]) });
    });

    it("should parse full IPv6 addresses", () => {
      const { family, bytes } = parseIpAddress({ address: "2001:0db8:0000:0000:0000:ff00:0042:8329" });

      assert.strictEqual(family, "inet6");
      assert.deepStrictEqual([...bytes], [0x20, 0x01, 0x0D, 0xB8, 0, 0, 0, 0, 0, 0, 0xFF, 0, 0, 0x42, 0x83, 0x29]);
    });

    const cases = [
      { address: "::", expected: zeros({ count: 16 }) },
      { address: "::1", expected: [...zeros({ count: 15 }), 1] },
      { address: "fe80::", expected: [0xFE, 0x80, ...zeros({ count: 14 })] },
      { address: "2001:db8::ff00:42:8329", expected: [0x20, 0x01, 0x0D, 0xB8, 0, 0, 0, 0, 0, 0, 0xFF, 0, 0, 0x42, 0x83, 0x29] },
      { address: "::ffff:192.0.2.1", expected: [...zeros({ count: 10 }), 0xFF, 0xFF, 192, 0, 2, 1] },
      { address: "64:ff9b::192.0.2.1", expected: [0, 0x64, 0xFF, 0x9B, ...zeros({ count: 8 }), 192, 0, 2, 1] },
      { address: "2001:DB8::A", expected: [0x20, 0x01, 0x0D, 0xB8, ...zeros({ count: 11 }), 0x0A] },
    ];

    cases.forEach(({ address, expected }) => {
      it(`should parse the IPv6 address ${address}`, () => {
        assert.deepStrictEqual(bytesOf({ address }), expected);
      });
    });

    ["", "1.2.3", "256.0.0.1", "2001:db8::1::2", "fe80::1%eth0", "localhost"].forEach((address) => {
      it(`should reject "${address}"`, () => {
        assert.throws(() => {
          parseIpAddress({ address });
        }, /invalid IP address/);
      });
    });
  });

  describe("formatIpAddress", () => {
    it("should format IPv4 addresses", () => {
      assert.strictEqual(formatIpAddress({ bytes: Uint8Array.from([10, 0, 0, 255]) }), "10.0.0.255");
    });

    const cases = [
      { address: "2001:0db8:0000:0000:0000:ff00:0042:8329", expected: "2001:db8::ff00:42:8329" },
      { address: "::", expected: "::" },
      { address: "::1", expected: "::1" },
      { address: "fe80::", expected: "fe80::" },
      { address: "2001:db8:0:1:1:1:1:1", expected: "2001:db8:0:1:1:1:1:1" },
      { address: "2001:0:0:1:0:0:0:1", expected: "2001:0:0:1::1" },
      { address: "2001:db8:0:0:1:0:0:1", expected: "2001:db8::1:0:0:1" },
      { address: "1:2:3:4:5:6:7:8", expected: "1:2:3:4:5:6:7:8" },
      { address: "::ffff:c000:201", expected: "::ffff:192.0.2.1" },
    ];

    cases.forEach(({ address, expected }) => {
      it(`should format ${address} as ${expected}`, () => {
        assert.strictEqual(formatIpAddress({ bytes: parseIpAddress({ address }).bytes }), expected);
      });
    });

    it("should format addresses in a larger buffer", () => {
      const buffer = new Uint8Array(20);
      buffer.set(parseIpAddress({ address: "2001:db8::1" }).bytes, 4);

      assert.strictEqual(formatIpAddress({ bytes: buffer.subarray(4) }), "2001:db8::1");
    });

    it("should reject other lengths", () => {
      assert.throws(() => {
        formatIpAddress({ bytes: new Uint8Array(6) });
      }, /an IP address has 4 or 16 bytes, not 6/);
    });
  });
});
