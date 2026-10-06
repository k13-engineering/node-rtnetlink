import assert from "node:assert";
import child_process from "node:child_process";
import path from "node:path";
import { describe, it } from "mocha";
import { createRtnetlink, type TRtnetlink } from "./index.ts";
import { openHostNetlinkSocket } from "./test-support/host-socket.ts";

const withRtnetlink = async ({ callback }: { callback: (args: { rt: TRtnetlink }) => Promise<void> }) => {
  const { netlink, close } = openHostNetlinkSocket();

  try {
    await callback({ rt: createRtnetlink({ netlink }) });
  } finally {
    close();
  }
};

// creating links needs CAP_NET_ADMIN, a fresh network namespace keeps the links of the host untouched
const canRunInNetworkNamespace = () => {
  const { status } = child_process.spawnSync("sudo", ["-n", "unshare", "-n", "true"], { stdio: "ignore" });
  return status === 0;
};

const itInNetworkNamespace = canRunInNetworkNamespace() ? it : it.skip;

type TObservedAddress = { family: string, address: string, prefixLength: number, nodad: boolean };

// what the lifecycle script observed in the second network namespace
type TNamespaceResult = {
  outerNames: string[];
  innerNames: string[];
  outerLowerIndex: number;
  macvtap: { linkIndex: number, linkinfo: unknown, up: boolean };
  addressesAdded: TObservedAddress[];
  addressesAfterRemove: TObservedAddress[];
};

// the kernel adds an IPv6 link-local address of its own once the link is up
const withoutLinkLocal = ({ addresses }: { addresses: TObservedAddress[] }) => {
  return addresses.filter(({ address }) => {
    return !address.startsWith("fe80:");
  });
};

const assertNamespaces = ({ namespaces }: { namespaces: TNamespaceResult }) => {
  assert.ok(namespaces.outerNames.includes("nrt-lower1"));
  assert.ok(!namespaces.outerNames.includes("nrt-nsmvt0") && !namespaces.outerNames.includes("nrt-move0"));
  assert.deepStrictEqual(new Set(namespaces.innerNames), new Set(["lo", "nrt-move0", "nrt-nsmvt0"]));
  assert.deepStrictEqual(namespaces.macvtap, {
    linkIndex: namespaces.outerLowerIndex,
    linkinfo: { kind: "macvtap", data: { mode: "bridge" } },
    up: true,
  });

  const ipv4 = { family: "inet", address: "10.0.0.2", prefixLength: 24, nodad: false };
  const ipv6 = { family: "inet6", address: "2001:db8::2", prefixLength: 64, nodad: true };
  assert.deepStrictEqual(withoutLinkLocal({ addresses: namespaces.addressesAdded }), [ipv4, ipv6]);
  assert.deepStrictEqual(withoutLinkLocal({ addresses: namespaces.addressesAfterRemove }), [ipv6]);
};

describe("node-rtnetlink on the host kernel", () => {
  it("should list the loopback link", async () => {
    await withRtnetlink({
      callback: async ({ rt }) => {
        const links = await rt.link.listAll();
        const lo = links.find(({ ifindex }) => {
          return ifindex === 1;
        });

        assert.ok(lo !== undefined);
        assert.strictEqual(lo.name, "lo");
        assert.strictEqual(lo.flags.IFF_LOOPBACK, true);
        assert.deepStrictEqual(lo.address, new Uint8Array(6));
      },
    });
  });

  it("should find and fetch the loopback link by name", async () => {
    await withRtnetlink({
      callback: async ({ rt }) => {
        const lo = await rt.link.findOneBy({ name: "lo" });
        const info = await lo.fetch();

        assert.strictEqual(info.ifindex, 1);
        assert.ok(info.mtu !== undefined && info.mtu > 0);
        assert.ok(info.unknownAttributes.length > 0);
      },
    });
  });

  it("should not find links that do not exist", async () => {
    await withRtnetlink({
      callback: async ({ rt }) => {
        assert.strictEqual(await rt.link.tryFindOneBy({ name: "nrt-missing" }), undefined);
        await assert.rejects(rt.link.fromIndex({ ifindex: 0x7FFF_FFFF }).fetch(), /ENODEV/);
      },
    });
  });

  itInNetworkNamespace("should create, modify and delete links in a network namespace", () => {
    const script = path.join(import.meta.dirname, "test-support", "link-lifecycle.ts");
    const output = child_process.execFileSync("sudo", ["-n", "unshare", "-n", process.execPath, script], { encoding: "utf-8" });
    const result = JSON.parse(output);

    assert.deepStrictEqual(result.dummy, {
      name: "nrt-dummy0",
      mtu: 1400,
      masterIndex: result.bridgeIndex,
      linkinfo: { kind: "dummy", slaveKind: "bridge" },
      up: true,
    });
    assert.deepStrictEqual(result.bridgeIndexes, [result.bridgeIndex]);
    assert.match(result.duplicate, /creating link failed with EEXIST/);

    assert.deepStrictEqual(result.macvtap, {
      lowerIndex: result.macvtap.lowerIndex,
      linkIndex: result.macvtap.lowerIndex,
      linkinfo: { kind: "macvtap", data: { mode: "bridge" } },
    });
    assert.deepStrictEqual(result.veth, {
      ifindex: result.veth.ifindex,
      peer: { linkIndex: result.veth.ifindex, mtu: 1400, kind: "veth" },
      peerRemoved: true,
    });
    assertNamespaces({ namespaces: result.namespaces });
    assert.deepStrictEqual(result.remaining, ["lo"]);
  });
});
