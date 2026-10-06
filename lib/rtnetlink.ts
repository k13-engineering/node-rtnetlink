import type { TNetlinkHeader, TNetlinkMessage, TNetlinkSocket } from "node-netlink";
import { RTM_DELLINK, RTM_GETLINK, RTM_NEWLINK, RTM_SETLINK } from "./constants.ts";
import { formatIfinfoPayload, parseIfinfoPayload, type TIfinfomsg } from "./ifinfo.ts";
import { createLinkApi, type TLinkApi } from "./link.ts";
import type { TRtattr } from "./rtattr.ts";
import { hostStructures, type TRtnetlinkStructures } from "./structures.ts";

// the part of a node-netlink socket that rtnetlink uses
type TRtnetlinkNetlink = Pick<TNetlinkSocket, "talk" | "tryTalk">;

type TLinkMessage = {
  header: TNetlinkHeader;
  ifi: TIfinfomsg;
  rta: TRtattr[];
};

type TLinkRequest = {
  header: {
    nlmsg_type: bigint;
    nlmsg_flags?: bigint;
  };
  ifi: Partial<TIfinfomsg>;
  rta?: TRtattr[];
  timeoutMs?: number;
};

type TLinkTryTalkResult = {
  errno: number | undefined;
  messages: TLinkMessage[];
};

type TRtnetlink = {
  // sends a link request and resolves with the responses, rejects if the kernel reports an error
  talk: (request: TLinkRequest) => Promise<TLinkMessage[]>;
  // like talk(), but resolves with the errno reported by the kernel instead of rejecting
  tryTalk: (request: TLinkRequest) => Promise<TLinkTryTalkResult>;
  link: TLinkApi;
};

const linkMessageTypes = [RTM_NEWLINK, RTM_DELLINK, RTM_GETLINK, RTM_SETLINK];

const isLinkMessageType = ({ nlmsg_type }: { nlmsg_type: bigint }): boolean => {
  return linkMessageTypes.includes(nlmsg_type);
};

/**
 * Parses a link message, e.g. a notification received via onMessage of node-netlink.
 * Returns undefined for messages of other types.
 */
const parseLinkMessage = ({ message, structures = hostStructures }: {
  message: TNetlinkMessage,
  structures?: TRtnetlinkStructures,
}): TLinkMessage | undefined => {
  if (!isLinkMessageType({ nlmsg_type: message.header.nlmsg_type })) {
    return undefined;
  }

  const { ifi, rta } = parseIfinfoPayload({ payload: message.payload, structures });
  return { header: message.header, ifi, rta };
};

const createRtnetlink = ({ netlink, structures = hostStructures }: {
  netlink: TRtnetlinkNetlink,
  structures?: TRtnetlinkStructures,
}): TRtnetlink => {

  const toNetlinkRequest = ({ header, ifi, rta, timeoutMs }: TLinkRequest) => {
    if (!isLinkMessageType({ nlmsg_type: header.nlmsg_type })) {
      throw Error(`unsupported rtnetlink message type ${header.nlmsg_type}, only link messages are supported`);
    }

    return {
      header,
      payload: formatIfinfoPayload({ ifi, rta, structures }),
      timeoutMs,
    };
  };

  const toLinkMessage = ({ message }: { message: TNetlinkMessage }) => {
    const linkMessage = parseLinkMessage({ message, structures });

    if (linkMessage === undefined) {
      throw Error(`unexpected response of type ${message.header.nlmsg_type}`);
    }

    return linkMessage;
  };

  const toLinkMessages = ({ messages }: { messages: TNetlinkMessage[] }) => {
    return messages.map((message) => {
      return toLinkMessage({ message });
    });
  };

  /**
   * Sends a link request and resolves with the responses, rejects if the kernel reports an error.
   */
  const talk = async (request: TLinkRequest): Promise<TLinkMessage[]> => {
    const messages = await netlink.talk(toNetlinkRequest(request));
    return toLinkMessages({ messages });
  };

  /**
   * Like talk(), but resolves with the errno reported by the kernel instead of rejecting.
   */
  const tryTalk = async (request: TLinkRequest): Promise<TLinkTryTalkResult> => {
    const { errno, messages } = await netlink.tryTalk(toNetlinkRequest(request));
    return { errno, messages: toLinkMessages({ messages }) };
  };

  return {
    talk,
    tryTalk,
    link: createLinkApi({ rt: { talk, tryTalk }, structures }),
  };
};

export {
  createRtnetlink,
  parseLinkMessage,
  isLinkMessageType,
};

export type {
  TRtnetlink,
  TRtnetlinkNetlink,
  TLinkMessage,
  TLinkRequest,
  TLinkTryTalkResult,
};
