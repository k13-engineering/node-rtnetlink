import { NLM_F_MULTI, type TNetlinkMessage, type TTalkArgs } from "node-netlink";
import {
  AF_INET,
  IFA_ADDRESS,
  IFA_BROADCAST,
  IFA_CACHEINFO,
  IFA_FLAGS,
  IFA_LABEL,
  IFA_LOCAL,
  RTM_DELADDR,
  RTM_GETADDR,
  RTM_NEWADDR
} from "../constants.ts";
import { formatIfaddrPayload, parseIfaddrPayload, type TIfaddrmsg } from "../ifaddr.ts";
import { typeOfAttribute, type TRtattr } from "../rtattr.ts";
import { hostStructures } from "../structures.ts";

const structures = hostStructures;

const EEXIST = 17;
const ENODEV = 19;
const EADDRNOTAVAIL = 99;

type TFakeAddress = {
  ifa: TIfaddrmsg;
  rta: TRtattr[];
};

type TResult = {
  errno: number | undefined;
  messages: TNetlinkMessage[];
};

const findAttribute = ({ rta, rta_type }: { rta: TRtattr[], rta_type: bigint }) => {
  return rta.find((attribute) => {
    return typeOfAttribute({ attribute }) === rta_type;
  });
};

const bytesOf = ({ rta, rta_type }: { rta: TRtattr[], rta_type: bigint }) => {
  return [...(findAttribute({ rta, rta_type })?.data ?? [])].join(".");
};

const isSameAddress = ({ address, ifa, rta }: { address: TFakeAddress, ifa: TIfaddrmsg, rta: TRtattr[] }) => {
  return address.ifa.ifa_index === ifa.ifa_index &&
    bytesOf({ rta: address.rta, rta_type: IFA_LOCAL }) === bytesOf({ rta, rta_type: IFA_LOCAL });
};

/**
 * The addresses of a fake kernel. Like the kernel, it reports IPv4 addresses with IFA_LOCAL and IFA_ADDRESS,
 * IPv6 addresses only with IFA_ADDRESS, and both with IFA_FLAGS and IFA_CACHEINFO.
 */
const createFakeAddresses = ({ hasLink }: { hasLink: (args: { ifindex: bigint }) => boolean }) => {
  let addresses: TFakeAddress[] = [];

  const messageOf = ({ address }: { address: TFakeAddress }): TNetlinkMessage => {
    const { ifa, rta } = address;
    const reported = ifa.ifa_family === AF_INET ? rta : rta.filter((attribute) => {
      return typeOfAttribute({ attribute }) !== IFA_LOCAL;
    });

    return {
      header: { nlmsg_type: RTM_NEWADDR, nlmsg_flags: NLM_F_MULTI, nlmsg_seq: 1n, nlmsg_pid: 4711n },
      payload: formatIfaddrPayload({
        ifa,
        rta: [...reported, { rta_type: IFA_CACHEINFO, data: new Uint8Array(16) }],
        structures,
      }),
    };
  };

  const add = ({ ifa, rta }: TFakeAddress): TResult => {
    if (!hasLink({ ifindex: ifa.ifa_index })) {
      return { errno: ENODEV, messages: [] };
    }

    if (addresses.some((address) => {
      return isSameAddress({ address, ifa, rta });
    })) {
      return { errno: EEXIST, messages: [] };
    }

    // the kernel keeps only the attributes it knows
    const kept = rta.filter((attribute) => {
      return [IFA_ADDRESS, IFA_LOCAL, IFA_BROADCAST, IFA_LABEL, IFA_FLAGS].includes(typeOfAttribute({ attribute }));
    });

    addresses = [...addresses, { ifa, rta: kept }];
    return { errno: undefined, messages: [] };
  };

  const remove = ({ ifa, rta }: TFakeAddress): TResult => {
    const remaining = addresses.filter((address) => {
      return !isSameAddress({ address, ifa, rta });
    });

    if (remaining.length === addresses.length) {
      return { errno: EADDRNOTAVAIL, messages: [] };
    }

    addresses = remaining;
    return { errno: undefined, messages: [] };
  };

  const dump = ({ ifa }: TFakeAddress): TResult => {
    const matching = addresses.filter((address) => {
      return ifa.ifa_family === 0n || address.ifa.ifa_family === ifa.ifa_family;
    });

    return {
      errno: undefined,
      messages: matching.map((address) => {
        return messageOf({ address });
      }),
    };
  };

  const handlers: Record<string, (request: TFakeAddress) => TResult> = {
    [RTM_NEWADDR.toString()]: add,
    [RTM_DELADDR.toString()]: remove,
    [RTM_GETADDR.toString()]: dump,
  };

  return {
    handles: ({ args }: { args: TTalkArgs }) => {
      return Object.hasOwn(handlers, args.header.nlmsg_type.toString());
    },
    handle: ({ args }: { args: TTalkArgs }) => {
      return handlers[args.header.nlmsg_type.toString()](parseIfaddrPayload({ payload: args.payload, structures }));
    },
    addresses: () => {
      return addresses;
    },
  };
};

export {
  createFakeAddresses,
};
