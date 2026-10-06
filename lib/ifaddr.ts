import { formatAttributes, parseAttributes, rtaAlign, type TRtattr } from "./rtattr.ts";
import type { TRtnetlinkStructures } from "./structures.ts";

type TIfaddrmsg = {
  ifa_family: bigint;
  ifa_prefixlen: bigint;
  ifa_flags: bigint;
  ifa_scope: bigint;
  ifa_index: bigint;
};

// the payload of RTM_NEWADDR, RTM_DELADDR and RTM_GETADDR
type TIfaddrPayload = {
  ifa: TIfaddrmsg;
  rta: TRtattr[];
};

const emptyIfaddrmsg: TIfaddrmsg = {
  ifa_family: 0n,
  ifa_prefixlen: 0n,
  ifa_flags: 0n,
  ifa_scope: 0n,
  ifa_index: 0n,
};

/**
 * Formats a struct ifaddrmsg followed by its attributes. Missing ifaddrmsg fields are 0.
 */
const formatIfaddrPayload = ({ ifa, rta = [], structures }: {
  ifa: Partial<TIfaddrmsg>,
  rta?: TRtattr[],
  structures: TRtnetlinkStructures,
}): Uint8Array => {
  const header = structures.ifaddrmsg.format({ value: { ...emptyIfaddrmsg, ...ifa } });
  const attributes = formatAttributes({ attributes: rta, structures });
  const attributesOffset = rtaAlign({ length: header.length });

  const result = new Uint8Array(attributesOffset + attributes.length);
  result.set(header, 0);
  result.set(attributes, attributesOffset);
  return result;
};

/**
 * Parses a struct ifaddrmsg followed by its attributes, throws if the payload is malformed.
 */
const parseIfaddrPayload = ({ payload, structures }: { payload: Uint8Array, structures: TRtnetlinkStructures }): TIfaddrPayload => {
  const headerSize = structures.ifaddrmsg.size;

  if (payload.length < headerSize) {
    throw Error(`malformed ifaddrmsg: ${payload.length} bytes, but at least ${headerSize} bytes are needed`);
  }

  const ifa = structures.ifaddrmsg.parse({ data: payload.subarray(0, headerSize) });
  const rta = parseAttributes({ data: payload.subarray(rtaAlign({ length: headerSize })), structures });

  return { ifa, rta };
};

export {
  formatIfaddrPayload,
  parseIfaddrPayload,
};

export type {
  TIfaddrmsg,
  TIfaddrPayload,
};
