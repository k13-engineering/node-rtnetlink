import assert from "node:assert";
import { describe, it } from "mocha";
import {
  IFLA_IFNAME,
  IFLA_INFO_DATA,
  IFLA_INFO_KIND,
  IFLA_MACVLAN_FLAGS,
  IFLA_MACVLAN_MODE,
  MACVLAN_MODE_BRIDGE,
  VETH_INFO_PEER
} from "./constants.ts";
import { parseIfinfoPayload } from "./ifinfo.ts";
import { linkinfoCodec, type TLinkinfo, type TMacvlanMode } from "./linkinfo.ts";
import {
  formatAttributes,
  parseAttributes,
  stringCodec,
  u32Codec
} from "./rtattr.ts";
import { hostStructures } from "./structures.ts";

const structures = hostStructures;

const roundTrip = ({ linkinfo }: { linkinfo: TLinkinfo }) => {
  return linkinfoCodec.parse({ data: linkinfoCodec.format({ value: linkinfo, structures }), structures });
};

const linkinfoWithData = ({ kind, data }: { kind: string, data: Uint8Array }) => {
  return formatAttributes({
    attributes: [
      { rta_type: IFLA_INFO_KIND, data: stringCodec.format({ value: kind, structures }) },
      { rta_type: IFLA_INFO_DATA, data },
    ],
    structures,
  });
};

const macvlanData = ({ mode }: { mode: number }) => {
  return formatAttributes({
    attributes: [
      { rta_type: IFLA_MACVLAN_MODE, data: u32Codec.format({ value: mode, structures }) },
      { rta_type: IFLA_MACVLAN_FLAGS, data: u32Codec.format({ value: 0, structures }) },
    ],
    structures,
  });
};

describe("linkinfo", () => {
  it("should round trip kind and slave kind", () => {
    assert.deepStrictEqual(roundTrip({ linkinfo: { kind: "dummy", slaveKind: "bridge" } }), { kind: "dummy", slaveKind: "bridge" });
    assert.deepStrictEqual(roundTrip({ linkinfo: {} }), {});
  });

  (["private", "vepa", "bridge", "passthru", "source"] as TMacvlanMode[]).forEach((mode) => {
    it(`should round trip the macvlan mode ${mode}`, () => {
      assert.deepStrictEqual(roundTrip({ linkinfo: { kind: "macvtap", data: { mode } } }), { kind: "macvtap", data: { mode } });
    });
  });

  it("should format the mode as IFLA_MACVLAN_MODE in IFLA_INFO_DATA", () => {
    const data = linkinfoCodec.format({ value: { kind: "macvlan", data: { mode: "bridge" } }, structures });
    const [, infoData] = parseAttributes({ data, structures });

    assert.strictEqual(infoData.rta_type, IFLA_INFO_DATA);
    assert.deepStrictEqual(parseAttributes({ data: infoData.data, structures }), [
      { rta_type: IFLA_MACVLAN_MODE, data: u32Codec.format({ value: Number(MACVLAN_MODE_BRIDGE), structures }) },
    ]);
  });

  it("should format empty macvlan data", () => {
    assert.deepStrictEqual(roundTrip({ linkinfo: { kind: "macvlan", data: {} } }), { kind: "macvlan", data: {} });
  });

  it("should parse the mode and ignore other macvlan attributes", () => {
    const data = linkinfoWithData({ kind: "macvtap", data: macvlanData({ mode: 2 }) });

    assert.deepStrictEqual(linkinfoCodec.parse({ data, structures }), { kind: "macvtap", data: { mode: "vepa" } });
  });

  it("should leave out modes it does not know", () => {
    const data = linkinfoWithData({ kind: "macvlan", data: macvlanData({ mode: 64 }) });

    assert.deepStrictEqual(linkinfoCodec.parse({ data, structures }), { kind: "macvlan", data: {} });
  });

  it("should leave out the data of kinds without a codec", () => {
    const data = linkinfoWithData({ kind: "vlan", data: macvlanData({ mode: 4 }) });

    assert.deepStrictEqual(linkinfoCodec.parse({ data, structures }), { kind: "vlan" });
  });

  it("should throw for unknown modes", () => {
    assert.throws(() => {
      linkinfoCodec.format({ value: { kind: "macvtap", data: { mode: "loop" as TMacvlanMode } }, structures });
    }, /unknown macvlan mode "loop"/);
  });

  it("should throw for data of kinds without a codec", () => {
    assert.throws(() => {
      linkinfoCodec.format({ value: { kind: "bridge", data: { mode: "bridge" } }, structures });
    }, /linkinfo data is not supported for kind "bridge"/);
    assert.throws(() => {
      linkinfoCodec.format({ value: { data: {} }, structures });
    }, /linkinfo data is not supported for kind "undefined"/);
  });

  describe("veth", () => {
    it("should round trip the peer", () => {
      const linkinfo = { kind: "veth", data: { peer: { name: "veth1", mtu: 9000, address: Uint8Array.from([2, 0, 0, 0, 0, 2]) } } };

      assert.deepStrictEqual(roundTrip({ linkinfo }), linkinfo);
    });

    it("should format the peer as struct ifinfomsg and attributes in VETH_INFO_PEER", () => {
      const data = linkinfoCodec.format({ value: { kind: "veth", data: { peer: { name: "veth1" } } }, structures });
      const [, infoData] = parseAttributes({ data, structures });
      const [peer] = parseAttributes({ data: infoData.data, structures });

      assert.strictEqual(peer.rta_type, VETH_INFO_PEER);
      assert.deepStrictEqual(parseIfinfoPayload({ payload: peer.data, structures }), {
        ifi: { ifi_family: 0n, ifi_type: 0n, ifi_index: 0n, ifi_flags: 0n, ifi_change: 0n },
        rta: [{ rta_type: IFLA_IFNAME, data: stringCodec.format({ value: "veth1", structures }) }],
      });
    });

    it("should round trip veth data without peer", () => {
      assert.deepStrictEqual(roundTrip({ linkinfo: { kind: "veth", data: {} } }), { kind: "veth", data: {} });
      assert.deepStrictEqual(roundTrip({ linkinfo: { kind: "veth", data: { peer: {} } } }), { kind: "veth", data: { peer: {} } });
    });
  });
});
