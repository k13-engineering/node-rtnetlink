import assert from "node:assert";
import { describe, it } from "mocha";
import {
  IFLA_ADDRESS,
  IFLA_IFNAME,
  IFLA_INFO_DATA,
  IFLA_INFO_KIND,
  IFLA_INFO_SLAVE_KIND,
  IFLA_LINKINFO,
  IFLA_MTU,
  IFLA_OPERSTATE,
  NLA_F_NESTED
} from "./constants.ts";
import {
  formatLinkAttributes,
  linkAttributeNames,
  parseLinkAttributes,
  type TLinkAttributes
} from "./link-attributes.ts";
import { formatAttributes, parseAttributes, stringCodec } from "./rtattr.ts";
import { hostStructures } from "./structures.ts";

const structures = hostStructures;

const allAttributes: Required<TLinkAttributes> = {
  name: "br0",
  mtu: 1500,
  address: Uint8Array.from([2, 0, 0, 0, 0, 1]),
  broadcast: Uint8Array.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]),
  txqlen: 1000,
  masterIndex: 3,
  linkIndex: 2,
  linkinfo: { kind: "bridge", slaveKind: "bond" },
};

describe("link attributes", () => {
  it("should define all attributes", () => {
    assert.deepStrictEqual(linkAttributeNames, Object.keys(allAttributes));
  });

  it("should round trip all attributes", () => {
    const rta = formatLinkAttributes({ attributes: allAttributes, structures });

    assert.deepStrictEqual(parseLinkAttributes({ rta, structures }), { attributes: allAttributes, unknown: [] });
  });

  it("should format the attributes with their rtattr types", () => {
    const rta = formatLinkAttributes({ attributes: { name: "lo", mtu: 1500 }, structures });

    assert.deepStrictEqual(rta.map((attribute) => {
      return attribute.rta_type;
    }), [IFLA_IFNAME, IFLA_MTU]);
    assert.deepStrictEqual([...rta[0].data], [0x6C, 0x6F, 0]);
  });

  it("should skip undefined attributes", () => {
    assert.deepStrictEqual(formatLinkAttributes({ attributes: { name: undefined, mtu: 9000 }, structures }).length, 1);
  });

  it("should throw for unknown attributes", () => {
    assert.throws(() => {
      formatLinkAttributes({ attributes: { color: "blue" } as TLinkAttributes, structures });
    }, /unknown link attribute "color"/);
  });

  it("should format linkinfo as nested attributes", () => {
    const [linkinfo] = formatLinkAttributes({ attributes: { linkinfo: { kind: "dummy" } }, structures });

    assert.strictEqual(linkinfo.rta_type, IFLA_LINKINFO);
    assert.deepStrictEqual(parseAttributes({ data: linkinfo.data, structures }), [
      { rta_type: IFLA_INFO_KIND, data: stringCodec.format({ value: "dummy", structures }) },
    ]);
  });

  it("should format empty linkinfo", () => {
    const [linkinfo] = formatLinkAttributes({ attributes: { linkinfo: {} }, structures });
    assert.strictEqual(linkinfo.data.length, 0);
  });

  it("should parse nested linkinfo with NLA_F_NESTED and ignore unknown nested attributes", () => {
    const data = formatAttributes({
      attributes: [
        { rta_type: IFLA_INFO_KIND, data: stringCodec.format({ value: "vxlan", structures }) },
        { rta_type: IFLA_INFO_DATA | NLA_F_NESTED, data: new Uint8Array(0) },
        { rta_type: IFLA_INFO_SLAVE_KIND, data: stringCodec.format({ value: "bridge", structures }) },
      ],
      structures,
    });

    const { attributes } = parseLinkAttributes({ rta: [{ rta_type: IFLA_LINKINFO | NLA_F_NESTED, data }], structures });

    assert.deepStrictEqual(attributes, { linkinfo: { kind: "vxlan", slaveKind: "bridge" } });
  });

  it("should return attributes without definition as unknown", () => {
    const operstate = { rta_type: IFLA_OPERSTATE, data: Uint8Array.from([6]) };
    const address = { rta_type: IFLA_ADDRESS, data: Uint8Array.from([1, 2]) };

    assert.deepStrictEqual(parseLinkAttributes({ rta: [operstate, address], structures }), {
      attributes: { address: Uint8Array.from([1, 2]) },
      unknown: [operstate],
    });
  });
});
