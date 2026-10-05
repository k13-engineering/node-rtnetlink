import assert from "node:assert";
import { describe, it } from "mocha";
import { IFLA_IFNAME, IFLA_LINKINFO, NLA_F_NESTED } from "./constants.ts";
import {
  bytesCodec,
  formatAttributes,
  parseAttributes,
  rtaAlign,
  stringCodec,
  typeOfAttribute,
  u32Codec
} from "./rtattr.ts";
import { createRtnetlinkStructuresFor, hostStructures } from "./structures.ts";

const structures = hostStructures;

const bigEndianStructures = createRtnetlinkStructuresFor({
  abi: { endianness: "big", dataModel: "LP64", compiler: "gcc" },
});

describe("rtattr", () => {
  describe("rtaAlign", () => {
    it("should round up to multiples of 4", () => {
      assert.deepStrictEqual([0, 1, 4, 5, 8].map((length) => {
        return rtaAlign({ length });
      }), [0, 4, 4, 8, 8]);
    });
  });

  describe("formatAttributes", () => {
    it("should format headers, data and padding", () => {
      const data = formatAttributes({
        attributes: [
          { rta_type: 3n, data: Uint8Array.from([0x6C, 0x6F, 0]) },
          { rta_type: 4n, data: Uint8Array.from([1, 2, 3, 4]) },
        ],
        structures,
      });

      assert.deepStrictEqual([...data], [
        7, 0, 3, 0, 0x6C, 0x6F, 0, 0,
        8, 0, 4, 0, 1, 2, 3, 4,
      ]);
    });

    it("should format an empty list", () => {
      assert.deepStrictEqual(formatAttributes({ attributes: [], structures }), new Uint8Array(0));
    });
  });

  describe("parseAttributes", () => {
    it("should parse formatted attributes", () => {
      const attributes = [
        { rta_type: 3n, data: Uint8Array.from([1, 2, 3]) },
        { rta_type: 18n | NLA_F_NESTED, data: new Uint8Array(0) },
        { rta_type: 4n, data: Uint8Array.from([5]) },
      ];

      assert.deepStrictEqual(parseAttributes({ data: formatAttributes({ attributes, structures }), structures }), attributes);
    });

    it("should accept a missing padding after the last attribute", () => {
      const data = formatAttributes({ attributes: [{ rta_type: 3n, data: Uint8Array.from([1]) }], structures });

      assert.deepStrictEqual(parseAttributes({ data: data.subarray(0, 5), structures }), [
        { rta_type: 3n, data: Uint8Array.from([1]) },
      ]);
    });

    it("should throw if the data is too short for a header", () => {
      assert.throws(() => {
        parseAttributes({ data: new Uint8Array(2), structures });
      }, /2 bytes left, but a header needs 4 bytes/);
    });

    it("should throw if rta_len is shorter than the header", () => {
      assert.throws(() => {
        parseAttributes({ data: Uint8Array.from([2, 0, 3, 0]), structures });
      }, /rta_len 2 is out of range \[4, 4\]/);
    });

    it("should throw if rta_len exceeds the data", () => {
      assert.throws(() => {
        parseAttributes({ data: Uint8Array.from([9, 0, 3, 0, 1, 2, 3, 4]), structures });
      }, /rta_len 9 is out of range \[4, 8\]/);
    });
  });

  describe("typeOfAttribute", () => {
    it("should strip NLA_F_NESTED and NLA_F_NET_BYTEORDER", () => {
      const nested = { rta_type: IFLA_LINKINFO | NLA_F_NESTED | 0x4000n, data: new Uint8Array(0) };
      assert.strictEqual(typeOfAttribute({ attribute: nested }), IFLA_LINKINFO);
      assert.strictEqual(typeOfAttribute({ attribute: { rta_type: IFLA_IFNAME, data: new Uint8Array(0) } }), IFLA_IFNAME);
    });
  });

  describe("stringCodec", () => {
    it("should format a NUL terminated string", () => {
      assert.deepStrictEqual([...stringCodec.format({ value: "lo", structures })], [0x6C, 0x6F, 0]);
    });

    it("should parse up to the first NUL", () => {
      assert.strictEqual(stringCodec.parse({ data: Uint8Array.from([0x6C, 0x6F, 0, 0x78, 0]), structures }), "lo");
    });

    it("should round trip UTF-8", () => {
      const data = stringCodec.format({ value: "bröcke", structures });
      assert.strictEqual(stringCodec.parse({ data, structures }), "bröcke");
    });

    it("should throw if the terminating NUL is missing", () => {
      assert.throws(() => {
        stringCodec.parse({ data: Uint8Array.from([0x6C, 0x6F]), structures });
      }, /terminating NUL is missing/);
    });
  });

  describe("u32Codec", () => {
    it("should use the byte order of the ABI", () => {
      assert.deepStrictEqual([...u32Codec.format({ value: 0x01020304, structures })], [4, 3, 2, 1]);
      assert.deepStrictEqual([...u32Codec.format({ value: 0x01020304, structures: bigEndianStructures })], [1, 2, 3, 4]);
    });

    it("should round trip", () => {
      const data = u32Codec.format({ value: 0xFFFF_FFFF, structures });
      assert.strictEqual(u32Codec.parse({ data, structures }), 0xFFFF_FFFF);
      assert.strictEqual(u32Codec.parse({ data: Uint8Array.from([0, 0, 5, 220]), structures: bigEndianStructures }), 1500);
    });

    it("should throw if the data is too short", () => {
      assert.throws(() => {
        u32Codec.parse({ data: new Uint8Array(2), structures });
      }, /2 bytes instead of 4/);
    });
  });

  describe("bytesCodec", () => {
    it("should copy the bytes", () => {
      const value = Uint8Array.from([0xAA, 0xBB]);

      const formatted = bytesCodec.format({ value, structures });
      const parsed = bytesCodec.parse({ data: formatted, structures });
      value.fill(0);

      assert.deepStrictEqual([...formatted], [0xAA, 0xBB]);
      assert.deepStrictEqual([...parsed], [0xAA, 0xBB]);
    });
  });
});
