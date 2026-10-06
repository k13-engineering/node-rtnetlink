// Creates, modifies and deletes links on the host kernel and prints what it observed as JSON.
// Needs CAP_NET_ADMIN, so it is run in a fresh network namespace, e.g. `sudo unshare -n node link-lifecycle.ts`.

import { createRtnetlink } from "../index.ts";
import { openHostNetlinkSocket } from "./host-socket.ts";

const { netlink, close } = openHostNetlinkSocket();

try {
  const { link } = createRtnetlink({ netlink });

  const bridge = await link.createLink({ name: "nrt-br0", linkinfo: { kind: "bridge" } });
  const dummy = await link.createLink({ linkinfo: { kind: "dummy" }, mtu: 1400 });

  await dummy.modify({ name: "nrt-dummy0", masterIndex: bridge.ifindex, flags: { IFF_UP: true } });

  const lower = await link.createLink({ name: "nrt-lower0", linkinfo: { kind: "dummy" } });
  const macvtap = await link.createLink({
    name: "nrt-macvtap0",
    linkIndex: lower.ifindex,
    linkinfo: { kind: "macvtap", data: { mode: "bridge" } },
  });
  const macvtapInfo = await macvtap.fetch();
  await macvtap.deleteLink();
  await lower.deleteLink();

  const dummyInfo = await dummy.fetch();
  const bridges = await link.findAllBy({ linkinfo: { kind: "bridge" } });
  const duplicate = await link.createLink({ name: "nrt-br0", linkinfo: { kind: "bridge" } }).then(() => {
    return "created";
  }, (error) => {
    return error.message;
  });

  await dummy.deleteLink();
  await bridge.deleteLink();

  const remaining = await link.listAll();

  console.log(JSON.stringify({
    bridgeIndex: bridge.ifindex,
    dummyIndex: dummy.ifindex,
    dummy: {
      name: dummyInfo.name,
      mtu: dummyInfo.mtu,
      masterIndex: dummyInfo.masterIndex,
      linkinfo: dummyInfo.linkinfo,
      up: dummyInfo.flags.IFF_UP,
    },
    bridgeIndexes: bridges.map(({ ifindex }) => {
      return ifindex;
    }),
    duplicate,
    macvtap: {
      lowerIndex: lower.ifindex,
      linkIndex: macvtapInfo.linkIndex,
      linkinfo: macvtapInfo.linkinfo,
    },
    remaining: remaining.map(({ name }) => {
      return name;
    }),
  }));
} finally {
  close();
}
