// Creates, modifies and deletes links on the host kernel and prints what it observed as JSON.
// Needs CAP_NET_ADMIN, so it is run in a fresh network namespace, e.g. `sudo unshare -n node link-lifecycle.ts`.

import { createRtnetlink } from "../index.ts";
import { createNetns, openHostNetlinkSocket, po6 } from "./host-socket.ts";

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

  // a second network namespace with its own socket, like a container
  const netnsFd = createNetns();
  const inner = openHostNetlinkSocket({ netnsFd });
  const innerLink = createRtnetlink({ netlink: inner.netlink }).link;

  const namesOf = async ({ api }: { api: typeof link }) => {
    return (await api.listAll()).map(({ name }) => {
      return name;
    });
  };

  // a macvtap on a lower link of this namespace, created directly in the other one
  const outerLower = await link.createLink({ name: "nrt-lower1", linkinfo: { kind: "dummy" } });
  await link.createLinkInNamespace({
    netns: { fd: netnsFd },
    name: "nrt-nsmvt0",
    linkIndex: outerLower.ifindex,
    linkinfo: { kind: "macvtap", data: { mode: "bridge" } },
  });

  const moved = await link.createLink({ name: "nrt-move0", linkinfo: { kind: "dummy" } });
  await moved.moveToNamespace({ netns: { fd: netnsFd } });

  const outerNames = await namesOf({ api: link });
  const innerNames = await namesOf({ api: innerLink });
  const nsMacvtap = await (await innerLink.findOneBy({ name: "nrt-nsmvt0" })).fetch();

  await (await innerLink.findOneBy({ name: "nrt-nsmvt0" })).deleteLink();
  await (await innerLink.findOneBy({ name: "nrt-move0" })).deleteLink();
  await outerLower.deleteLink();
  inner.close();
  po6.close({ fd: netnsFd });

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
    namespaces: {
      outerNames,
      innerNames,
      outerLowerIndex: outerLower.ifindex,
      macvtap: { linkIndex: nsMacvtap.linkIndex, linkinfo: nsMacvtap.linkinfo },
    },
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
