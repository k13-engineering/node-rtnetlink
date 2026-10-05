import { createPoller } from "@k13engineering/uv-poll";
import { pinBuffer } from "buffer2address";
import {
  AF_NETLINK,
  createNetlinkSocket,
  createPo6NetlinkTransport,
  formatNetlinkAddress,
  NETLINK_ROUTE
} from "node-netlink";
import {
  createKernelAbiFor,
  createLinuxKernelInterface,
  createPo6Api,
  hostAbi
} from "po6";
import { syscall, syscallNumbers } from "syscall-napi";

// <linux/net.h> and <asm-generic/fcntl.h>
const SOCK_RAW = 3n;
const SOCK_NONBLOCK = 0o4000n;
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

/**
 * Opens and binds a real NETLINK_ROUTE socket and attaches node-netlink to it, like users of the library do.
 */
const openHostNetlinkSocket = () => {
  const { errno, fd } = po6.socket({
    domain: AF_NETLINK,
    type: SOCK_RAW | SOCK_NONBLOCK | SOCK_CLOEXEC,
    protocol: NETLINK_ROUTE,
  });
  throwOnErrno({ operation: "socket()", errno });

  const { errno: bindErrno } = po6.bind({
    fd: fd as number,
    sockaddr: formatNetlinkAddress({ address: { nl_pid: 0n, nl_groups: 0n } }),
  });
  throwOnErrno({ operation: "bind()", errno: bindErrno });

  const transport = createPo6NetlinkTransport({ fd: fd as number, po6, kernelAbi, createPoller });
  const netlink = createNetlinkSocket({ transport });

  return {
    netlink,
    close: () => {
      netlink.detach();
      po6.close({ fd: fd as number });
    },
  };
};

export {
  openHostNetlinkSocket,
};
