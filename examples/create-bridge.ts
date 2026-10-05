// Creates a bridge, adds a dummy link to it, brings both up and deletes them again.
// Needs CAP_NET_ADMIN, e.g. in a throwaway network namespace:
//
//   sudo unshare -n node examples/create-bridge.ts

import { openRtnetlink } from "./open-rtnetlink.ts";

const { rt, close } = openRtnetlink();

try {
  const bridge = await rt.link.createLink({ name: "example-br0", linkinfo: { kind: "bridge" } });
  const port = await rt.link.createLink({ name: "example-dummy0", linkinfo: { kind: "dummy" } });

  await port.modify({ masterIndex: bridge.ifindex, flags: { IFF_UP: true } });
  await bridge.modify({ flags: { IFF_UP: true } });

  const ports = await rt.link.findAllBy({ masterIndex: bridge.ifindex });
  console.log(`bridge ${bridge.ifindex} has ports ${ports.map(({ ifindex }) => {
    return ifindex;
  }).join(", ")}`);

  await port.deleteLink();
  await bridge.deleteLink();
} finally {
  close();
}
