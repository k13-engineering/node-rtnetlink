import assert from "node:assert";
import { describe, it } from "mocha";
import { NLM_F_CREATE, NLM_F_DUMP, NLM_F_EXCL } from "node-netlink";
import {
  addressInfoOf,
  formatAddressFlags,
  parseAddressFlags,
  parseAddressMessage,
  type TAddressFlags
} from "./address.ts";
import {
  AF_INET,
  AF_INET6,
  AF_UNSPEC,
  IFA_ADDRESS,
  IFA_F_NODAD,
  IFA_F_NOPREFIXROUTE,
  IFA_FLAGS,
  IFA_LOCAL,
  RTM_GETADDR,
  RTM_NEWADDR,
  RTM_NEWLINK
} from "./constants.ts";
import { formatIfaddrPayload, parseIfaddrPayload } from "./ifaddr.ts";
import { parseIpAddress } from "./ip-address.ts";
import { u32Codec } from "./rtattr.ts";
import { createRtnetlink } from "./rtnetlink.ts";
import { hostStructures } from "./structures.ts";
import { createFakeKernel, ethernet, loopback } from "./test-support/fake-kernel.ts";

const structures = hostStructures;

const createTestSetup = () => {
  const kernel = createFakeKernel({ links: [loopback, ethernet] });
  const { address } = createRtnetlink({ netlink: kernel.netlink });
  return { kernel, address };
};

const lastRequest = ({ kernel }: { kernel: ReturnType<typeof createFakeKernel> }) => {
  const request = kernel.requests().at(-1);
  assert.ok(request !== undefined);

  return {
    header: request.header,
    ...parseIfaddrPayload({ payload: request.payload, structures }),
  };
};

const ipAttribute = ({ rta_type, address }: { rta_type: bigint, address: string }) => {
  return { rta_type, data: parseIpAddress({ address }).bytes };
};

const header = { nlmsg_type: RTM_NEWADDR, nlmsg_flags: 0n, nlmsg_seq: 0n, nlmsg_pid: 0n };

describe("address", () => {
  describe("add", () => {
    it("should add an IPv4 address", async () => {
      const { kernel, address } = createTestSetup();

      await address.add({ ifindex: 2, address: "192.0.2.10", prefixLength: 24 });

      const request = lastRequest({ kernel });
      assert.deepStrictEqual(request.header, { nlmsg_type: RTM_NEWADDR, nlmsg_flags: NLM_F_CREATE | NLM_F_EXCL });
      assert.deepStrictEqual(request.ifa, { ifa_family: AF_INET, ifa_prefixlen: 24n, ifa_flags: 0n, ifa_scope: 0n, ifa_index: 2n });
      assert.deepStrictEqual(request.rta, [
        ipAttribute({ rta_type: IFA_LOCAL, address: "192.0.2.10" }),
        ipAttribute({ rta_type: IFA_ADDRESS, address: "192.0.2.10" }),
        { rta_type: IFA_FLAGS, data: u32Codec.format({ value: 0, structures }) },
      ]);

      const [info] = await address.listAll();
      assert.strictEqual(info.ifindex, 2);
      assert.strictEqual(info.family, "inet");
      assert.strictEqual(info.address, "192.0.2.10");
      assert.strictEqual(info.prefixLength, 24);
      assert.strictEqual(info.scope, "universe");
      assert.strictEqual(info.peer, undefined);
      assert.strictEqual(info.flags.IFA_F_PERMANENT, false);
      assert.strictEqual(info.unknownAttributes.length, 1);
    });

    it("should add an IPv6 address with flags beyond the lower 8 bits", async () => {
      const { kernel, address } = createTestSetup();

      const flags = { IFA_F_NODAD: true, IFA_F_NOPREFIXROUTE: true };
      await address.add({ ifindex: 2, address: "2001:db8::2", prefixLength: 64, flags });

      const { ifa, rta } = lastRequest({ kernel });
      assert.strictEqual(ifa.ifa_family, AF_INET6);
      assert.strictEqual(ifa.ifa_flags, IFA_F_NODAD);
      const expectedFlags = u32Codec.format({ value: Number(IFA_F_NODAD | IFA_F_NOPREFIXROUTE), structures });
      assert.deepStrictEqual(rta.at(-1), { rta_type: IFA_FLAGS, data: expectedFlags });

      const [info] = await address.listAll();
      assert.strictEqual(info.family, "inet6");
      assert.strictEqual(info.address, "2001:db8::2");
      assert.strictEqual(info.prefixLength, 64);
      assert.strictEqual(info.flags.IFA_F_NODAD, true);
      assert.strictEqual(info.flags.IFA_F_NOPREFIXROUTE, true);
    });

    it("should add peer, broadcast, label and scope", async () => {
      const { address } = createTestSetup();

      await address.add({
        ifindex: 2,
        address: "10.0.0.1",
        prefixLength: 32,
        peer: "10.0.0.2",
        broadcast: "10.0.0.255",
        label: "eth0:1",
        scope: "link",
      });

      const [info] = await address.listAll();
      assert.strictEqual(info.address, "10.0.0.1");
      assert.strictEqual(info.peer, "10.0.0.2");
      assert.strictEqual(info.broadcast, "10.0.0.255");
      assert.strictEqual(info.label, "eth0:1");
      assert.strictEqual(info.scope, "link");
    });

    it("should reject duplicates and unknown links", async () => {
      const { address } = createTestSetup();

      await address.add({ ifindex: 2, address: "192.0.2.10", prefixLength: 24 });

      await assert.rejects(address.add({ ifindex: 2, address: "192.0.2.10", prefixLength: 24 }), /EEXIST/);
      await assert.rejects(address.add({ ifindex: 9, address: "192.0.2.11", prefixLength: 24 }), /ENODEV/);
    });

    const invalidArgs = [
      {
        description: "a prefix length beyond 32 for IPv4",
        args: { address: "192.0.2.1", prefixLength: 33 },
        error: /prefix length 33 is out of range \[0, 32\]/,
      },
      {
        description: "a prefix length beyond 128 for IPv6",
        args: { address: "::1", prefixLength: 129 },
        error: /prefix length 129 is out of range \[0, 128\]/,
      },
      { description: "a negative prefix length", args: { address: "192.0.2.1", prefixLength: -1 }, error: /out of range/ },
      { description: "a fractional prefix length", args: { address: "192.0.2.1", prefixLength: 1.5 }, error: /out of range/ },
      { description: "an invalid address", args: { address: "192.0.2", prefixLength: 24 }, error: /invalid IP address "192.0.2"/ },
      {
        description: "a peer of another family",
        args: { address: "192.0.2.1", prefixLength: 32, peer: "::1" },
        error: /address "::1" is not of family inet/,
      },
      {
        description: "unknown flags",
        args: { address: "192.0.2.1", prefixLength: 24, flags: { IFA_F_FOO: true } as TAddressFlags },
        error: /unknown address flag "IFA_F_FOO"/,
      },
    ];

    invalidArgs.forEach(({ description, args, error }) => {
      it(`should reject ${description}`, async () => {
        const { kernel, address } = createTestSetup();

        await assert.rejects(address.add({ ifindex: 2, ...args }), error);
        assert.deepStrictEqual(kernel.requests(), []);
      });
    });
  });

  describe("remove", () => {
    it("should remove an address", async () => {
      const { kernel, address } = createTestSetup();
      await address.add({ ifindex: 2, address: "2001:db8::2", prefixLength: 64 });

      await address.remove({ ifindex: 2, address: "2001:db8::2", prefixLength: 64 });

      const { ifa, rta } = lastRequest({ kernel });
      assert.deepStrictEqual(ifa, { ifa_family: AF_INET6, ifa_prefixlen: 64n, ifa_flags: 0n, ifa_scope: 0n, ifa_index: 2n });
      assert.deepStrictEqual(rta, [ipAttribute({ rta_type: IFA_LOCAL, address: "2001:db8::2" })]);
      assert.deepStrictEqual(await address.listAll(), []);
    });

    it("should reject addresses that do not exist", async () => {
      const { address } = createTestSetup();

      await assert.rejects(address.remove({ ifindex: 2, address: "192.0.2.1", prefixLength: 24 }), /EADDRNOTAVAIL/);
    });

    it("should reject invalid prefix lengths", async () => {
      const { address } = createTestSetup();

      await assert.rejects(address.remove({ ifindex: 2, address: "192.0.2.1", prefixLength: 40 }), /out of range/);
    });
  });

  describe("listAll", () => {
    it("should dump the addresses of all families", async () => {
      const { kernel, address } = createTestSetup();

      await address.listAll();

      const { header: requestHeader, ifa } = lastRequest({ kernel });
      assert.deepStrictEqual(requestHeader, { nlmsg_type: RTM_GETADDR, nlmsg_flags: NLM_F_DUMP });
      assert.strictEqual(ifa.ifa_family, AF_UNSPEC);
    });

    it("should filter by family and link", async () => {
      const { address } = createTestSetup();
      await address.add({ ifindex: 1, address: "127.0.0.2", prefixLength: 8 });
      await address.add({ ifindex: 2, address: "192.0.2.10", prefixLength: 24 });
      await address.add({ ifindex: 2, address: "2001:db8::2", prefixLength: 64 });

      const addressesOf = async (args: Parameters<typeof address.listAll>[0]) => {
        return (await address.listAll(args)).map((info) => {
          return info.address;
        });
      };

      assert.deepStrictEqual(await addressesOf({ family: "inet6" }), ["2001:db8::2"]);
      assert.deepStrictEqual(await addressesOf({ ifindex: 2 }), ["192.0.2.10", "2001:db8::2"]);
      assert.deepStrictEqual(await addressesOf({ ifindex: 1, family: "inet" }), ["127.0.0.2"]);
    });
  });

  describe("talk and tryTalk", () => {
    it("should resolve with the errno of the kernel", async () => {
      const { address } = createTestSetup();

      const ifa = { ifa_family: AF_INET, ifa_prefixlen: 24n, ifa_index: 2n };
      const rta = [ipAttribute({ rta_type: IFA_LOCAL, address: "192.0.2.1" })];

      assert.deepStrictEqual(await address.tryTalk({ header: { nlmsg_type: 21n }, ifa, rta }), { errno: 99, messages: [] });
    });

    it("should reject requests of other message types", async () => {
      const { address } = createTestSetup();

      await assert.rejects(
        address.talk({ header: { nlmsg_type: RTM_NEWLINK }, ifa: {} }),
        /unsupported message type 16, only address messages are supported/,
      );
    });

    it("should reject responses of other message types", async () => {
      const { kernel, address } = createTestSetup();

      const linkMessage = { header: { ...header, nlmsg_type: RTM_NEWLINK }, payload: new Uint8Array(16) };
      kernel.injectResult({ result: { errno: undefined, messages: [linkMessage] } });

      await assert.rejects(address.listAll(), /unexpected response of type 16/);
    });
  });

  describe("parseAddressMessage", () => {
    it("should parse address notifications", () => {
      const payload = formatIfaddrPayload({ ifa: { ifa_family: AF_INET, ifa_index: 2n }, structures });

      const message = parseAddressMessage({ message: { header, payload } });

      assert.strictEqual(message?.ifa.ifa_index, 2n);
    });

    it("should return undefined for other messages", () => {
      const message = { header: { ...header, nlmsg_type: RTM_NEWLINK }, payload: new Uint8Array(0) };
      assert.strictEqual(parseAddressMessage({ message }), undefined);
    });
  });

  describe("addressInfoOf", () => {
    it("should take the flags from ifa_flags without IFA_FLAGS and report scopes without name as number", () => {
      const info = addressInfoOf({
        message: {
          header,
          ifa: { ifa_family: AF_INET6, ifa_prefixlen: 128n, ifa_flags: 0x80n, ifa_scope: 42n, ifa_index: 1n },
          rta: [ipAttribute({ rta_type: IFA_ADDRESS, address: "::1" })],
        },
      });

      assert.deepStrictEqual({ ...info, flags: undefined }, {
        ifindex: 1,
        family: "inet6",
        address: "::1",
        prefixLength: 128,
        scope: 42,
        flags: undefined,
        unknownAttributes: [],
      });
      assert.strictEqual(info.flags.IFA_F_PERMANENT, true);
    });
  });

  describe("address flags", () => {
    it("should format and parse flags", () => {
      const bits = formatAddressFlags({ flags: { IFA_F_NODAD: true, IFA_F_PERMANENT: false, IFA_F_STABLE_PRIVACY: true } });

      assert.strictEqual(bits, 0x802n);

      const flags = parseAddressFlags({ bits });
      assert.strictEqual(Object.keys(flags).length, 13);
      assert.strictEqual(flags.IFA_F_NODAD, true);
      assert.strictEqual(flags.IFA_F_STABLE_PRIVACY, true);
      assert.strictEqual(flags.IFA_F_PERMANENT, false);
    });

    it("should report IFA_F_SECONDARY and IFA_F_TEMPORARY for the same bit", () => {
      const flags = parseAddressFlags({ bits: formatAddressFlags({ flags: { IFA_F_TEMPORARY: true } }) });

      assert.strictEqual(flags.IFA_F_SECONDARY, true);
      assert.strictEqual(flags.IFA_F_TEMPORARY, true);
    });
  });
});
