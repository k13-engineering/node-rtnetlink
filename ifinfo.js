import RTA from "./rta.js";
import struct from "../node-ya-struct/lib/index.js";

const NLMSG_ALIGN = (addr) => (addr + 3) & ~3;

const ifinfomsg = struct.define(({ field }) => {
  field.UInt8("ifi_family");
  field.UInt16("ifi_type");
  field.Int32("ifi_index");
  field.UInt32("ifi_flags");
  field.UInt32("ifi_change");
}).forHost();

const marshal = (obj) => {
  const header = ifinfomsg.format({
    "ifi_family": 0n,
    "ifi_type": 0n,
    "ifi_index": 0n,
    "ifi_flags": 0n,
    "ifi_change": 0n,
    ...obj.ifi
  });

  return Buffer.concat([
    header,
    Buffer.alloc(NLMSG_ALIGN(ifinfomsg.size) - ifinfomsg.size),
    RTA.marshal(obj.rta || [])
  ]);
};

const unmarshal = (data) => {
  const header = ifinfomsg.parse(data);

  return {
    "ifi": header,
    "rta": RTA.unmarshal(data.slice(NLMSG_ALIGN(ifinfomsg.size)))
  };
};

export default {
  marshal,
  unmarshal
};
