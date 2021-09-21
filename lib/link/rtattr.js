import rta from "../../rta.js";
import linkinfoMarshaller from "./linkinfo.js";

const IFLA_ADDRESS = 0x01n;
const IFLA_BROADCAST = 0x02n;
const IFLA_IFNAME = 0x03n;
const IFLA_MTU = 0x04n;
const IFLA_LINK = 0x05n;
const IFLA_MASTER = 0x0An;
const IFLA_LINKINFO = 18n;

// {
//   "rta_type": IFLA_IFNAME,
//   "name": "name",
//   "marshaller": rta.types.asciiz
// },
// {
//   "rta_type": IFLA_MTU,
//   "name": "mtu",
//   "marshaller": rta.types.uint32
// },
// {
//   "rta_type": IFLA_ADDRESS,
//   "name": "address",
//   "marshaller": rta.types.hwaddr
// }

const supportedRTAs = [
  {
    "rta_type": IFLA_IFNAME,
    "jsonKey": "name",
    "marshaller": rta.types.asciiz
  },
  {
    "rta_type": IFLA_MTU,
    "jsonKey": "mtu",
    "marshaller": rta.types.uint32
  },
  {
    "rta_type": IFLA_ADDRESS,
    "jsonKey": "address",
    "marshaller": rta.types.hwaddr
  },
  {
    "rta_type": IFLA_LINKINFO,
    "jsonKey": "linkinfo",
    "marshaller": linkinfoMarshaller
  },
  {
    "rta_type": IFLA_MASTER,
    "jsonKey": "masterIndex",
    "marshaller": rta.types.ifindex
  }
];

const rtattr2js = (rtattr) => {
  const def = supportedRTAs.find((type) => type.rta_type === rtattr.rta_type);
  if(!def) {
    return {};
  }

  return {
    [def.jsonKey]: def.marshaller.unmarshal(rtattr.data)
  };
};

const js2rtattr = (key, value) => {
  const def = supportedRTAs.find((type) => type.jsonKey === key);
  if(!def) {
    throw new Error(`invalid key "${key}"`);
  }

  return {
    "rta_type": def.rta_type,
    "data": def.marshaller.marshal(value)
  };
};

const marshal = (obj) => {
  return Object.keys(obj).map((key) => {
    return js2rtattr(key, obj[key]);
  });
};

const unmarshal = (rtattrs) => {
  let result = {
    "unknownRTAs": []
  };

  rtattrs.forEach((rtattr) => {
    const part = rtattr2js(rtattr);
    if(Object.keys(part).length > 0) {
      result = Object.assign({}, result, part);
    } else {
      result = Object.assign({}, result, {
        "unknownRTAs": [...result.unknownRTAs, rtattr]
      });
    }
  });

  return result;
};

export default {
  marshal,
  unmarshal
};
