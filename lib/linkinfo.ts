import {
  IFLA_ADDRESS,
  IFLA_IFNAME,
  IFLA_INFO_DATA,
  IFLA_INFO_KIND,
  IFLA_INFO_SLAVE_KIND,
  IFLA_MACVLAN_MODE,
  IFLA_MTU,
  MACVLAN_MODE_BRIDGE,
  MACVLAN_MODE_PASSTHRU,
  MACVLAN_MODE_PRIVATE,
  MACVLAN_MODE_SOURCE,
  MACVLAN_MODE_VEPA,
  VETH_INFO_PEER
} from "./constants.ts";
import { formatIfinfoPayload, parseIfinfoPayload } from "./ifinfo.ts";
import {
  bytesCodec,
  formatAttributes,
  parseAttributes,
  stringCodec,
  typeOfAttribute,
  u32Codec,
  type TAttributeCodec,
  type TRtattr
} from "./rtattr.ts";
import type { TRtnetlinkStructures } from "./structures.ts";

type TMacvlanMode = "private" | "vepa" | "bridge" | "passthru" | "source";

// IFLA_INFO_DATA of macvlan and macvtap links
type TMacvlanData = {
  // how the link forwards to other macvlan links on the same lower link, the kernel uses "vepa" if omitted
  mode?: TMacvlanMode;
};

// the other end of a veth link, which the kernel creates together with it
type TVethPeer = {
  // the kernel picks a name like veth0 if omitted
  name?: string;
  mtu?: number;
  address?: Uint8Array;
};

// IFLA_INFO_DATA of veth links
type TVethData = {
  peer?: TVethPeer;
};

// the kind specific attributes, decoded for the kinds in linkinfoDataCodecs; all fields are optional,
// so the fields of the different kinds are combined, which lets users read them without narrowing
type TLinkinfoData = TMacvlanData & TVethData;

type TLinkinfo = {
  // the type of the link, e.g. "bridge", "veth", "dummy" or "macvtap"
  kind?: string;
  // the type of the master this link is a port of, e.g. "bridge"
  slaveKind?: string;
  // kind specific attributes, supported for macvlan, macvtap and veth
  data?: TLinkinfoData;
};

const macvlanModes: Record<TMacvlanMode, bigint> = {
  private: MACVLAN_MODE_PRIVATE,
  vepa: MACVLAN_MODE_VEPA,
  bridge: MACVLAN_MODE_BRIDGE,
  passthru: MACVLAN_MODE_PASSTHRU,
  source: MACVLAN_MODE_SOURCE,
};

const macvlanModeValue = ({ mode }: { mode: string }) => {
  if (!Object.hasOwn(macvlanModes, mode)) {
    throw Error(`unknown macvlan mode "${mode}"`);
  }

  return macvlanModes[mode as TMacvlanMode];
};

// modes of newer kernels are left out instead of failing to parse the link
const macvlanModeName = ({ value }: { value: bigint }) => {
  return (Object.keys(macvlanModes) as TMacvlanMode[]).find((mode) => {
    return macvlanModes[mode] === value;
  });
};

const macvlanDataCodec: TAttributeCodec<TMacvlanData> = {
  format: ({ value, structures }) => {
    const attributes = value.mode === undefined ? [] : [{
      rta_type: IFLA_MACVLAN_MODE,
      data: u32Codec.format({ value: Number(macvlanModeValue({ mode: value.mode })), structures }),
    }];

    return formatAttributes({ attributes, structures });
  },
  parse: ({ data, structures }) => {
    const modeAttribute = parseAttributes({ data, structures }).find((attribute) => {
      return typeOfAttribute({ attribute }) === IFLA_MACVLAN_MODE;
    });

    if (modeAttribute === undefined) {
      return {};
    }

    const mode = macvlanModeName({ value: BigInt(u32Codec.parse({ data: modeAttribute.data, structures })) });
    return mode === undefined ? {} : { mode };
  },
};

const vethPeerAttributeCodecs = {
  name: { rta_type: IFLA_IFNAME, codec: stringCodec },
  mtu: { rta_type: IFLA_MTU, codec: u32Codec },
  address: { rta_type: IFLA_ADDRESS, codec: bytesCodec },
};

type TVethPeerAttributeName = keyof typeof vethPeerAttributeCodecs;

const vethPeerAttributeNames = Object.keys(vethPeerAttributeCodecs) as TVethPeerAttributeName[];

// the codec of a peer attribute, without the relation between attribute name and value type
const vethPeerCodecOf = ({ name }: { name: TVethPeerAttributeName }) => {
  return vethPeerAttributeCodecs[name] as { rta_type: bigint, codec: TAttributeCodec<unknown> };
};

// VETH_INFO_PEER holds a struct ifinfomsg and the attributes of the peer, like RTM_NEWLINK
const formatVethPeer = ({ peer, structures }: { peer: TVethPeer, structures: TRtnetlinkStructures }): TRtattr => {
  const rta = vethPeerAttributeNames.filter((name) => {
    return peer[name] !== undefined;
  }).map((name) => {
    const { rta_type, codec } = vethPeerCodecOf({ name });
    return { rta_type, data: codec.format({ value: peer[name], structures }) };
  });

  return { rta_type: VETH_INFO_PEER, data: formatIfinfoPayload({ ifi: {}, rta, structures }) };
};

const parseVethPeer = ({ attribute, structures }: { attribute: TRtattr, structures: TRtnetlinkStructures }): TVethPeer => {
  const { rta } = parseIfinfoPayload({ payload: attribute.data, structures });

  return vethPeerAttributeNames.reduce((peer: TVethPeer, name) => {
    const { rta_type, codec } = vethPeerCodecOf({ name });
    const found = rta.find((candidate) => {
      return typeOfAttribute({ attribute: candidate }) === rta_type;
    });

    return found === undefined ? peer : { ...peer, [name]: codec.parse({ data: found.data, structures }) };
  }, {});
};

const vethDataCodec: TAttributeCodec<TVethData> = {
  format: ({ value, structures }) => {
    const attributes = value.peer === undefined ? [] : [formatVethPeer({ peer: value.peer, structures })];
    return formatAttributes({ attributes, structures });
  },
  parse: ({ data, structures }) => {
    const peerAttribute = parseAttributes({ data, structures }).find((attribute) => {
      return typeOfAttribute({ attribute }) === VETH_INFO_PEER;
    });

    return peerAttribute === undefined ? {} : { peer: parseVethPeer({ attribute: peerAttribute, structures }) };
  },
};

// each codec handles the data of its kinds
const linkinfoDataCodecs: Record<string, TAttributeCodec<TLinkinfoData>> = {
  macvlan: macvlanDataCodec as TAttributeCodec<TLinkinfoData>,
  macvtap: macvlanDataCodec as TAttributeCodec<TLinkinfoData>,
  veth: vethDataCodec as TAttributeCodec<TLinkinfoData>,
};

const dataCodecFor = ({ kind }: { kind: string | undefined }) => {
  return kind !== undefined && Object.hasOwn(linkinfoDataCodecs, kind) ? linkinfoDataCodecs[kind] : undefined;
};

const formatData = ({ kind, data, structures }: { kind: string | undefined, data: TLinkinfoData, structures: TRtnetlinkStructures }) => {
  const codec = dataCodecFor({ kind });

  if (codec === undefined) {
    throw Error(`linkinfo data is not supported for kind "${kind}"`);
  }

  return { rta_type: IFLA_INFO_DATA, data: codec.format({ value: data, structures }) };
};

const stringAttribute = ({ rta_type, value, structures }: { rta_type: bigint, value: string, structures: TRtnetlinkStructures }) => {
  return { rta_type, data: stringCodec.format({ value, structures }) };
};

const parseOptionalString = ({ attribute, structures }: { attribute: TRtattr | undefined, structures: TRtnetlinkStructures }) => {
  return attribute === undefined ? undefined : stringCodec.parse({ data: attribute.data, structures });
};

// data of kinds without a codec is left out
const parseOptionalData = ({ kind, attribute, structures }: {
  kind: string | undefined,
  attribute: TRtattr | undefined,
  structures: TRtnetlinkStructures,
}) => {
  const codec = dataCodecFor({ kind });
  return attribute === undefined || codec === undefined ? undefined : codec.parse({ data: attribute.data, structures });
};

const withoutUndefined = ({ kind, slaveKind, data }: TLinkinfo): TLinkinfo => {
  return {
    ...(kind === undefined ? {} : { kind }),
    ...(slaveKind === undefined ? {} : { slaveKind }),
    ...(data === undefined ? {} : { data }),
  };
};

const linkinfoCodec: TAttributeCodec<TLinkinfo> = {
  format: ({ value, structures }) => {
    const { kind, slaveKind, data } = value;

    const attributes = [
      ...(kind === undefined ? [] : [stringAttribute({ rta_type: IFLA_INFO_KIND, value: kind, structures })]),
      ...(slaveKind === undefined ? [] : [stringAttribute({ rta_type: IFLA_INFO_SLAVE_KIND, value: slaveKind, structures })]),
      ...(data === undefined ? [] : [formatData({ kind, data, structures })]),
    ];

    return formatAttributes({ attributes, structures });
  },
  parse: ({ data, structures }) => {
    const attributes = parseAttributes({ data, structures });

    const find = ({ rta_type }: { rta_type: bigint }) => {
      return attributes.find((attribute) => {
        return typeOfAttribute({ attribute }) === rta_type;
      });
    };

    const kind = parseOptionalString({ attribute: find({ rta_type: IFLA_INFO_KIND }), structures });

    return withoutUndefined({
      kind,
      slaveKind: parseOptionalString({ attribute: find({ rta_type: IFLA_INFO_SLAVE_KIND }), structures }),
      data: parseOptionalData({ kind, attribute: find({ rta_type: IFLA_INFO_DATA }), structures }),
    });
  },
};

export {
  linkinfoCodec,
};

export type {
  TLinkinfo,
  TLinkinfoData,
  TMacvlanData,
  TMacvlanMode,
  TVethData,
  TVethPeer,
};
