import { createRtnetlink, isLinkMessageType, parseLinkMessage } from "./rtnetlink.ts";
import { formatIfinfoPayload, parseIfinfoPayload } from "./ifinfo.ts";
import { formatIpAddress, parseIpAddress } from "./ip-address.ts";
import {
  formatLinkAttributes,
  linkAttributeNames,
  parseLinkAttributes
} from "./link-attributes.ts";
import { formatLinkFlags, parseLinkFlags } from "./link-flags.ts";
import {
  bytesCodec,
  formatAttributes,
  parseAttributes,
  rtaAlign,
  stringCodec,
  typeOfAttribute,
  u32Codec
} from "./rtattr.ts";
import {
  createRtnetlinkStructuresFor,
  hostStructures,
  ifinfomsgDefinition,
  ifaddrmsgDefinition,
  rtattrDefinition
} from "./structures.ts";

export * from "./constants.ts";

export {
  createRtnetlink,
  parseLinkMessage,
  isLinkMessageType,

  formatIfinfoPayload,
  parseIfinfoPayload,

  parseIpAddress,
  formatIpAddress,

  formatLinkAttributes,
  parseLinkAttributes,
  linkAttributeNames,
  formatLinkFlags,
  parseLinkFlags,

  formatAttributes,
  parseAttributes,
  typeOfAttribute,
  rtaAlign,
  stringCodec,
  u32Codec,
  bytesCodec,

  createRtnetlinkStructuresFor,
  hostStructures,
  ifinfomsgDefinition,
  rtattrDefinition,
  ifaddrmsgDefinition,
};

export type {
  TRtnetlink,
  TRtnetlinkNetlink,
  TLinkMessage,
  TLinkRequest,
  TLinkTryTalkResult,
} from "./rtnetlink.ts";
export type {
  TNetns,
  TLink,
  TLinkApi,
  TLinkInfo,
  TLinkCriteria,
} from "./link.ts";
export type { TParsedLinkAttributes, TLinkAttributes, TLinkAttributeName } from "./link-attributes.ts";
export type {
  TLinkinfo,
  TLinkinfoData,
  TMacvlanData,
  TMacvlanMode,
} from "./linkinfo.ts";
export type { TLinkFlagName, TLinkFlags } from "./link-flags.ts";
export type { TIfinfomsg, TIfinfoPayload } from "./ifinfo.ts";
export type { TAddressFamily, TIpAddress } from "./ip-address.ts";
export type { TRtattr, TAttributeCodec } from "./rtattr.ts";
export type { TRtnetlinkStructures } from "./structures.ts";
