import {
  IFLA_ADDRESS,
  IFLA_BROADCAST,
  IFLA_IFNAME,
  IFLA_INFO_KIND,
  IFLA_INFO_SLAVE_KIND,
  IFLA_LINKINFO,
  IFLA_MASTER,
  IFLA_MTU,
  IFLA_TXQLEN
} from "./constants.ts";
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

type TLinkinfo = {
  // the type of the link, e.g. "bridge", "veth" or "dummy"
  kind?: string;
  // the type of the master this link is a port of, e.g. "bridge"
  slaveKind?: string;
};

type TLinkAttributes = {
  name?: string;
  mtu?: number;
  address?: Uint8Array;
  broadcast?: Uint8Array;
  txqlen?: number;
  // ifindex of the master link, e.g. a bridge, 0 to detach from it
  masterIndex?: number;
  linkinfo?: TLinkinfo;
};

const linkinfoCodec: TAttributeCodec<TLinkinfo> = {
  format: ({ value, structures }) => {
    const { kind, slaveKind } = value;

    const attributes = [
      ...(kind === undefined ? [] : [{ rta_type: IFLA_INFO_KIND, data: stringCodec.format({ value: kind, structures }) }]),
      ...(slaveKind === undefined ? [] : [{ rta_type: IFLA_INFO_SLAVE_KIND, data: stringCodec.format({ value: slaveKind, structures }) }]),
    ];

    return formatAttributes({ attributes, structures });
  },
  parse: ({ data, structures }) => {
    return parseAttributes({ data, structures }).reduce((linkinfo: TLinkinfo, attribute) => {
      const type = typeOfAttribute({ attribute });

      if (type === IFLA_INFO_KIND) {
        return { ...linkinfo, kind: stringCodec.parse({ data: attribute.data, structures }) };
      }

      if (type === IFLA_INFO_SLAVE_KIND) {
        return { ...linkinfo, slaveKind: stringCodec.parse({ data: attribute.data, structures }) };
      }

      return linkinfo;
    }, {});
  },
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
  TLinkinfo,
};
