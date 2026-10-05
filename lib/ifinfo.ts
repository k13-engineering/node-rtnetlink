import { formatAttributes, parseAttributes, rtaAlign, type TRtattr } from "./rtattr.ts";
import type { TRtnetlinkStructures } from "./structures.ts";

type TIfinfomsg = {
  ifi_family: bigint;
  ifi_type: bigint;
  ifi_index: bigint;
  ifi_flags: bigint;
  ifi_change: bigint;
};

// the payload of RTM_NEWLINK, RTM_DELLINK, RTM_GETLINK and RTM_SETLINK
type TIfinfoPayload = {
  ifi: TIfinfomsg;
  rta: TRtattr[];
};

const emptyIfinfomsg: TIfinfomsg = {
  ifi_family: 0n,
  ifi_type: 0n,
  ifi_index: 0n,
  ifi_flags: 0n,
  ifi_change: 0n,
};

/**
 * Formats a struct ifinfomsg followed by its attributes. Missing ifinfomsg fields are 0.
 */
const formatIfinfoPayload = ({ ifi, rta = [], structures }: {
  ifi: Partial<TIfinfomsg>,
  rta?: TRtattr[],
  structures: TRtnetlinkStructures,
}) => {
  const header = structures.ifinfomsg.format({ value: { ...emptyIfinfomsg, ...ifi } });
  const attributes = formatAttributes({ attributes: rta, structures });
  const attributesOffset = rtaAlign({ length: header.length });

  const result = new Uint8Array(attributesOffset + attributes.length);
  result.set(header, 0);
  result.set(attributes, attributesOffset);
  return result;
};

/**
 * Parses a struct ifinfomsg followed by its attributes, throws if the payload is malformed.
 */
const parseIfinfoPayload = ({ payload, structures }: { payload: Uint8Array, structures: TRtnetlinkStructures }): TIfinfoPayload => {
  const headerSize = structures.ifinfomsg.size;

  if (payload.length < headerSize) {
    throw Error(`malformed ifinfomsg: ${payload.length} bytes, but at least ${headerSize} bytes are needed`);
  }

  const ifi = structures.ifinfomsg.parse({ data: payload.subarray(0, headerSize) });
  const rta = parseAttributes({ data: payload.subarray(rtaAlign({ length: headerSize })), structures });

  return { ifi, rta };
};

export {
  formatIfinfoPayload,
  parseIfinfoPayload,
};

export type {
  TIfinfomsg,
  TIfinfoPayload,
};
