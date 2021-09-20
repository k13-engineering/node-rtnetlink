import rtnetlink from "./index.js";
import rta from "./rta.js";

import linkUtil from "./lib/link/util.js";
import linkinfoMarshaller from "./lib/link/linkinfo.js";
import linkRTAs from "./lib/link/rtattr.js";
import linkFlags from "./lib/link/flags.js";

const AF_UNSPEC = 0;
const AF_PACKET = 17;

const IFLA_ADDRESS = 0x01;
const IFLA_BROADCAST = 0x02;
const IFLA_IFNAME = 0x03;
const IFLA_MTU = 0x04;
const IFLA_LINK = 0x05;
const IFLA_MASTER = 0x0A;
const IFLA_LINKINFO = 18;

const EEXIST = 17;

const linkFromIndex = ({ rt, ifindex }) => {
  const fetch = async({ provideUnknown = false } = {}) => {
    const result = await rt.talk({
      "header": {
        "nlmsg_type": rtnetlink.RTM_GETLINK,
        "nlmsg_flags": rtnetlink.NLM_F_REQUEST | rtnetlink.NLM_F_MATCH | rtnetlink.NLM_F_ACK
      },
      "ifi": {
        "ifi_family": AF_PACKET,
        "ifi_index": ifindex
      }
    });

    const message = result[0];

    const basic = {
      ifindex,
      "family": message.ifi.ifi_family
    };

    const { unknownRTAs, ...json } = linkRTAs.unmarshal(message.rta);

    if(provideUnknown) {
      return {
        ...basic,
        ...json,
        unknownRTAs
      };
    } else {
      return {
        ...basic,
        ...json
      };
    }
  };

  const modify = async({ flags, ...attributes }) => {
    const rtattrs = linkRTAs.marshal(attributes);

    // if(data.master) {
    //   rtattrs = [...rtattrs, {
    //     "rta_type": IFLA_MASTER,
    //     "data": rta.types.ifindex.marshal(data.master.ifindex)
    //   }];
    // }

    const result = await rt.talk({
      "header": {
        "nlmsg_type": rtnetlink.RTM_NEWLINK,
        "nlmsg_flags": rtnetlink.NLM_F_REQUEST | rtnetlink.NLM_F_ACK
      },
      "ifi": {
        "ifi_family": AF_PACKET,
        "ifi_index": ifindex,
        "ifi_flags": linkFlags.mask(flags || {}),
        "ifi_change": linkFlags.changeMask(flags || {})
      },
      "rta": rtattrs
    });
  };

  const deleteLink = async() => {
    const result = await rt.talk({
      "header": {
        "nlmsg_type": rtnetlink.RTM_DELLINK,
        "nlmsg_flags": rtnetlink.NLM_F_REQUEST | rtnetlink.NLM_F_ACK
      },
      "ifi": {
        "ifi_family": AF_UNSPEC,
        "ifi_index": ifindex
      }
    });
  };

  return {
    ifindex,
    fetch,
    modify,
    deleteLink
  };
};

const create = ({ rt }) => {
  const fromIndex = ({ ifindex }) => {
    return linkFromIndex({ rt, ifindex });
  };

  const findBy = async({ flags, family, ...attributes }) => {
    const rtattrs = linkRTAs.marshal(attributes);

    const result = await rt.talk({
      "header": {
        "nlmsg_type": rtnetlink.RTM_GETLINK,
        "nlmsg_flags": rtnetlink.NLM_F_REQUEST | rtnetlink.NLM_F_MATCH | rtnetlink.NLM_F_ACK
      },
      "ifi": {
        "ifi_family": family || AF_UNSPEC,
        "ifi_flags": linkFlags.mask(flags || {}),
        "ifi_change": linkFlags.changeMask(flags || {})
      },
      "rta": rtattrs
    });

    if(result.length === 0) {
      throw new Error(`interface with name "${ifname}" not found`);
    } else if(result.length > 1) {
      throw new Error(`got multiple responses for ifname query`);
    }

    const response = result[0];
    const ifindex = response.ifi.ifi_index;

    return fromIndex({ ifindex });
  };

  const tryCreateLink = async(opts) => {
    const { ifindex, family, flags, ...attributes } = opts;
    const rtattrs = linkRTAs.marshal(attributes);

    const { errorCode, packets } = await rt.tryTalk({
      "header": {
        "nlmsg_type": rtnetlink.RTM_NEWLINK,
        "nlmsg_flags": rtnetlink.NLM_F_REQUEST | rtnetlink.NLM_F_CREATE | rtnetlink.NLM_F_EXCL | rtnetlink.NLM_F_ACK
      },
      "ifi": {
        "ifi_family": family || AF_UNSPEC,
        "ifi_index": ifindex,
        "ifi_flags": linkFlags.mask(flags || {}),
        "ifi_change": linkFlags.changeMask(flags || {})
      },
      "rta": rtattrs
    });

    return {
      errorCode
    };
  };

  const createLink = async(opts) => {
    let maxTries = 1;

    for(let triesLeft = maxTries; triesLeft > 0; triesLeft -= 1) {
      const ifindex = await linkUtil.findNextUnusedIndex({ rt });
      const {errorCode} = await tryCreateLink(Object.assign({}, opts, {
        ifindex
      }));

      if(errorCode === 0) {
        return fromIndex({ ifindex });
      } else if(errorCode !== EEXIST) {
        throw new Error(`failed to create link: ${errorCode}`);
      }
    }

    throw new Error(`failed to create link, got EEXIST ${maxTries} times, assuming ifindex prediction is broken`);
  };

  return {
    fromIndex,
    findBy,
    createLink
  }
};

export default {
  create
};
