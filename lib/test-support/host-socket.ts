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

// a handle on the network namespace of the calling thread
const openNetns = () => {
  const { O_RDONLY, O_CLOEXEC } = kernelAbi.constants;
  const { errno, fd } = po6.open({ pathname: "/proc/thread-self/ns/net", flags: O_RDONLY | O_CLOEXEC });
  throwOnErrno({ operation: "open()", errno });
  return fd as number;
};

const switchNetns = ({ fd }: { fd: number }) => {
  throwOnErrno({ operation: "setns()", errno: po6.setns({ fd, nstype: kernelAbi.constants.CLONE_NEWNET }).errno });
};

// runs callback in the network namespace of fd and always switches back
const withNetns = <T>({ fd, callback }: { fd: number, callback: () => T }): T => {
  const original = openNetns();

  try {
    switchNetns({ fd });
    return callback();
  } finally {
    switchNetns({ fd: original });
    po6.close({ fd: original });
  }
};

/**
 * Creates a network namespace, which exists as long as the returned file descriptor is open. Needs CAP_SYS_ADMIN.
 */
const createNetns = () => {
  const original = openNetns();

  try {
    throwOnErrno({ operation: "unshare()", errno: po6.unshare({ flags: kernelAbi.constants.CLONE_NEWNET }).errno });
    return openNetns();
  } finally {
    switchNetns({ fd: original });
    po6.close({ fd: original });
  }
};

const openSocket = () => {
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

  return fd as number;
};

/**
 * Opens and binds a real NETLINK_ROUTE socket, in the given network namespace or the current one,
 * and attaches node-netlink to it, like users of the library do.
 */
const openHostNetlinkSocket = ({ netnsFd }: { netnsFd?: number } = {}) => {
  const fd = netnsFd === undefined ? openSocket() : withNetns({ fd: netnsFd, callback: openSocket });

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
  po6,
  openHostNetlinkSocket,
  createNetns,
};
