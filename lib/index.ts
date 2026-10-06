import { createRtnetlink, isLinkMessageType, parseLinkMessage } from "./rtnetlink.ts";
import { formatIfinfoPayload, parseIfinfoPayload } from "./ifinfo.ts";
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
  rtattrDefinition
} from "./structures.ts";

export * from "./constants.ts";

export {
  createRtnetlink,
  parseLinkMessage,
  isLinkMessageType,

  formatIfinfoPayload,
  parseIfinfoPayload,

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
};

export type {
  TRtnetlink,
  TRtnetlinkNetlink,
  TLinkMessage,
  TLinkRequest,
  TLinkTryTalkResult,
} from "./rtnetlink.ts";
export type {
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
export type { TRtattr, TAttributeCodec } from "./rtattr.ts";
export type { TRtnetlinkStructures } from "./structures.ts";
