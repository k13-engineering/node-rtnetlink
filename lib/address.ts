import { NLM_F_CREATE, NLM_F_DUMP, NLM_F_EXCL } from "node-netlink";
import type { TNetlinkHeader, TNetlinkMessage } from "node-netlink";
import {
  AF_INET,
  AF_INET6,
  AF_UNSPEC,
  IFA_ADDRESS,
  IFA_BROADCAST,
  IFA_F_DADFAILED,
  IFA_F_DEPRECATED,
  IFA_F_HOMEADDRESS,
  IFA_F_MANAGETEMPADDR,
  IFA_F_MCAUTOJOIN,
  IFA_F_NODAD,
  IFA_F_NOPREFIXROUTE,
  IFA_F_OPTIMISTIC,
  IFA_F_PERMANENT,
  IFA_F_SECONDARY,
  IFA_F_STABLE_PRIVACY,
  IFA_F_TEMPORARY,
  IFA_F_TENTATIVE,
  IFA_FLAGS,
  IFA_LABEL,
  IFA_LOCAL,
  RT_SCOPE_HOST,
  RT_SCOPE_LINK,
  RT_SCOPE_NOWHERE,
  RT_SCOPE_SITE,
  RT_SCOPE_UNIVERSE,
  RTM_DELADDR,
  RTM_GETADDR,
  RTM_NEWADDR
} from "./constants.ts";
import { formatIfaddrPayload, parseIfaddrPayload, type TIfaddrmsg } from "./ifaddr.ts";
import {
  formatIpAddress,
  parseIpAddress,
  type TAddressFamily,
  type TIpAddress
} from "./ip-address.ts";
import {
  bytesCodec,
  stringCodec,
  typeOfAttribute,
  u32Codec,
  type TRtattr
} from "./rtattr.ts";
import type { TRtnetlinkNetlink } from "./rtnetlink.ts";
import { hostStructures, type TRtnetlinkStructures } from "./structures.ts";

// spelled out, as the declaration files are generated per file and could not infer the types of the imported values
type TAddressFlagName =
  "IFA_F_SECONDARY" | "IFA_F_TEMPORARY" | "IFA_F_NODAD" | "IFA_F_OPTIMISTIC" | "IFA_F_DADFAILED" | "IFA_F_HOMEADDRESS" |
  "IFA_F_DEPRECATED" | "IFA_F_TENTATIVE" | "IFA_F_PERMANENT" | "IFA_F_MANAGETEMPADDR" | "IFA_F_NOPREFIXROUTE" |
  "IFA_F_MCAUTOJOIN" | "IFA_F_STABLE_PRIVACY";

// flags to set, IFA_F_SECONDARY and IFA_F_TEMPORARY are the same bit, which means temporary for IPv6
type TAddressFlags = Partial<Record<TAddressFlagName, boolean>>;

type TAddressScopeName = "universe" | "site" | "link" | "host" | "nowhere";

type TAddressMessage = {
  header: TNetlinkHeader;
  ifa: TIfaddrmsg;
  rta: TRtattr[];
};

type TAddressRequest = {
  header: {
    nlmsg_type: bigint;
    nlmsg_flags?: bigint;
  };
  ifa: Partial<TIfaddrmsg>;
  rta?: TRtattr[];
  timeoutMs?: number;
};

type TAddressTryTalkResult = {
  errno: number | undefined;
  messages: TAddressMessage[];
};

type TAddressInfo = {
  ifindex: number;
  family: TAddressFamily;
  // the address of the interface, IFA_LOCAL or for IPv6 IFA_ADDRESS
  address: string;
  prefixLength: number;
  // the other end of a point-to-point link, if IFA_ADDRESS differs from IFA_LOCAL
  peer?: string;
  broadcast?: string;
  label?: string;
  // a scope name, or the number of scopes without one
  scope: TAddressScopeName | number;
  flags: Record<TAddressFlagName, boolean>;
  // attributes node-rtnetlink has no definition for, e.g. IFA_CACHEINFO
  unknownAttributes: TRtattr[];
};

type TAddAddressArgs = {
  ifindex: number;
  // e.g. "192.0.2.1" or "2001:db8::1"
  address: string;
  prefixLength: number;
  // the other end of a point-to-point link
  peer?: string;
  broadcast?: string;
  label?: string;
  // "universe" if omitted
  scope?: TAddressScopeName;
  flags?: TAddressFlags;
};

type TAddressApi = {
  // assigns an address to a link, the kernel adds the route to its subnet
  add: (args: TAddAddressArgs) => Promise<void>;
  // removes an address from a link
  remove: (args: { ifindex: number, address: string, prefixLength: number }) => Promise<void>;
  // fetches the addresses of all links, or of the given link and family
  listAll: (args?: { ifindex?: number, family?: TAddressFamily }) => Promise<TAddressInfo[]>;

  // sends an address request and resolves with the responses, rejects if the kernel reports an error
  talk: (request: TAddressRequest) => Promise<TAddressMessage[]>;
  // like talk(), but resolves with the errno reported by the kernel instead of rejecting
  tryTalk: (request: TAddressRequest) => Promise<TAddressTryTalkResult>;
};

const addressFlagValues: Record<TAddressFlagName, bigint> = {
  IFA_F_SECONDARY,
  IFA_F_TEMPORARY,
  IFA_F_NODAD,
  IFA_F_OPTIMISTIC,
  IFA_F_DADFAILED,
  IFA_F_HOMEADDRESS,
  IFA_F_DEPRECATED,
  IFA_F_TENTATIVE,
  IFA_F_PERMANENT,
  IFA_F_MANAGETEMPADDR,
  IFA_F_NOPREFIXROUTE,
  IFA_F_MCAUTOJOIN,
  IFA_F_STABLE_PRIVACY,
};

const scopeValues: Record<TAddressScopeName, bigint> = {
  universe: RT_SCOPE_UNIVERSE,
  site: RT_SCOPE_SITE,
  link: RT_SCOPE_LINK,
  host: RT_SCOPE_HOST,
  nowhere: RT_SCOPE_NOWHERE,
};

const familyValues: Record<TAddressFamily, bigint> = {
  inet: AF_INET,
  inet6: AF_INET6,
};

const addressMessageTypes = [RTM_NEWADDR, RTM_DELADDR, RTM_GETADDR];

const isAddressMessageType = ({ nlmsg_type }: { nlmsg_type: bigint }): boolean => {
  return addressMessageTypes.includes(nlmsg_type);
};

/**
 * Turns flags into the bits of IFA_FLAGS, throws for unknown flags.
 */
const formatAddressFlags = ({ flags }: { flags: TAddressFlags }): bigint => {
  return Object.entries(flags).reduce((bits, [name, set]) => {
    if (!Object.hasOwn(addressFlagValues, name)) {
      throw Error(`unknown address flag "${name}"`);
    }

    return set ? bits | addressFlagValues[name as TAddressFlagName] : bits;
  }, 0n);
};

/**
 * Turns the bits of IFA_FLAGS into an object with all known flags.
 */
const parseAddressFlags = ({ bits }: { bits: bigint }): Record<TAddressFlagName, boolean> => {
  return Object.fromEntries(Object.entries(addressFlagValues).map(([name, value]) => {
    return [name, (bits & value) !== 0n];
  })) as Record<TAddressFlagName, boolean>;
};

const scopeName = ({ value }: { value: bigint }): TAddressScopeName | number => {
  const name = (Object.keys(scopeValues) as TAddressScopeName[]).find((candidate) => {
    return scopeValues[candidate] === value;
  });

  return name ?? Number(value);
};

const familyName = ({ value }: { value: bigint }): TAddressFamily => {
  return value === AF_INET ? "inet" : "inet6";
};

/**
 * Parses an address message, e.g. a notification received via onMessage of node-netlink.
 * Returns undefined for messages of other types.
 */
const parseAddressMessage = ({ message, structures = hostStructures }: {
  message: TNetlinkMessage,
  structures?: TRtnetlinkStructures,
}): TAddressMessage | undefined => {
  if (!isAddressMessageType({ nlmsg_type: message.header.nlmsg_type })) {
    return undefined;
  }

  const { ifa, rta } = parseIfaddrPayload({ payload: message.payload, structures });
  return { header: message.header, ifa, rta };
};

const knownAttributeTypes = [IFA_ADDRESS, IFA_LOCAL, IFA_BROADCAST, IFA_LABEL, IFA_FLAGS];

// the attributes of an address message by type, and the ones without definition
const attributesOf = ({ rta }: { rta: TRtattr[] }) => {
  const find = ({ rta_type }: { rta_type: bigint }) => {
    return rta.find((attribute) => {
      return typeOfAttribute({ attribute }) === rta_type;
    });
  };

  return {
    address: find({ rta_type: IFA_ADDRESS }),
    local: find({ rta_type: IFA_LOCAL }),
    broadcast: find({ rta_type: IFA_BROADCAST }),
    label: find({ rta_type: IFA_LABEL }),
    flags: find({ rta_type: IFA_FLAGS }),
    unknown: rta.filter((attribute) => {
      return !knownAttributeTypes.includes(typeOfAttribute({ attribute }));
    }),
  };
};

const optionalIp = ({ attribute }: { attribute: TRtattr | undefined }) => {
  return attribute === undefined ? undefined : formatIpAddress({ bytes: attribute.data });
};

const optionalString = ({ attribute, structures }: { attribute: TRtattr | undefined, structures: TRtnetlinkStructures }) => {
  return attribute === undefined ? undefined : stringCodec.parse({ data: attribute.data, structures });
};

// IFA_FLAGS holds all flags, ifa_flags only the lower 8 bits, for kernels without IFA_FLAGS
const flagBitsOf = ({ ifa, attribute, structures }: {
  ifa: TIfaddrmsg,
  attribute: TRtattr | undefined,
  structures: TRtnetlinkStructures,
}) => {
  return attribute === undefined ? ifa.ifa_flags : BigInt(u32Codec.parse({ data: attribute.data, structures }));
};

const withoutUndefined = <T extends object>({ value }: { value: T }): T => {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => {
    return entry !== undefined;
  })) as T;
};

/**
 * Turns an address message into a TAddressInfo.
 */
const addressInfoOf = ({ message, structures = hostStructures }: {
  message: TAddressMessage,
  structures?: TRtnetlinkStructures,
}): TAddressInfo => {
  const { ifa } = message;
  const attributes = attributesOf({ rta: message.rta });

  // IPv4 reports the address of the interface as IFA_LOCAL and the peer as IFA_ADDRESS, IPv6 only IFA_ADDRESS
  const own = optionalIp({ attribute: attributes.local ?? attributes.address }) as string;
  const other = optionalIp({ attribute: attributes.address });

  return withoutUndefined({
    value: {
      ifindex: Number(ifa.ifa_index),
      family: familyName({ value: ifa.ifa_family }),
      address: own,
      prefixLength: Number(ifa.ifa_prefixlen),
      peer: other === own ? undefined : other,
      broadcast: optionalIp({ attribute: attributes.broadcast }),
      label: optionalString({ attribute: attributes.label, structures }),
      scope: scopeName({ value: ifa.ifa_scope }),
      flags: parseAddressFlags({ bits: flagBitsOf({ ifa, attribute: attributes.flags, structures }) }),
      unknownAttributes: attributes.unknown,
    },
  });
};

const parseAddressOfFamily = ({ address, family }: { address: string, family: TAddressFamily }): TIpAddress => {
  const parsed = parseIpAddress({ address });

  if (parsed.family !== family) {
    throw Error(`address "${address}" is not of family ${family}`);
  }

  return parsed;
};

const maximumPrefixLengths: Record<TAddressFamily, number> = { inet: 32, inet6: 128 };

const isInRange = ({ value, maximum }: { value: number, maximum: number }) => {
  return Number.isInteger(value) && value >= 0 && value <= maximum;
};

const assertValidPrefixLength = ({ prefixLength, family }: { prefixLength: number, family: TAddressFamily }) => {
  const maximum = maximumPrefixLengths[family];

  if (!isInRange({ value: prefixLength, maximum })) {
    throw Error(`prefix length ${prefixLength} is out of range [0, ${maximum}]`);
  }
};

const ipAttribute = ({ rta_type, address, family, structures }: {
  rta_type: bigint,
  address: string,
  family: TAddressFamily,
  structures: TRtnetlinkStructures,
}): TRtattr => {
  return { rta_type, data: bytesCodec.format({ value: parseAddressOfFamily({ address, family }).bytes, structures }) };
};

// IFA_LOCAL is the address of the interface, IFA_ADDRESS the peer of a point-to-point link or the address again
const addressAttributes = ({ address, peer, broadcast, label, family, structures }: {
  address: string,
  peer: string | undefined,
  broadcast: string | undefined,
  label: string | undefined,
  family: TAddressFamily,
  structures: TRtnetlinkStructures,
}): TRtattr[] => {
  return [
    ipAttribute({ rta_type: IFA_LOCAL, address, family, structures }),
    ipAttribute({ rta_type: IFA_ADDRESS, address: peer ?? address, family, structures }),
    ...(broadcast === undefined ? [] : [ipAttribute({ rta_type: IFA_BROADCAST, address: broadcast, family, structures })]),
    ...(label === undefined ? [] : [{ rta_type: IFA_LABEL, data: stringCodec.format({ value: label, structures }) }]),
  ];
};

const createAddressApi = ({ netlink, structures }: { netlink: TRtnetlinkNetlink, structures: TRtnetlinkStructures }): TAddressApi => {

  const toNetlinkRequest = ({ header, ifa, rta, timeoutMs }: TAddressRequest) => {
    if (!isAddressMessageType({ nlmsg_type: header.nlmsg_type })) {
      throw Error(`unsupported message type ${header.nlmsg_type}, only address messages are supported`);
    }

    return { header, payload: formatIfaddrPayload({ ifa, rta, structures }), timeoutMs };
  };

  const toAddressMessages = ({ messages }: { messages: TNetlinkMessage[] }) => {
    return messages.map((message) => {
      const addressMessage = parseAddressMessage({ message, structures });

      if (addressMessage === undefined) {
        throw Error(`unexpected response of type ${message.header.nlmsg_type}`);
      }

      return addressMessage;
    });
  };

  const talk: TAddressApi["talk"] = async (request) => {
    const messages = await netlink.talk(toNetlinkRequest(request));
    return toAddressMessages({ messages });
  };

  const tryTalk: TAddressApi["tryTalk"] = async (request) => {
    const { errno, messages } = await netlink.tryTalk(toNetlinkRequest(request));
    return { errno, messages: toAddressMessages({ messages }) };
  };

  const add: TAddressApi["add"] = async ({ ifindex, address, prefixLength, peer, broadcast, label, scope = "universe", flags = {} }) => {
    const { family } = parseIpAddress({ address });
    assertValidPrefixLength({ prefixLength, family });

    const bits = formatAddressFlags({ flags });

    await talk({
      header: { nlmsg_type: RTM_NEWADDR, nlmsg_flags: NLM_F_CREATE | NLM_F_EXCL },
      ifa: {
        ifa_family: familyValues[family],
        ifa_prefixlen: BigInt(prefixLength),
        ifa_flags: bits & 0xFFn,
        ifa_scope: scopeValues[scope],
        ifa_index: BigInt(ifindex),
      },
      rta: [
        ...addressAttributes({ address, peer, broadcast, label, family, structures }),
        { rta_type: IFA_FLAGS, data: u32Codec.format({ value: Number(bits), structures }) },
      ],
    });
  };

  const remove: TAddressApi["remove"] = async ({ ifindex, address, prefixLength }) => {
    const { family } = parseIpAddress({ address });
    assertValidPrefixLength({ prefixLength, family });

    await talk({
      header: { nlmsg_type: RTM_DELADDR },
      ifa: { ifa_family: familyValues[family], ifa_prefixlen: BigInt(prefixLength), ifa_index: BigInt(ifindex) },
      rta: [ipAttribute({ rta_type: IFA_LOCAL, address, family, structures })],
    });
  };

  const listAll: TAddressApi["listAll"] = async ({ ifindex, family } = {}) => {
    const messages = await talk({
      header: { nlmsg_type: RTM_GETADDR, nlmsg_flags: NLM_F_DUMP },
      ifa: { ifa_family: family === undefined ? AF_UNSPEC : familyValues[family] },
    });

    return messages.map((message) => {
      return addressInfoOf({ message, structures });
    }).filter((info) => {
      return ifindex === undefined || info.ifindex === ifindex;
    });
  };

  return {
    add,
    remove,
    listAll,
    talk,
    tryTalk,
  };
};

export {
  createAddressApi,
  parseAddressMessage,
  isAddressMessageType,
  addressInfoOf,
  formatAddressFlags,
  parseAddressFlags,
};

export type {
  TAddressApi,
  TAddressInfo,
  TAddAddressArgs,
  TAddressMessage,
  TAddressRequest,
  TAddressTryTalkResult,
  TAddressFlagName,
  TAddressFlags,
  TAddressScopeName,
};
