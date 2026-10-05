// Lists the network interfaces of the host, like `ip link show`.
//
//   node examples/list-links.ts

import { openRtnetlink } from "./open-rtnetlink.ts";

const formatAddress = ({ address }: { address: Uint8Array | undefined }) => {
  return address === undefined ? "-" : [...address].map((byte) => {
    return byte.toString(16).padStart(2, "0");
  }).join(":");
};

const { rt, close } = openRtnetlink();

try {
  const links = await rt.link.listAll();

  links.forEach((info) => {
    const state = info.flags.IFF_UP ? "UP" : "DOWN";
    const kind = info.linkinfo?.kind ?? "-";
    console.log(`${info.ifindex}: ${info.name} ${state} mtu ${info.mtu} kind ${kind} address ${formatAddress({ address: info.address })}`);
  });
} finally {
  close();
}
