import rtnetlink from "../../index.js";
import rta from "../../rta.js";

const AF_UNSPEC = 0n;
const AF_PACKET = 17n;


const findNextUnusedIndex = async ({ rt }) => {
  const result = await rt.talk({
    "header": {
      "nlmsg_type": rtnetlink.RTM_GETLINK,
      "nlmsg_flags": rtnetlink.NLM_F_REQUEST | rtnetlink.NLM_F_DUMP | rtnetlink.NLM_F_ACK
    },
    "ifi": {
      "ifi_family": AF_PACKET,
      "ifi_type": 0n
    },
    "rta": [
      // {
      //   "rta_type": rtnetlink.IFLA_IFNAME,
      //   "data": rta.types.asciiz.marshal("")
      // }
    ]
  });

  let highestIndex = 0n;

  result.filter((packet) => {
    return packet.header.nlmsg_type === rtnetlink.RTM_NEWLINK;
  }).forEach((packet) => {
    if(packet.ifi.ifi_index > highestIndex) {
      highestIndex = packet.ifi.ifi_index;
    }
  });

  return highestIndex + 1n;
};

export default {
  findNextUnusedIndex
};
