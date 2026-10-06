import {
  createErrorFromErrno,
  NLM_F_CREATE,
  NLM_F_DUMP,
  NLM_F_EXCL,
  NLM_F_MULTI,
  type TNetlinkMessage,
  type TTalkArgs
} from "node-netlink";
import { RTM_DELLINK, RTM_GETLINK, RTM_NEWLINK } from "../constants.ts";
import { formatIfinfoPayload, parseIfinfoPayload, type TIfinfomsg } from "../ifinfo.ts";
import {
  formatLinkAttributes,
  parseLinkAttributes,
  type TLinkAttributes
} from "../link-attributes.ts";
import type { TRtnetlinkNetlink } from "../rtnetlink.ts";
import { hostStructures } from "../structures.ts";

const structures = hostStructures;

const EEXIST = 17;
const ENODEV = 19;
const EOPNOTSUPP = 95;

type TFakeLink = TLinkAttributes & {
  ifindex: number;
  type: number;
  flags: bigint;
};

type TResult = {
  errno: number | undefined;
  messages: TNetlinkMessage[];
};

type TRequest = {
  ifi: TIfinfomsg;
  attributes: TLinkAttributes;
  flags: bigint;
};

const ok = ({ messages = [] }: { messages?: TNetlinkMessage[] } = {}): TResult => {
  return { errno: undefined, messages };
};

const fail = ({ errno }: { errno: number }): TResult => {
  return { errno, messages: [] };
};

/**
 * A fake rtnetlink kernel with an in-memory list of links, answering requests like the kernel does.
 */
// eslint-disable-next-line max-statements
const createFakeKernel = ({ links: initialLinks }: { links: TFakeLink[] }) => {
  let links = initialLinks;
  let requests: TTalkArgs[] = [];
  let injectedResults: TResult[] = [];
  let beforeCreate = () => {};

  const messageOf = ({ link, nlmsg_flags = 0n }: { link: TFakeLink, nlmsg_flags?: bigint }): TNetlinkMessage => {
    const { ifindex, type, flags, ...attributes } = link;

    return {
      header: { nlmsg_type: RTM_NEWLINK, nlmsg_flags, nlmsg_seq: 1n, nlmsg_pid: 4711n },
      payload: formatIfinfoPayload({
        ifi: { ifi_index: BigInt(ifindex), ifi_type: BigInt(type), ifi_flags: flags },
        rta: formatLinkAttributes({ attributes, structures }),
        structures,
      }),
    };
  };

  const findByIndex = ({ ifindex }: { ifindex: bigint }) => {
    return links.find((link) => {
      return BigInt(link.ifindex) === ifindex;
    });
  };

  const applyFlags = ({ link, ifi }: { link: TFakeLink, ifi: TIfinfomsg }) => {
    return (link.flags & ~ifi.ifi_change) | (ifi.ifi_flags & ifi.ifi_change);
  };

  const queryLink = ({ ifi, flags }: TRequest) => {
    if ((flags & NLM_F_DUMP) === NLM_F_DUMP) {
      return ok({
        messages: links.map((link) => {
          return messageOf({ link, nlmsg_flags: NLM_F_MULTI });
        }),
      });
    }

    const link = findByIndex({ ifindex: ifi.ifi_index });
    return link === undefined ? fail({ errno: ENODEV }) : ok({ messages: [messageOf({ link })] });
  };

  const isTaken = ({ ifi, attributes }: TRequest) => {
    return findByIndex({ ifindex: ifi.ifi_index }) !== undefined || links.some((link) => {
      return link.name === attributes.name;
    });
  };

  // only the kinds this fake knows can be created
  const creatableKinds = ["dummy", "bridge", "macvlan", "macvtap"];

  const isCreatable = ({ attributes }: TRequest) => {
    return creatableKinds.includes(attributes.linkinfo?.kind ?? "");
  };

  const creationErrno = (request: TRequest) => {
    if (isTaken(request)) {
      return EEXIST;
    }

    return isCreatable(request) ? undefined : EOPNOTSUPP;
  };

  const createLink = (request: TRequest) => {
    beforeCreate();

    const errno = creationErrno(request);
    if (errno !== undefined) {
      return fail({ errno });
    }

    const { ifi, attributes } = request;
    const created = { ifindex: Number(ifi.ifi_index), type: 1, name: `link${ifi.ifi_index}`, ...attributes, flags: 0n };
    links = [...links, { ...created, flags: applyFlags({ link: created, ifi }) }];

    return ok();
  };

  const changeLink = ({ ifi, attributes }: TRequest) => {
    const link = findByIndex({ ifindex: ifi.ifi_index });

    if (link === undefined) {
      return fail({ errno: ENODEV });
    }

    links = links.map((other) => {
      return other === link ? { ...link, ...attributes, flags: applyFlags({ link, ifi }) } : other;
    });

    return ok();
  };

  const newLink = (request: TRequest) => {
    if ((request.flags & NLM_F_CREATE) !== 0n && (request.flags & NLM_F_EXCL) !== 0n) {
      return createLink(request);
    }

    return changeLink(request);
  };

  const deleteLink = ({ ifi }: TRequest) => {
    if (findByIndex({ ifindex: ifi.ifi_index }) === undefined) {
      return fail({ errno: ENODEV });
    }

    links = links.filter((link) => {
      return BigInt(link.ifindex) !== ifi.ifi_index;
    });

    return ok();
  };

  const handlers: Record<string, (request: TRequest) => TResult> = {
    [RTM_GETLINK.toString()]: queryLink,
    [RTM_NEWLINK.toString()]: newLink,
    [RTM_DELLINK.toString()]: deleteLink,
  };

  const handle = (args: TTalkArgs): TResult => {
    requests = [...requests, args];

    const [injected, ...remaining] = injectedResults;
    if (injected !== undefined) {
      injectedResults = remaining;
      return injected;
    }

    const { ifi, rta } = parseIfinfoPayload({ payload: args.payload, structures });
    const { attributes } = parseLinkAttributes({ rta, structures });

    return handlers[args.header.nlmsg_type.toString()]({ ifi, attributes, flags: args.header.nlmsg_flags ?? 0n });
  };

  const netlink: TRtnetlinkNetlink = {
    tryTalk: async (args) => {
      return handle(args);
    },
    talk: async (args) => {
      const { errno, messages } = handle(args);

      if (errno !== undefined) {
        throw createErrorFromErrno({ operation: `netlink request of type ${args.header.nlmsg_type}`, errno });
      }

      return messages;
    },
  };

  return {
    netlink,

    links: () => {
      return links;
    },
    requests: () => {
      return requests;
    },
    // the next request is answered with this result instead of being handled
    injectResult: ({ result }: { result: TResult }) => {
      injectedResults = [...injectedResults, result];
    },
    // called before each link creation, e.g. to simulate a concurrent creation
    onBeforeCreate: ({ callback }: { callback: () => void }) => {
      beforeCreate = callback;
    },
    addLink: ({ link }: { link: TFakeLink }) => {
      links = [...links, link];
    },
  };
};

const loopback: TFakeLink = {
  ifindex: 1,
  type: 772,
  flags: 0x49n,
  name: "lo",
  mtu: 65_536,
  address: new Uint8Array(6),
};

const ethernet: TFakeLink = {
  ifindex: 2,
  type: 1,
  flags: 0x11043n,
  name: "eth0",
  mtu: 1500,
  address: Uint8Array.from([2, 0, 0, 0, 0, 1]),
  linkinfo: { kind: "veth" },
};

export {
  createFakeKernel,
  loopback,
  ethernet,
};

export type {
  TFakeLink,
};
