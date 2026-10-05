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

const ifinfomsg = define({ definition: ifinfomsgDefinition });
const rtattr = define({ definition: rtattrDefinition });

const createRtnetlinkStructuresFor = ({ abi }: { abi: TAbi }) => {
  return {
    abi,
    ifinfomsg: ifinfomsg.parser({ abi }),
    rtattr: rtattr.parser({ abi }),
  };
};

type TRtnetlinkStructures = ReturnType<typeof createRtnetlinkStructuresFor>;

const hostStructures = createRtnetlinkStructuresFor({ abi: hostAbi });

export {
  ifinfomsgDefinition,
  rtattrDefinition,

  createRtnetlinkStructuresFor,
  hostStructures,
};

export type {
  TRtnetlinkStructures,
};
