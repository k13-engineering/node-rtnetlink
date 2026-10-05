// Shared setup of the examples: the application opens and binds the NETLINK_ROUTE socket with po6,
// node-netlink speaks netlink on top of it and node-rtnetlink speaks rtnetlink on top of node-netlink.

import { createPoller } from "@k13engineering/uv-poll";
import { pinBuffer } from "buffer2address";
import {
  AF_NETLINK,
  createNetlinkSocket,
  createPo6NetlinkTransport,
  formatNetlinkAddress,
  NETLINK_ROUTE,
  type TNetlinkMessage
} from "node-netlink";
import {
  createKernelAbiFor,
  createLinuxKernelInterface,
  createPo6Api,
  hostAbi
} from "po6";
import { syscall, syscallNumbers } from "syscall-napi";
import { createRtnetlink } from "../lib/index.ts";

// <linux/net.h> and <asm-generic/fcntl.h>
const SOCK_RAW = 3n;
const SOCK_CLOEXEC = 0o2000000n;

const kernelAbi = createKernelAbiFor({ machineAbi: hostAbi });

const po6 = createPo6Api({
  kernelInterface: createLinuxKernelInterface({ syscall, syscallNumbers }),
  kernelAbi,
  memory: { pinBuffer },
});

const throwOnErrno = ({ operation, errno }: { operation: string, errno: number | undefined }) => {
  if (errno !== undefined) {
    throw po6.createErrorFromErrno({ operation, errno });
  }
};

const openRtnetlink = ({ nl_groups = 0n, onMessage }: {
  nl_groups?: bigint,
  onMessage?: (args: { message: TNetlinkMessage }) => void,
} = {}) => {
  const { errno, fd } = po6.socket({ domain: AF_NETLINK, type: SOCK_RAW | SOCK_CLOEXEC, protocol: NETLINK_ROUTE });
  throwOnErrno({ operation: "socket()", errno });

  const { errno: bindErrno } = po6.bind({
    fd: fd as number,
    sockaddr: formatNetlinkAddress({ address: { nl_pid: 0n, nl_groups } }),
  });
  throwOnErrno({ operation: "bind()", errno: bindErrno });

  const transport = createPo6NetlinkTransport({ fd: fd as number, po6, kernelAbi, createPoller });
  const netlink = createNetlinkSocket({ transport, onMessage });
  const rt = createRtnetlink({ netlink });

  const close = () => {
    netlink.detach();
    po6.close({ fd: fd as number });
  };

  return { rt, close };
};

export {
  openRtnetlink,
};
