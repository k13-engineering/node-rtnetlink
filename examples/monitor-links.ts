// Prints link notifications of the kernel until interrupted, like `ip monitor link`.
//
//   node examples/monitor-links.ts

import {
  hostStructures,
  parseLinkAttributes,
  parseLinkFlags,
  parseLinkMessage,
  RTM_DELLINK,
  RTMGRP_LINK
} from "../lib/index.ts";
import { openRtnetlink } from "./open-rtnetlink.ts";

const { close } = openRtnetlink({
  nl_groups: RTMGRP_LINK,
  onMessage: ({ message }) => {
    const linkMessage = parseLinkMessage({ message });

    if (linkMessage === undefined) {
      return;
    }

    const { attributes } = parseLinkAttributes({ rta: linkMessage.rta, structures: hostStructures });
    const { IFF_UP } = parseLinkFlags({ ifi_flags: linkMessage.ifi.ifi_flags });
    const state = IFF_UP ? "up" : "down";
    const event = linkMessage.header.nlmsg_type === RTM_DELLINK ? "removed" : state;

    console.log(`${linkMessage.ifi.ifi_index}: ${attributes.name} ${event}`);
  },
});

console.log("listening for link events, press Ctrl+C to stop");

process.once("SIGINT", () => {
  close();
});
