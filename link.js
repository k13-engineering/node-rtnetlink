import rtnetlink from "./index.js";

import linkUtil from "./lib/link/util.js";
import linkRTAs from "./lib/link/rtattr.js";
import linkFlags from "./lib/link/flags.js";

import netlink from "node-netlink";

const AF_UNSPEC = 0n;
const AF_PACKET = 17n;

const EEXIST = 17;
const ENODEV = 19;

const linkFromIndex = ({ rt, ifindex }) => {
  const fetch = async ({ provideUnknown = false } = {}) => {
    const result = await rt.talk({
      header: {
        nlmsg_type: rtnetlink.RTM_GETLINK,
        nlmsg_flags: rtnetlink.NLM_F_REQUEST | rtnetlink.NLM_F_ACK,
      },
      ifi: {
        ifi_family: AF_PACKET,
        ifi_index: ifindex,
      },
    });

    const message = result[0];

    const basic = {
      ifindex,
      family: message.ifi.ifi_family,
    };

    const { unknownRTAs, ...json } = linkRTAs.unmarshal(message.rta);

    if (provideUnknown) {
      return {
        ...basic,
        ...json,
        unknownRTAs,
      };
    } else {
      return {
        ...basic,
        ...json,
      };
    }
  };

  const modify = async ({ flags, ...attributes }) => {
    const rtattrs = linkRTAs.marshal(attributes);

    await rt.talk({
      header: {
        nlmsg_type: rtnetlink.RTM_NEWLINK,
        nlmsg_flags: rtnetlink.NLM_F_REQUEST | rtnetlink.NLM_F_ACK,
      },
      ifi: {
        ifi_family: AF_PACKET,
        ifi_index: ifindex,
        ifi_flags: linkFlags.mask(flags || {}),
        ifi_change: linkFlags.changeMask(flags || {}),
      },
      rta: rtattrs,
    });
  };

  const deleteLink = async () => {
    await rt.talk({
      header: {
        nlmsg_type: rtnetlink.RTM_DELLINK,
        nlmsg_flags: rtnetlink.NLM_F_REQUEST | rtnetlink.NLM_F_ACK,
      },
      ifi: {
        ifi_family: AF_UNSPEC,
        ifi_index: ifindex,
      },
    });
  };

  return {
    ifindex,
    fetch,
    modify,
    deleteLink,
  };
};

const create = ({ rt }) => {
  const fromIndex = ({ ifindex }) => {
    return linkFromIndex({ rt, ifindex });
  };

  const ifi = ({ family, type, flags }) => {
    const flagsOrNone = flags || {};
    return {
      ifi_family: family || AF_UNSPEC,
      ifi_type: type || 0n,
      ifi_flags: linkFlags.mask(flagsOrNone),
      ifi_change: linkFlags.changeMask(flagsOrNone),
    };
  };

  const findAllBy = async ({ flags, family, type, ...attributes }) => {
    const rtattrs = linkRTAs.marshal(attributes);

    const nlmsg_flags = rtnetlink.NLM_F_REQUEST | rtnetlink.NLM_F_ACK;

    const { errorCode, packets } = await rt.tryTalk({
      header: {
        nlmsg_type: rtnetlink.RTM_GETLINK,
        nlmsg_flags,
      },
      ifi: ifi({ family, type, flags }),
      rta: rtattrs,
    });

    if (errorCode === ENODEV) {
      return [];
    } else if (errorCode !== 0) {
      throw netlink.createErrorFromErrorCode({ errorCode });
    }

    return packets.map((response) => {
      const ifindex = response.ifi.ifi_index;
      return fromIndex({ ifindex });
    });
  };

  const tryFindOneBy = async ({ flags, family, type, ...attributes }) => {
    const result = await findAllBy({ flags, family, type, ...attributes });

    if (result.length === 1) {
      return result[0];
    } else {
      return undefined;
    }
  };

  const findOneBy = async ({ flags, family, type, ...attributes }) => {
    const result = await findAllBy({ flags, family, type, ...attributes });

    if (result.length === 0) {
      throw new Error(`interface not found`);
    } else if (result.length > 1) {
      throw new Error(`got multiple responses for query`);
    }

    return result[0];
  };

  const tryCreateLink = async (opts) => {
    const { ifindex, family, flags, ...attributes } = opts;
    const rtattrs = linkRTAs.marshal(attributes);

    const { errorCode } = await rt.tryTalk({
      header: {
        nlmsg_type: rtnetlink.RTM_NEWLINK,
        nlmsg_flags:
          rtnetlink.NLM_F_REQUEST |
          rtnetlink.NLM_F_CREATE |
          rtnetlink.NLM_F_EXCL |
          rtnetlink.NLM_F_ACK,
      },
      ifi: {
        ifi_family: family || AF_UNSPEC,
        ifi_index: ifindex,
        ifi_flags: linkFlags.mask(flags || {}),
        ifi_change: linkFlags.changeMask(flags || {}),
      },
      rta: rtattrs,
    });

    return {
      errorCode,
    };
  };

  const createLink = async (opts) => {
    const maxTries = 1;

    for (let triesLeft = maxTries; triesLeft > 0; triesLeft -= 1) {
      const ifindex = await linkUtil.findNextUnusedIndex({ rt });
      const { errorCode } = await tryCreateLink(
        Object.assign({}, opts, {
          ifindex,
        })
      );

      if (errorCode === 0) {
        return fromIndex({ ifindex });
      } else if (errorCode !== EEXIST) {
        throw netlink.createErrorFromErrorCode({
          errorCode,
          message: "failed to create link",
        });
      }
    }

    throw new Error(
      `failed to create link, got EEXIST ${maxTries} times, assuming ifindex prediction is broken`
    );
  };

  return {
    fromIndex,
    findAllBy,
    tryFindOneBy,
    findOneBy,
    createLink,
  };
};

export default {
  create,
};
