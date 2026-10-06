import { isDeepStrictEqual } from "node:util";
import { createErrorFromErrno, NLM_F_CREATE, NLM_F_DUMP, NLM_F_EXCL } from "node-netlink";
import {
  AF_PACKET,
  AF_UNSPEC,
  IFLA_NET_NS_FD,
  IFLA_NET_NS_PID,
  RTM_DELLINK,
  RTM_GETLINK,
  RTM_NEWLINK
} from "./constants.ts";
import {
  formatLinkAttributes,
  parseLinkAttributes,
  type TLinkAttributes
} from "./link-attributes.ts";
import {
  formatLinkFlags,
  parseLinkFlags,
  type TLinkFlagName,
  type TLinkFlags
} from "./link-flags.ts";
import { u32Codec, type TRtattr } from "./rtattr.ts";
import type { TLinkMessage, TLinkRequest, TLinkTryTalkResult } from "./rtnetlink.ts";
import type { TRtnetlinkStructures } from "./structures.ts";

const EEXIST = 17;

const MAX_CREATE_ATTEMPTS = 3;

type TLinkInfo = TLinkAttributes & {
  ifindex: number;
  // the hardware type of the link, ARPHRD_* of <linux/if_arp.h>
  type: number;
  flags: Record<TLinkFlagName, boolean>;
  // attributes node-rtnetlink has no definition for
  unknownAttributes: TRtattr[];
};

// a network namespace, given by a file descriptor referring to it, e.g. an open /proc/<pid>/ns/net,
// or by the pid of a process in it
type TNetns = { fd: number } | { pid: number };

type TLink = {
  ifindex: number;
  // fetches the current state of the link, rejects with ENODEV if it does not exist (anymore)
  fetch: () => Promise<TLinkInfo>;
  // changes the given flags and attributes of the link
  modify: (args: TLinkAttributes & { flags?: TLinkFlags }) => Promise<void>;
  // deletes the link
  deleteLink: () => Promise<void>;
  // moves the link into another network namespace, where it may get another index, the link is gone from this one afterwards
  moveToNamespace: (args: { netns: TNetns }) => Promise<void>;
};

type TLinkCriteria = TLinkAttributes & {
  type?: number;
  flags?: TLinkFlags;
};

type TLinkApi = {
  fromIndex: (args: { ifindex: number }) => TLink;
  listAll: () => Promise<TLinkInfo[]>;
  findAllBy: (criteria: TLinkCriteria) => Promise<TLink[]>;
  tryFindOneBy: (criteria: TLinkCriteria) => Promise<TLink | undefined>;
  findOneBy: (criteria: TLinkCriteria) => Promise<TLink>;
  createLink: (args: TLinkAttributes & { flags?: TLinkFlags }) => Promise<TLink>;
  // creates a link directly in another network namespace, where the kernel picks its index, so it is found by its name there
  createLinkInNamespace: (args: TLinkAttributes & { netns: TNetns, name: string, flags?: TLinkFlags }) => Promise<void>;
};

type TLinkRt = {
  talk: (request: TLinkRequest) => Promise<TLinkMessage[]>;
  tryTalk: (request: TLinkRequest) => Promise<TLinkTryTalkResult>;
};

const linkInfoOf = ({ message, structures }: { message: TLinkMessage, structures: TRtnetlinkStructures }): TLinkInfo => {
  const { attributes, unknown } = parseLinkAttributes({ rta: message.rta, structures });

  return {
    ifindex: Number(message.ifi.ifi_index),
    type: Number(message.ifi.ifi_type),
    flags: parseLinkFlags({ ifi_flags: message.ifi.ifi_flags }),
    ...attributes,
    unknownAttributes: unknown,
  };
};

// linkinfo matches if all given fields match, all other attributes must be equal
const attributeMatches = ({ name, expected, actual }: { name: string, expected: unknown, actual: unknown }) => {
  if (name !== "linkinfo") {
    return isDeepStrictEqual(actual, expected);
  }

  return Object.entries(expected as object).every(([key, value]) => {
    return isDeepStrictEqual((actual as Record<string, unknown> | undefined)?.[key], value);
  });
};

const flagsMatch = ({ info, flags }: { info: TLinkInfo, flags: TLinkFlags }) => {
  return Object.entries(flags).every(([name, expected]) => {
    return info.flags[name as TLinkFlagName] === expected;
  });
};

const linkMatches = ({ info, criteria }: { info: TLinkInfo, criteria: TLinkCriteria }) => {
  const { flags = {}, ...fields } = criteria;

  return flagsMatch({ info, flags }) && Object.entries(fields).every(([name, expected]) => {
    return expected === undefined || attributeMatches({ name, expected, actual: info[name as keyof TLinkInfo] });
  });
};

// spelled out, as the declaration files are generated per file and could not infer the types of async functions
const netnsAttribute = ({ netns, structures }: { netns: TNetns, structures: TRtnetlinkStructures }): TRtattr => {
  if ("fd" in netns) {
    return { rta_type: IFLA_NET_NS_FD, data: u32Codec.format({ value: netns.fd, structures }) };
  }

  return { rta_type: IFLA_NET_NS_PID, data: u32Codec.format({ value: netns.pid, structures }) };
};

const createLinkApi = ({ rt, structures }: { rt: TLinkRt, structures: TRtnetlinkStructures }): TLinkApi => {

  const fromIndex = ({ ifindex }: { ifindex: number }): TLink => {
    const fetch = async () => {
      const [message] = await rt.talk({
        header: { nlmsg_type: RTM_GETLINK },
        ifi: { ifi_family: AF_PACKET, ifi_index: BigInt(ifindex) },
      });

      return linkInfoOf({ message, structures });
    };

    const modify: TLink["modify"] = async ({ flags = {}, ...attributes }) => {
      await rt.talk({
        header: { nlmsg_type: RTM_NEWLINK },
        ifi: { ifi_family: AF_UNSPEC, ifi_index: BigInt(ifindex), ...formatLinkFlags({ flags }) },
        rta: formatLinkAttributes({ attributes, structures }),
      });
    };

    const deleteLink = async () => {
      await rt.talk({
        header: { nlmsg_type: RTM_DELLINK },
        ifi: { ifi_family: AF_UNSPEC, ifi_index: BigInt(ifindex) },
      });
    };

    const moveToNamespace: TLink["moveToNamespace"] = async ({ netns }) => {
      await rt.talk({
        header: { nlmsg_type: RTM_NEWLINK },
        ifi: { ifi_family: AF_UNSPEC, ifi_index: BigInt(ifindex) },
        rta: [netnsAttribute({ netns, structures })],
      });
    };

    return {
      ifindex,
      fetch,
      modify,
      deleteLink,
      moveToNamespace,
    };
  };

  /**
   * Fetches all links of the network namespace.
   */
  const listAll = async () => {
    const messages = await rt.talk({
      header: { nlmsg_type: RTM_GETLINK, nlmsg_flags: NLM_F_DUMP },
      ifi: { ifi_family: AF_PACKET },
    });

    return messages.map((message) => {
      return linkInfoOf({ message, structures });
    });
  };

  /**
   * Finds all links whose flags, type and attributes match the given ones.
   */
  const findAllBy = async (criteria: TLinkCriteria) => {
    const infos = await listAll();

    return infos.filter((info) => {
      return linkMatches({ info, criteria });
    }).map(({ ifindex }) => {
      return fromIndex({ ifindex });
    });
  };

  /**
   * Like findAllBy(), but resolves with the only matching link, or undefined if there is none or more than one.
   */
  const tryFindOneBy = async (criteria: TLinkCriteria) => {
    const links = await findAllBy(criteria);
    return links.length === 1 ? links[0] : undefined;
  };

  /**
   * Like findAllBy(), but resolves with the only matching link and rejects if there is none or more than one.
   */
  const findOneBy = async (criteria: TLinkCriteria) => {
    const links = await findAllBy(criteria);

    if (links.length !== 1) {
      throw Error(`expected exactly one matching link, found ${links.length}`);
    }

    return links[0];
  };

  const highestIfindex = async () => {
    const infos = await listAll();

    return infos.reduce((highest, { ifindex }) => {
      return Math.max(highest, ifindex);
    }, 0);
  };

  const tryCreateWithIndex = async ({ ifindex, flags, attributes }: {
    ifindex: number,
    flags: TLinkFlags,
    attributes: TLinkAttributes,
  }) => {
    const { errno } = await rt.tryTalk({
      header: { nlmsg_type: RTM_NEWLINK, nlmsg_flags: NLM_F_CREATE | NLM_F_EXCL },
      ifi: { ifi_family: AF_UNSPEC, ifi_index: BigInt(ifindex), ...formatLinkFlags({ flags }) },
      rta: formatLinkAttributes({ attributes, structures }),
    });

    return errno;
  };

  const createWithRetries = async ({ attemptsLeft, flags, attributes }: {
    attemptsLeft: number,
    flags: TLinkFlags,
    attributes: TLinkAttributes,
  }): Promise<TLink> => {
    const ifindex = (await highestIfindex()) + 1;
    const errno = await tryCreateWithIndex({ ifindex, flags, attributes });

    if (errno === undefined) {
      return fromIndex({ ifindex });
    }

    // EEXIST also means that the name is taken, so retries are limited
    if (errno !== EEXIST || attemptsLeft <= 1) {
      throw createErrorFromErrno({ operation: "creating link", errno });
    }

    return createWithRetries({ attemptsLeft: attemptsLeft - 1, flags, attributes });
  };

  /**
   * Creates a link, e.g. `{ linkinfo: { kind: "bridge" } }`.
   *
   * The kernel does not report the index of a new link, so the next free index is requested
   * explicitly. If another link took it in the meantime, creation is retried.
   */
  const createLink = async ({ flags = {}, ...attributes }: TLinkAttributes & { flags?: TLinkFlags }) => {
    return createWithRetries({ attemptsLeft: MAX_CREATE_ATTEMPTS, flags, attributes });
  };

  const createLinkInNamespace: TLinkApi["createLinkInNamespace"] = async ({ netns, flags = {}, ...attributes }) => {
    await rt.talk({
      header: { nlmsg_type: RTM_NEWLINK, nlmsg_flags: NLM_F_CREATE | NLM_F_EXCL },
      ifi: { ifi_family: AF_UNSPEC, ...formatLinkFlags({ flags }) },
      rta: [...formatLinkAttributes({ attributes, structures }), netnsAttribute({ netns, structures })],
    });
  };

  return {
    fromIndex,
    listAll,
    findAllBy,
    tryFindOneBy,
    findOneBy,
    createLink,
    createLinkInNamespace,
  };
};

export {
  createLinkApi,
};

export type {
  TNetns,
  TLink,
  TLinkApi,
  TLinkInfo,
  TLinkCriteria,
};
