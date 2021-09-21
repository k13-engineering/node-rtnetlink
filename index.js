import assert from "assert";
import EventEmitter from "events";
import netlink from "../node-netlink/lib/index.js";
import linkApi from "./link.js"

import ifinfo from "./ifinfo.js";
import RTA from "./rta.js";

const NETLINK_ROUTE = 0n;

const RTM_NEWLINK = 16n;
const RTM_DELLINK = 17n;
const RTM_GETLINK = 18n;

const IFLA_IFNAME = 3n;
const IFLA_ADDR = 1n;
const IFLA_MASTER = 10n;
const IFLA_LINK = 5n;
const IFLA_LINKINFO = 18n;
const IFLA_INFO_KIND = 1n;

const marshallers = {
  [RTM_GETLINK]: ifinfo,
  [RTM_NEWLINK]: ifinfo,
  [RTM_DELLINK]: ifinfo
};

const convert = (msg) => {
  const m = marshallers[msg.header.nlmsg_type];

  let result;

  if (m) {
    result = Object.assign({}, {
      "header": msg.header
    }, m.unmarshal(msg.payload));
  } else {
    result = msg;
  }

  return result;
};

const {
  NLM_F_ECHO,
  NLM_F_REQUEST,
  NLM_F_MULTI,
  NLM_F_DUMP,
  NLM_F_ACK,
  NLM_F_CREATE,
  NLM_F_EXCL,
  NLM_F_MATCH
} = netlink;

const open = async () => {
  const emitter = new EventEmitter();

  const nl = await netlink.open({
    "family": NETLINK_ROUTE
  });
  nl.on("message", (msg) => {
    emitter.emit("message", convert(msg));
  });

  const tryTalk = async(obj) => {
    assert.strictEqual(typeof obj.header, "object", "header must be given and of type object");
    assert.strictEqual(typeof obj.header.nlmsg_type, "bigint", "header.nlmsg_type must be given and of type bigint");

    const m = marshallers[obj.header.nlmsg_type];
    assert(m, "no marshaller available for nlmsg_type " + obj.header.nlmsg_type);

    const nlResult = await nl.tryTalk({
      "header": obj.header,
      "payload": m.marshal(obj)
    });

    const { errorCode, packets } = nlResult;

    return {
      errorCode,
      "packets": packets.map((part) => convert(part))
    };
  };

  const talk = async(obj) => {
    assert.strictEqual(typeof obj.header, "object", "header must be given and of type object");
    assert.strictEqual(typeof obj.header.nlmsg_type, "bigint", "header.nlmsg_type must be given");

    const m = marshallers[obj.header.nlmsg_type];
    assert(m, "no marshaller available for nlmsg_type " + obj.header.nlmsg_type);

    const result = await nl.talk({
      "header": obj.header,
      "payload": m.marshal(obj)
    });

    return result.map((part) => convert(part));
  };

  const rt = {
    talk,
    tryTalk,
    "on": emitter.on.bind(emitter),
    "once": emitter.once.bind(emitter),
    "close": () => nl.close()
  };

  return {
    "talk": rt.talk,
    "on": rt.on,
    "once": rt.once,

    "link": linkApi.create({ rt }),

    "close": rt.close
  };
};

export default {
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
  NLM_F_MATCH,

  RTM_GETLINK,
  RTM_NEWLINK,
  RTM_DELLINK,

  RTA,

  open
};
