import assert from "node:assert";
import { describe, it } from "mocha";
import { NLM_F_CREATE, NLM_F_EXCL } from "node-netlink";
import { IFF_LOOPBACK, IFF_PROMISC, IFF_UP, RTM_NEWLINK } from "./constants.ts";
import { parseIfinfoPayload } from "./ifinfo.ts";
import { createRtnetlink } from "./rtnetlink.ts";
import { hostStructures } from "./structures.ts";
import { createFakeKernel, ethernet, loopback } from "./test-support/fake-kernel.ts";

const structures = hostStructures;

const createTestSetup = () => {
  const kernel = createFakeKernel({ links: [loopback, ethernet] });
  const { link } = createRtnetlink({ netlink: kernel.netlink });
  return { kernel, link };
};

const ifindexesOf = ({ links }: { links: { ifindex: number }[] }) => {
  return links.map(({ ifindex }) => {
    return ifindex;
  });
};

const lastRequest = ({ kernel }: { kernel: ReturnType<typeof createFakeKernel> }) => {
  const request = kernel.requests().at(-1);
  assert.ok(request !== undefined);

  return {
    header: request.header,
    ...parseIfinfoPayload({ payload: request.payload, structures }),
  };
};

describe("link", () => {
  describe("listAll", () => {
    it("should report all links", async () => {
      const { link } = createTestSetup();

      const [lo, eth0] = await link.listAll();

      assert.strictEqual(lo.ifindex, 1);
      assert.strictEqual(lo.type, 772);
      assert.strictEqual(lo.name, "lo");
      assert.strictEqual(lo.mtu, 65_536);
      assert.strictEqual(lo.flags.IFF_LOOPBACK, true);
      assert.strictEqual(lo.flags.IFF_PROMISC, false);
      assert.deepStrictEqual(lo.unknownAttributes, []);

      assert.strictEqual(eth0.ifindex, 2);
      assert.deepStrictEqual(eth0.address, Uint8Array.from([2, 0, 0, 0, 0, 1]));
      assert.deepStrictEqual(eth0.linkinfo, { kind: "veth" });
    });
  });

  describe("fromIndex", () => {
    it("should return a link without talking to the kernel", () => {
      const { kernel, link } = createTestSetup();

      assert.strictEqual(link.fromIndex({ ifindex: 2 }).ifindex, 2);
      assert.deepStrictEqual(kernel.requests(), []);
    });
  });

  describe("fetch", () => {
    it("should fetch the link", async () => {
      const { link } = createTestSetup();

      const info = await link.fromIndex({ ifindex: 2 }).fetch();

      assert.strictEqual(info.name, "eth0");
      assert.strictEqual(info.flags.IFF_UP, true);
    });

    it("should reject if the link does not exist", async () => {
      const { link } = createTestSetup();

      await assert.rejects(link.fromIndex({ ifindex: 42 }).fetch(), /ENODEV/);
    });
  });

  describe("modify", () => {
    it("should change attributes and flags", async () => {
      const { kernel, link } = createTestSetup();

      await link.fromIndex({ ifindex: 2 }).modify({ name: "uplink", mtu: 9000, flags: { IFF_UP: false, IFF_PROMISC: true } });

      const { ifi, header } = lastRequest({ kernel });
      assert.strictEqual(header.nlmsg_type, RTM_NEWLINK);
      assert.strictEqual(ifi.ifi_flags, IFF_PROMISC);
      assert.strictEqual(ifi.ifi_change, IFF_UP | IFF_PROMISC);

      const info = await link.fromIndex({ ifindex: 2 }).fetch();
      assert.strictEqual(info.name, "uplink");
      assert.strictEqual(info.mtu, 9000);
      assert.strictEqual(info.flags.IFF_UP, false);
      assert.strictEqual(info.flags.IFF_PROMISC, true);
    });

    it("should leave flags unchanged without flags", async () => {
      const { kernel, link } = createTestSetup();

      await link.fromIndex({ ifindex: 1 }).modify({ mtu: 1500 });

      assert.strictEqual(lastRequest({ kernel }).ifi.ifi_change, 0n);
      assert.strictEqual(kernel.links()[0].flags & IFF_LOOPBACK, IFF_LOOPBACK);
    });

    it("should reject if the link does not exist", async () => {
      const { link } = createTestSetup();

      await assert.rejects(link.fromIndex({ ifindex: 42 }).modify({ mtu: 1500 }), /ENODEV/);
    });
  });

  describe("deleteLink", () => {
    it("should delete the link", async () => {
      const { kernel, link } = createTestSetup();

      await link.fromIndex({ ifindex: 2 }).deleteLink();

      assert.deepStrictEqual(ifindexesOf({ links: kernel.links() }), [1]);
    });

    it("should reject if the link does not exist", async () => {
      const { link } = createTestSetup();

      await assert.rejects(link.fromIndex({ ifindex: 42 }).deleteLink(), /ENODEV/);
    });
  });

  describe("findAllBy", () => {
    const cases = [
      { description: "name", criteria: { name: "eth0" }, expected: [2] },
      { description: "a partial linkinfo", criteria: { linkinfo: { kind: "veth" } }, expected: [2] },
      { description: "a linkinfo the link does not have", criteria: { linkinfo: { kind: "bridge" } }, expected: [] },
      { description: "address", criteria: { address: Uint8Array.from([2, 0, 0, 0, 0, 1]) }, expected: [2] },
      { description: "flags", criteria: { flags: { IFF_UP: true } }, expected: [1, 2] },
      { description: "cleared flags", criteria: { flags: { IFF_LOOPBACK: false } }, expected: [2] },
      { description: "type", criteria: { type: 772 }, expected: [1] },
      { description: "several criteria", criteria: { mtu: 1500, flags: { IFF_UP: true } }, expected: [2] },
      { description: "undefined criteria", criteria: { name: undefined }, expected: [1, 2] },
      { description: "a name no link has", criteria: { name: "wlan0" }, expected: [] },
    ];

    cases.forEach(({ description, criteria, expected }) => {
      it(`should find links by ${description}`, async () => {
        const { link } = createTestSetup();

        assert.deepStrictEqual(ifindexesOf({ links: await link.findAllBy(criteria) }), expected);
      });
    });
  });

  describe("tryFindOneBy", () => {
    it("should resolve with the only matching link", async () => {
      const { link } = createTestSetup();

      assert.strictEqual((await link.tryFindOneBy({ name: "lo" }))?.ifindex, 1);
    });

    it("should resolve with undefined if no link matches", async () => {
      const { link } = createTestSetup();

      assert.strictEqual(await link.tryFindOneBy({ name: "wlan0" }), undefined);
    });

    it("should resolve with undefined if several links match", async () => {
      const { link } = createTestSetup();

      assert.strictEqual(await link.tryFindOneBy({ flags: { IFF_UP: true } }), undefined);
    });
  });

  describe("findOneBy", () => {
    it("should resolve with the only matching link", async () => {
      const { link } = createTestSetup();

      assert.strictEqual((await link.findOneBy({ name: "eth0" })).ifindex, 2);
    });

    it("should reject if no link matches", async () => {
      const { link } = createTestSetup();

      await assert.rejects(link.findOneBy({ name: "wlan0" }), /expected exactly one matching link, found 0/);
    });

    it("should reject if several links match", async () => {
      const { link } = createTestSetup();

      await assert.rejects(link.findOneBy({ flags: { IFF_UP: true } }), /expected exactly one matching link, found 2/);
    });
  });

  describe("createLink", () => {
    it("should create the link with the next free index", async () => {
      const { kernel, link } = createTestSetup();

      const created = await link.createLink({ name: "br0", linkinfo: { kind: "bridge" }, flags: { IFF_UP: true } });

      assert.strictEqual(created.ifindex, 3);

      const { header, ifi } = lastRequest({ kernel });
      assert.strictEqual(header.nlmsg_flags, NLM_F_CREATE | NLM_F_EXCL);
      assert.strictEqual(ifi.ifi_index, 3n);

      const info = await created.fetch();
      assert.strictEqual(info.name, "br0");
      assert.deepStrictEqual(info.linkinfo, { kind: "bridge" });
      assert.strictEqual(info.flags.IFF_UP, true);
    });

    it("should create virtual links on a lower link", async () => {
      const { link } = createTestSetup();

      const created = await link.createLink({ name: "macvtap0", linkIndex: 2, linkinfo: { kind: "macvtap", data: { mode: "bridge" } } });

      const info = await created.fetch();
      assert.strictEqual(info.linkIndex, 2);
      assert.deepStrictEqual(info.linkinfo, { kind: "macvtap", data: { mode: "bridge" } });
      assert.deepStrictEqual(ifindexesOf({ links: await link.findAllBy({ linkinfo: { data: { mode: "bridge" } } }) }), [created.ifindex]);
      assert.deepStrictEqual(await link.findAllBy({ linkinfo: { data: { mode: "vepa" } } }), []);
    });

    it("should create links without flags", async () => {
      const { link } = createTestSetup();

      const created = await link.createLink({ linkinfo: { kind: "dummy" } });

      assert.strictEqual((await created.fetch()).flags.IFF_UP, false);
    });

    it("should retry if another link took the index", async () => {
      const { kernel, link } = createTestSetup();

      let raced = false;
      kernel.onBeforeCreate({
        callback: () => {
          if (!raced) {
            raced = true;
            kernel.addLink({ link: { ifindex: 3, type: 1, flags: 0n, name: "other" } });
          }
        },
      });

      const created = await link.createLink({ linkinfo: { kind: "dummy" } });

      assert.strictEqual(created.ifindex, 4);
    });

    it("should give up after repeated EEXIST, e.g. if the name is taken", async () => {
      const { kernel, link } = createTestSetup();

      await assert.rejects(link.createLink({ name: "eth0", linkinfo: { kind: "dummy" } }), /creating link failed with EEXIST/);

      const creations = kernel.requests().filter((request) => {
        return request.header.nlmsg_type === RTM_NEWLINK;
      });
      assert.strictEqual(creations.length, 3);
    });

    it("should not retry other errors", async () => {
      const { kernel, link } = createTestSetup();

      await assert.rejects(link.createLink({ linkinfo: { kind: "wireguard" } }), /creating link failed with EOPNOTSUPP/);
      assert.strictEqual(kernel.requests().length, 2);
    });
  });
});
