import { NLA_TYPE_MASK } from "./constants.ts";
import type { TRtnetlinkStructures } from "./structures.ts";

type TRtattr = {
  // the type as sent by the kernel, including NLA_F_NESTED and NLA_F_NET_BYTEORDER
  rta_type: bigint;
  data: Uint8Array;
};

type TAttributeCodec<T> = {
  format: (args: { value: T, structures: TRtnetlinkStructures }) => Uint8Array;
  parse: (args: { data: Uint8Array, structures: TRtnetlinkStructures }) => T;
};

const RTA_ALIGNTO = 4;

const rtaAlign = ({ length }: { length: number }): number => {
  return Math.ceil(length / RTA_ALIGNTO) * RTA_ALIGNTO;
};

/**
 * The type of an attribute without the NLA_F_NESTED and NLA_F_NET_BYTEORDER flags.
 */
const typeOfAttribute = ({ attribute }: { attribute: TRtattr }): bigint => {
  return attribute.rta_type & NLA_TYPE_MASK;
};

/**
 * Formats a list of attributes, each one padded to RTA_ALIGNTO.
 */
const formatAttributes = ({ attributes, structures }: { attributes: TRtattr[], structures: TRtnetlinkStructures }): Uint8Array => {
  const headerSize = structures.rtattr.size;

  const totalLength = attributes.reduce((sum, attribute) => {
    return sum + rtaAlign({ length: headerSize + attribute.data.length });
  }, 0);

  const result = new Uint8Array(totalLength);

  attributes.reduce((offset, attribute) => {
    const header = structures.rtattr.format({
      value: {
        rta_len: BigInt(headerSize + attribute.data.length),
        rta_type: attribute.rta_type,
      },
    });

    result.set(header, offset);
    result.set(attribute.data, offset + headerSize);

    return offset + rtaAlign({ length: headerSize + attribute.data.length });
  }, 0);

  return result;
};

const parseOneAttribute = ({ data, structures }: { data: Uint8Array, structures: TRtnetlinkStructures }) => {
  const headerSize = structures.rtattr.size;

  if (data.length < headerSize) {
    throw Error(`malformed rtattr: ${data.length} bytes left, but a header needs ${headerSize} bytes`);
  }

  const { rta_len, rta_type } = structures.rtattr.parse({ data: data.subarray(0, headerSize) });
  const attributeLength = Number(rta_len);

  if (attributeLength < headerSize || attributeLength > data.length) {
    throw Error(`malformed rtattr: rta_len ${attributeLength} is out of range [${headerSize}, ${data.length}]`);
  }

  return {
    attribute: { rta_type, data: data.slice(headerSize, attributeLength) },
    space: rtaAlign({ length: attributeLength }),
  };
};

/**
 * Parses a list of attributes, throws if it is malformed.
 */
const parseAttributes = ({ data, structures }: { data: Uint8Array, structures: TRtnetlinkStructures }): TRtattr[] => {
  let attributes: TRtattr[] = [];
  let remaining = data;

  while (remaining.length > 0) {
    const { attribute, space } = parseOneAttribute({ data: remaining, structures });
    attributes = [...attributes, attribute];
    remaining = remaining.subarray(space);
  }

  return attributes;
};

const viewOf = ({ data }: { data: Uint8Array }) => {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
};

const isLittleEndian = ({ structures }: { structures: TRtnetlinkStructures }) => {
  return structures.abi.endianness === "little";
};

// a NUL terminated string, like IFLA_IFNAME
const stringCodec: TAttributeCodec<string> = {
  format: ({ value }) => {
    const encoded = new TextEncoder().encode(value);

    const result = new Uint8Array(encoded.length + 1);
    result.set(encoded, 0);
    return result;
  },
  parse: ({ data }) => {
    const end = data.indexOf(0);

    if (end < 0) {
      throw Error("malformed string attribute: terminating NUL is missing");
    }

    return new TextDecoder().decode(data.subarray(0, end));
  },
};

// a 32 bit unsigned integer in host byte order, like IFLA_MTU
const u32Codec: TAttributeCodec<number> = {
  format: ({ value, structures }) => {
    const result = new Uint8Array(4);
    viewOf({ data: result }).setUint32(0, value, isLittleEndian({ structures }));
    return result;
  },
  parse: ({ data, structures }) => {
    if (data.length < 4) {
      throw Error(`malformed u32 attribute: ${data.length} bytes instead of 4`);
    }

    return viewOf({ data }).getUint32(0, isLittleEndian({ structures }));
  },
};

// raw bytes, like the hardware address in IFLA_ADDRESS
const bytesCodec: TAttributeCodec<Uint8Array> = {
  format: ({ value }) => {
    return value.slice();
  },
  parse: ({ data }) => {
    return data.slice();
  },
};

export {
  rtaAlign,
  typeOfAttribute,
  formatAttributes,
  parseAttributes,

  stringCodec,
  u32Codec,
  bytesCodec,
};

export type {
  TRtattr,
  TAttributeCodec,
};
