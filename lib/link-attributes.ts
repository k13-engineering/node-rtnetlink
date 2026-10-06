import {
  IFLA_ADDRESS,
  IFLA_BROADCAST,
  IFLA_IFNAME,
  IFLA_LINK,
  IFLA_LINKINFO,
  IFLA_MASTER,
  IFLA_MTU,
  IFLA_TXQLEN
} from "./constants.ts";
import {
  bytesCodec,
  stringCodec,
  typeOfAttribute,
  u32Codec,
  type TAttributeCodec,
  type TRtattr
} from "./rtattr.ts";
import { linkinfoCodec, type TLinkinfo } from "./linkinfo.ts";
import type { TRtnetlinkStructures } from "./structures.ts";

type TLinkAttributes = {
  name?: string;
  mtu?: number;
  address?: Uint8Array;
  broadcast?: Uint8Array;
  txqlen?: number;
  // ifindex of the master link, e.g. a bridge, 0 to detach from it
  masterIndex?: number;
  // ifindex of the lower link of a virtual link, e.g. the parent of a macvlan or vlan link
  linkIndex?: number;
  linkinfo?: TLinkinfo;
};

type TLinkAttributeName = keyof TLinkAttributes;

type TLinkAttributeDefinitions = {
  [name in TLinkAttributeName]-?: {
    rta_type: bigint;
    codec: TAttributeCodec<NonNullable<TLinkAttributes[name]>>;
  };
};

const linkAttributeDefinitions: TLinkAttributeDefinitions = {
  name: { rta_type: IFLA_IFNAME, codec: stringCodec },
  mtu: { rta_type: IFLA_MTU, codec: u32Codec },
  address: { rta_type: IFLA_ADDRESS, codec: bytesCodec },
  broadcast: { rta_type: IFLA_BROADCAST, codec: bytesCodec },
  txqlen: { rta_type: IFLA_TXQLEN, codec: u32Codec },
  masterIndex: { rta_type: IFLA_MASTER, codec: u32Codec },
  linkIndex: { rta_type: IFLA_LINK, codec: u32Codec },
  linkinfo: { rta_type: IFLA_LINKINFO, codec: linkinfoCodec },
};

const linkAttributeNames = Object.keys(linkAttributeDefinitions) as TLinkAttributeName[];

// the codecs of all attributes, without the relation between attribute name and value type
const definitionOf = ({ name }: { name: TLinkAttributeName }) => {
  return linkAttributeDefinitions[name] as unknown as { rta_type: bigint, codec: TAttributeCodec<unknown> };
};

/**
 * Turns link attributes into rtattrs, attributes that are undefined are skipped.
 * Throws for unknown attributes.
 */
const formatLinkAttributes = ({ attributes, structures }: {
  attributes: TLinkAttributes,
  structures: TRtnetlinkStructures,
}): TRtattr[] => {
  return Object.entries(attributes).flatMap(([name, value]) => {
    if (!Object.hasOwn(linkAttributeDefinitions, name)) {
      throw Error(`unknown link attribute "${name}"`);
    }

    if (value === undefined) {
      return [];
    }

    const { rta_type, codec } = definitionOf({ name: name as TLinkAttributeName });
    return [{ rta_type, data: codec.format({ value, structures }) }];
  });
};

const findDefinition = ({ attribute }: { attribute: TRtattr }) => {
  const type = typeOfAttribute({ attribute });

  return linkAttributeNames.find((name) => {
    return definitionOf({ name }).rta_type === type;
  });
};

/**
 * Turns rtattrs of a link into link attributes. Attributes without a definition are returned as `unknown`.
 */
type TParsedLinkAttributes = {
  attributes: TLinkAttributes;
  // attributes without a definition
  unknown: TRtattr[];
};

const parseLinkAttributes = ({ rta, structures }: { rta: TRtattr[], structures: TRtnetlinkStructures }): TParsedLinkAttributes => {
  return rta.reduce(({ attributes, unknown }: TParsedLinkAttributes, attribute) => {
    const name = findDefinition({ attribute });

    if (name === undefined) {
      return { attributes, unknown: [...unknown, attribute] };
    }

    const value = definitionOf({ name }).codec.parse({ data: attribute.data, structures });
    return { attributes: { ...attributes, [name]: value }, unknown };
  }, { attributes: {}, unknown: [] });
};

export {
  formatLinkAttributes,
  parseLinkAttributes,
  linkAttributeNames,
};

export type {
  TParsedLinkAttributes,
  TLinkAttributes,
  TLinkAttributeName,
};
