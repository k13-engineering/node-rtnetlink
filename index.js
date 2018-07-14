const assert = require("assert");
const EventEmitter = require("events");

const netlink = require("node-netlink");

const ifinfo = require("./ifinfo.js");
const RTA = require("./rta.js");


const NETLINK_ROUTE = 0;

const RTM_NEWLINK = 16;
const RTM_DELLINK = 17;
const RTM_GETLINK = 18;

const IFLA_IFNAME = 3;
const IFLA_ADDR = 1;
const IFLA_MASTER = 10;
const IFLA_LINK = 5;
const IFLA_LINKINFO = 18;
const IFLA_INFO_KIND = 1;

const marshallers = {
  [RTM_GETLINK]: ifinfo,
  [RTM_NEWLINK]: ifinfo,
  [RTM_DELLINK]: ifinfo
};

const convert = (msg) => {
  let converted = [];

  msg.forEach((part) => {
    const m = marshallers[part.header.nlmsg_type];

    let result;

    if (m) {
      result = Object.assign({}, {
        "header": part.header
      }, m.unmarshal(part.payload));
    } else {
      result = part;
    }

    converted = converted.concat([result]);
  });

  return converted;
};

const {
  NLM_F_ECHO,
  NLM_F_REQUEST,
  NLM_F_MULTI,
  NLM_F_DUMP,
  NLM_F_ACK,
  NLM_F_CREATE,
  NLM_F_EXCL
} = netlink;

const open = () => {
  const emitter = new EventEmitter();

  const nl = netlink.open({ "family": NETLINK_ROUTE })
  nl.on("message", (msg) => {
    emitter.emit("message", convert(msg));
  });

  return {
    "talk": async(obj) => {
      assert(typeof obj.header === "object", "header must be given and of type object");
      assert(!isNaN(obj.header.nlmsg_type), "header.nlmsg_type must be given");

      const m = marshallers[obj.header.nlmsg_type];
      assert(m, "no marshaller available for nlmsg_type " + obj.header.nlmsg_type);

      const result = await nl.talk({
        "header": obj.header,
        "payload": m.marshal(obj)
      });

      return convert(result);
    },
    "on": emitter.on.bind(emitter),
    "once": emitter.once.bind(emitter),
    "close": () => nl.close()
  };
};

module.exports = {
  IFLA_IFNAME,
  IFLA_ADDR,
  IFLA_MASTER,
  IFLA_LINK,
  IFLA_LINKINFO,
  IFLA_INFO_KIND,

  NLM_F_ECHO,
  NLM_F_REQUEST,
  NLM_F_MULTI,
  NLM_F_DUMP,
  NLM_F_ACK,
  NLM_F_CREATE,
  NLM_F_EXCL,

  RTM_GETLINK,
  RTM_NEWLINK,
  RTM_DELLINK,

  RTA,

  open
};
