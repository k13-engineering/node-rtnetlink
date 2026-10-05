import assert from "node:assert";
import { describe, it } from "mocha";
import { NLM_F_DUMP } from "node-netlink";
import { AF_PACKET, IFLA_IFNAME, RTM_GETLINK, RTM_NEWLINK } from "./constants.ts";
import { formatIfinfoPayload, parseIfinfoPayload } from "./ifinfo.ts";
import { createRtnetlink, isLinkMessageType, parseLinkMessage } from "./rtnetlink.ts";
import { stringCodec } from "./rtattr.ts";
import { hostStructures } from "./structures.ts";
import { createFakeKernel, ethernet, loopback } from "./test-support/fake-kernel.ts";

const structures = hostStructures;

const RTM_NEWADDR = 20n;

const createTestSetup = () => {
  const kernel = createFakeKernel({ links: [loopback, ethernet] });
  const rt = createRtnetlink({ netlink: kernel.netlink });
  return { kernel, rt };
};

describe("rtnetlink", () => {
  describe("talk", () => {
    it("should format the request", async () => {
      const { kernel, rt } = createTestSetup();

      const rta = [{ rta_type: IFLA_IFNAME, data: stringCodec.format({ value: "lo", structures }) }];
      await rt.talk({ header: { nlmsg_type: RTM_GETLINK }, ifi: { ifi_family: AF_PACKET, ifi_index: 1n }, rta, timeoutMs: 50 });

      const [request] = kernel.requests();
      assert.deepStrictEqual(request.header, { nlmsg_type: RTM_GETLINK });
      assert.strictEqual(request.timeoutMs, 50);
      assert.deepStrictEqual(parseIfinfoPayload({ payload: request.payload, structures }), {
        ifi: { ifi_family: AF_PACKET, ifi_type: 0n, ifi_index: 1n, ifi_flags: 0n, ifi_change: 0n },
        rta,
      });
    });

    it("should parse the responses", async () => {
      const { rt } = createTestSetup();

      const messages = await rt.talk({ header: { nlmsg_type: RTM_GETLINK, nlmsg_flags: NLM_F_DUMP }, ifi: {} });

      assert.deepStrictEqual(messages.map(({ header, ifi }) => {
        return [header.nlmsg_type, ifi.ifi_index];
      }), [[RTM_NEWLINK, 1n], [RTM_NEWLINK, 2n]]);
      assert.deepStrictEqual(messages[0].rta[0], { rta_type: IFLA_IFNAME, data: stringCodec.format({ value: "lo", structures }) });
    });

    it("should reject with the errno of the kernel", async () => {
      const { rt } = createTestSetup();

      await assert.rejects(rt.talk({ header: { nlmsg_type: RTM_GETLINK }, ifi: { ifi_index: 99n } }), /failed with ENODEV/);
    });

    it("should reject requests of other message types", async () => {
      const { kernel, rt } = createTestSetup();

      await assert.rejects(rt.talk({ header: { nlmsg_type: RTM_NEWADDR }, ifi: {} }), /unsupported rtnetlink message type 20/);
      assert.deepStrictEqual(kernel.requests(), []);
    });

    it("should reject responses of other message types", async () => {
      const { kernel, rt } = createTestSetup();

      kernel.injectResult({
        result: {
          errno: undefined,
          messages: [{ header: { nlmsg_type: RTM_NEWADDR, nlmsg_flags: 0n, nlmsg_seq: 1n, nlmsg_pid: 1n }, payload: new Uint8Array(8) }],
        },
      });

      await assert.rejects(rt.talk({ header: { nlmsg_type: RTM_GETLINK }, ifi: {} }), /unexpected response of type 20/);
    });
  });

  describe("tryTalk", () => {
    it("should resolve with the errno of the kernel", async () => {
      const { rt } = createTestSetup();

      assert.deepStrictEqual(await rt.tryTalk({ header: { nlmsg_type: RTM_GETLINK }, ifi: { ifi_index: 99n } }), {
        errno: 19,
        messages: [],
      });
    });

    it("should resolve with the parsed responses", async () => {
      const { rt } = createTestSetup();

      const { errno, messages } = await rt.tryTalk({ header: { nlmsg_type: RTM_GETLINK }, ifi: { ifi_index: 2n } });

      assert.strictEqual(errno, undefined);
      assert.strictEqual(messages[0].ifi.ifi_index, 2n);
    });
  });

  describe("isLinkMessageType", () => {
    it("should detect link messages", () => {
      assert.deepStrictEqual([16n, 17n, 18n, 19n, 20n].map((nlmsg_type) => {
        return isLinkMessageType({ nlmsg_type });
      }), [true, true, true, true, false]);
    });
  });

  describe("parseLinkMessage", () => {
    const header = { nlmsg_type: RTM_NEWLINK, nlmsg_flags: 0n, nlmsg_seq: 0n, nlmsg_pid: 0n };

    it("should parse link notifications", () => {
      const payload = formatIfinfoPayload({ ifi: { ifi_index: 3n }, structures });

      const message = parseLinkMessage({ message: { header, payload } });

      assert.strictEqual(message?.header, header);
      assert.strictEqual(message?.ifi.ifi_index, 3n);
      assert.deepStrictEqual(message?.rta, []);
    });

    it("should return undefined for other messages", () => {
      const message = { header: { ...header, nlmsg_type: RTM_NEWADDR }, payload: new Uint8Array(0) };
      assert.strictEqual(parseLinkMessage({ message }), undefined);
    });
  });
});
