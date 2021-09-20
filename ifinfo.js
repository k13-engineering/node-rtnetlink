import ref from "ref-napi";
import StructType from "ref-struct-napi";
import RTA from "./rta.js";

const NLMSG_ALIGN = (addr) => (addr + 3) & ~3;

const ifinfomsg = StructType({
  "ifi_family": ref.types.uchar,
  "ifi_type": ref.types.ushort,
  "ifi_index": ref.types.int,
  "ifi_flags": ref.types.uint,
  "ifi_change": ref.types.uint
});

const marshal = (obj) => {
  const header = new ifinfomsg(Object.assign({}, {
    "ifi_family": 0,
    "ifi_type": 0,
    "ifi_index": 0,
    "ifi_flags": 0,
    "ifi_change": 0
  }, obj.ifi));

  return Buffer.concat([
    header.ref(),
    Buffer.alloc(NLMSG_ALIGN(ifinfomsg.size) - ifinfomsg.size),
    RTA.marshal(obj.rta || [])
  ]);
};

const unmarshal = (data) => {
  const header = new ifinfomsg(data);

  return {
    "ifi": JSON.parse(JSON.stringify(header)),
    "rta": RTA.unmarshal(data.slice(NLMSG_ALIGN(ifinfomsg.size)))
  };
};

export default {
  marshal,
  unmarshal
};
