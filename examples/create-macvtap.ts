// Creates a macvtap link in bridge mode on a lower link, like
// `ip link add link eth0 name macvtap0 type macvtap mode bridge`, brings it up, assigns an address
// and deletes it again. A virtual machine would read and write its frames through /dev/tap<ifindex>.
// Needs CAP_NET_ADMIN, e.g. in a throwaway network namespace:
//
//   sudo unshare -n node examples/create-macvtap.ts           # on a dummy link created for the example
//   sudo node examples/create-macvtap.ts eth0                  # on an existing link
//
// To create the macvtap directly in the network namespace of a container, use createLinkInNamespace().

import { openRtnetlink } from "./open-rtnetlink.ts";

const lowerName = process.argv[2];

const { rt, close } = openRtnetlink();

try {
  const lower = lowerName === undefined
    ? await rt.link.createLink({ name: "lower0", linkinfo: { kind: "dummy" }, flags: { IFF_UP: true } })
    : await rt.link.findOneBy({ name: lowerName });

  const macvtap = await rt.link.createLink({
    name: "macvtap0",
    linkIndex: lower.ifindex,
    linkinfo: { kind: "macvtap", data: { mode: "bridge" } },
    flags: { IFF_UP: true },
  });

  await rt.address.add({ ifindex: macvtap.ifindex, address: "192.0.2.10", prefixLength: 24 });

  const info = await macvtap.fetch();
  console.log(`${info.name} (${info.ifindex}) on link ${info.linkIndex}, ${info.linkinfo?.kind} mode ${info.linkinfo?.data?.mode}`);
  console.log(`  up: ${info.flags.IFF_UP}, frames through /dev/tap${info.ifindex}`);

  const addresses = await rt.address.listAll({ ifindex: macvtap.ifindex, family: "inet" });
  addresses.forEach(({ address, prefixLength }) => {
    console.log(`  ${address}/${prefixLength}`);
  });

  await macvtap.deleteLink();

  if (lowerName === undefined) {
    await lower.deleteLink();
  }

  console.log("deleted");
} finally {
  close();
}
