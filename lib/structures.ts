import { define, type TAbi } from "ya-struct";
import { hostAbi } from "po6";

// struct ifinfomsg from <linux/rtnetlink.h>, the padding after ifi_family follows from the alignment
const ifinfomsgDefinition = {
  type: "struct",
  packed: false,
  fixedAbi: {},
  fields: [
    { name: "ifi_family", definition: { type: "c-type", cType: "unsigned char", fixedAbi: {} } },
    { name: "ifi_type", definition: { type: "c-type", cType: "unsigned short", fixedAbi: {} } },
    { name: "ifi_index", definition: { type: "c-type", cType: "int", fixedAbi: {} } },
    { name: "ifi_flags", definition: { type: "c-type", cType: "unsigned int", fixedAbi: {} } },
    { name: "ifi_change", definition: { type: "c-type", cType: "unsigned int", fixedAbi: {} } },
  ],
} as const;

// struct rtattr from <linux/rtnetlink.h>
const rtattrDefinition = {
  type: "struct",
  packed: false,
  fixedAbi: {},
  fields: [
    { name: "rta_len", definition: { type: "c-type", cType: "unsigned short", fixedAbi: {} } },
    { name: "rta_type", definition: { type: "c-type", cType: "unsigned short", fixedAbi: {} } },
  ],
} as const;

// struct ifaddrmsg from <linux/if_addr.h>
const ifaddrmsgDefinition = {
  type: "struct",
  packed: false,
  fixedAbi: {},
  fields: [
    { name: "ifa_family", definition: { type: "c-type", cType: "unsigned char", fixedAbi: {} } },
    { name: "ifa_prefixlen", definition: { type: "c-type", cType: "unsigned char", fixedAbi: {} } },
    { name: "ifa_flags", definition: { type: "c-type", cType: "unsigned char", fixedAbi: {} } },
    { name: "ifa_scope", definition: { type: "c-type", cType: "unsigned char", fixedAbi: {} } },
    { name: "ifa_index", definition: { type: "c-type", cType: "unsigned int", fixedAbi: {} } },
  ],
} as const;

// spelled out, as the declaration files are generated per file and could not infer these types
const ifinfomsg: ReturnType<typeof define<typeof ifinfomsgDefinition>> = define({ definition: ifinfomsgDefinition });
const rtattr: ReturnType<typeof define<typeof rtattrDefinition>> = define({ definition: rtattrDefinition });
const ifaddrmsg: ReturnType<typeof define<typeof ifaddrmsgDefinition>> = define({ definition: ifaddrmsgDefinition });

type TParserOf<T extends { parser: (args: { abi: TAbi }) => object }> = ReturnType<T["parser"]>;

type TRtnetlinkStructures = {
  abi: TAbi;
  ifinfomsg: TParserOf<typeof ifinfomsg>;
  rtattr: TParserOf<typeof rtattr>;
  ifaddrmsg: TParserOf<typeof ifaddrmsg>;
};

const createRtnetlinkStructuresFor = ({ abi }: { abi: TAbi }): TRtnetlinkStructures => {
  return {
    abi,
    ifinfomsg: ifinfomsg.parser({ abi }),
    rtattr: rtattr.parser({ abi }),
    ifaddrmsg: ifaddrmsg.parser({ abi }),
  };
};

const hostStructures = createRtnetlinkStructuresFor({ abi: hostAbi });

export {
  ifinfomsgDefinition,
  rtattrDefinition,
  ifaddrmsgDefinition,

  createRtnetlinkStructuresFor,
  hostStructures,
};

export type {
  TRtnetlinkStructures,
};
