import rta from "../../rta.js";

const IFLA_INFO_KIND = 0x01n;

const marshal = (obj) => {
  let rtattrs = [];

  if(obj.kind) {
    rtattrs = [...rtattrs, {
      "rta_type": IFLA_INFO_KIND,
      "data": rta.types.asciiz.marshal(obj.kind)
    }];
  }

  return rta.marshal(rtattrs);
};

const unmarshal = (buf) => {
  const rtattrs = rta.unmarshal(buf);

  let result = {};
  let unknownRTAs = [];

  const populate = (key, value) => {
    result = Object.assign({}, result, {
      [key]: value
    });
  };

  rtattrs.forEach((rtattr) => {
    switch(rtattr.rta_type) {
      case IFLA_INFO_KIND:
        populate("kind", rta.types.asciiz.unmarshal(rtattr.data))
        break;
      default:
        unknownRTAs = [...unknownRTAs, rtattr];
        break;
    }
  });

  return result;
};

export default {
  marshal,
  unmarshal
};
