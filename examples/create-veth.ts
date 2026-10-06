// Creates a veth pair, like `ip link add veth0 type veth peer name veth1`, brings both ends up,
// assigns an address to each and deletes the pair again. Needs CAP_NET_ADMIN, e.g. in a throwaway
// network namespace:
//
//   sudo unshare -n node examples/create-veth.ts
//
// To connect a container, move one end into its network namespace with moveToNamespace().

import { openRtnetlink } from "./open-rtnetlink.ts";

const { rt, close } = openRtnetlink();

try {
  // the kernel creates the peer together with the link
  const veth0 = await rt.link.createLink({
    name: "veth0",
    linkinfo: { kind: "veth", data: { peer: { name: "veth1" } } },
  });
  const veth1 = await rt.link.findOneBy({ name: "veth1" });

  await veth0.modify({ flags: { IFF_UP: true } });
  await veth1.modify({ flags: { IFF_UP: true } });

  await rt.address.add({ ifindex: veth0.ifindex, address: "10.42.0.1", prefixLength: 24 });
  await rt.address.add({ ifindex: veth1.ifindex, address: "10.42.0.2", prefixLength: 24 });

  // each end refers to the other one as its link
  const info0 = await veth0.fetch();
  const info1 = await veth1.fetch();
  console.log(`${info0.name} (${info0.ifindex}) <-> ${info1.name} (${info1.ifindex}), peer of ${info1.name} is ${info1.linkIndex}`);

  const addresses = await rt.address.listAll({ family: "inet" });
  addresses.filter(({ ifindex }) => {
    return ifindex === veth0.ifindex || ifindex === veth1.ifindex;
  }).forEach(({ ifindex, address, prefixLength }) => {
    console.log(`  ${ifindex}: ${address}/${prefixLength}`);
  });

  // deleting one end deletes both
  await veth0.deleteLink();
  console.log(`deleted, veth1 ${await rt.link.tryFindOneBy({ name: "veth1" }) === undefined ? "is gone too" : "still exists"}`);
} finally {
  close();
}
