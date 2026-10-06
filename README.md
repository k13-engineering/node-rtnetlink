# node-rtnetlink

[![CI](https://github.com/k13-engineering/node-rtnetlink/actions/workflows/ci.yml/badge.svg)](https://github.com/k13-engineering/node-rtnetlink/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/node-rtnetlink)](https://www.npmjs.com/package/node-rtnetlink)

Linux [rtnetlink](https://man7.org/linux/man-pages/man7/rtnetlink.7.html) for Node.js, written in TypeScript: list, find, create, modify and delete network interfaces, and assign IP addresses to them.

- **Bring your own socket.** node-rtnetlink talks through a [node-netlink](https://www.npmjs.com/package/node-netlink) socket that you pass in. It never opens, binds or closes a socket itself.
- **High-level link API.** Links are plain objects with `name`, `mtu`, `address`, `flags`, `linkinfo` and more, instead of raw attributes.
- **Low-level access.** Requests with `struct ifinfomsg` and raw `rtattr`s, and the codecs behind the link API, are available as well.
- **Checked against the C headers.** The layouts of `struct ifinfomsg` and `struct rtattr` are defined with [ya-struct](https://www.npmjs.com/package/ya-struct) and compared with `<linux/rtnetlink.h>` in the tests, as are all constants.

## Requirements

- Linux
- Node.js 24 or newer

## Installation

```sh
npm install node-rtnetlink node-netlink
```

To open the socket with po6 as in the examples below, also install po6 with its syscall and memory backends and a poller:

```sh
npm install po6 syscall-napi buffer2address @k13engineering/uv-poll
```

## Usage

### Setup

Open and bind a `NETLINK_ROUTE` socket, attach node-netlink to it and node-rtnetlink to node-netlink:

```ts
import { createPoller } from "@k13engineering/uv-poll";
import { pinBuffer } from "buffer2address";
import {
  AF_NETLINK,
  NETLINK_ROUTE,
  createNetlinkSocket,
  createPo6NetlinkTransport,
  formatNetlinkAddress,
} from "node-netlink";
import { createKernelAbiFor, createLinuxKernelInterface, createPo6Api, hostAbi } from "po6";
import { syscall, syscallNumbers } from "syscall-napi";
import { createRtnetlink } from "node-rtnetlink";

const kernelAbi = createKernelAbiFor({ machineAbi: hostAbi });
const po6 = createPo6Api({
  kernelInterface: createLinuxKernelInterface({ syscall, syscallNumbers }),
  kernelAbi,
  memory: { pinBuffer },
});

// <linux/net.h> and <asm-generic/fcntl.h>
const SOCK_RAW = 3n;
const SOCK_CLOEXEC = 0o2000000n;

// your socket: opened, bound and closed by your code
const { errno, fd } = po6.socket({ domain: AF_NETLINK, type: SOCK_RAW | SOCK_CLOEXEC, protocol: NETLINK_ROUTE });
if (errno !== undefined) {
  throw po6.createErrorFromErrno({ operation: "socket()", errno });
}

const { errno: bindErrno } = po6.bind({ fd, sockaddr: formatNetlinkAddress({ address: { nl_pid: 0n, nl_groups: 0n } }) });
if (bindErrno !== undefined) {
  throw po6.createErrorFromErrno({ operation: "bind()", errno: bindErrno });
}

const netlink = createNetlinkSocket({ transport: createPo6NetlinkTransport({ fd, po6, kernelAbi, createPoller }) });
const rt = createRtnetlink({ netlink });
```

When you are done, detach node-netlink and close the socket:

```ts
netlink.detach();
po6.close({ fd });
```

### Links

```ts
// all links of the network namespace
const links = await rt.link.listAll();
links.forEach(({ ifindex, name, mtu, flags }) => {
  console.log(`${ifindex}: ${name} mtu ${mtu} ${flags.IFF_UP ? "UP" : "DOWN"}`);
});

// look up a link and fetch its current state
const lo = await rt.link.findOneBy({ name: "lo" });
const { address, flags } = await lo.fetch();
```

Creating and changing links needs `CAP_NET_ADMIN`:

```ts
const bridge = await rt.link.createLink({ name: "br0", linkinfo: { kind: "bridge" } });
const port = await rt.link.createLink({ name: "dummy0", linkinfo: { kind: "dummy" } });

await port.modify({ masterIndex: bridge.ifindex, flags: { IFF_UP: true } });
await bridge.modify({ mtu: 1400, flags: { IFF_UP: true } });

await port.deleteLink();
await bridge.deleteLink();
```

Errors of the kernel reject with an error that has the `errno` attached, e.g. `creating link failed with EPERM`.

### Addresses

```ts
const eth0 = await rt.link.findOneBy({ name: "eth0" });

// the kernel adds the route to the subnet by itself
await rt.address.add({ ifindex: eth0.ifindex, address: "192.0.2.10", prefixLength: 24 });
await rt.address.add({ ifindex: eth0.ifindex, address: "2001:db8::10", prefixLength: 64, flags: { IFA_F_NODAD: true } });

const addresses = await rt.address.listAll({ ifindex: eth0.ifindex });
addresses.forEach(({ family, address, prefixLength }) => {
  console.log(`${family} ${address}/${prefixLength}`);
});

await rt.address.remove({ ifindex: eth0.ifindex, address: "192.0.2.10", prefixLength: 24 });
```

Addresses of a link in another network namespace are assigned with a `createRtnetlink()` instance whose socket was created in that namespace, as `RTM_NEWADDR` has no attribute for the namespace.

### Network namespaces

A NETLINK_ROUTE socket works on the network namespace it was created in. Links can be created in, or moved to, another namespace, given by a file descriptor referring to it (`IFLA_NET_NS_FD`) or the pid of a process in it (`IFLA_NET_NS_PID`):

```ts
// e.g. the namespace of a container
const netns = { fd: po6.open({ pathname: "/proc/1234/ns/net", flags: O_RDONLY | O_CLOEXEC }).fd };

// a macvtap on eth0 of this namespace, created directly in the other one
const eth0 = await rt.link.findOneBy({ name: "eth0" });
await rt.link.createLinkInNamespace({
  netns,
  name: "macvtap0",
  linkIndex: eth0.ifindex,
  linkinfo: { kind: "macvtap", data: { mode: "bridge" } },
});

// or move an existing link there
await (await rt.link.findOneBy({ name: "dummy0" })).moveToNamespace({ netns });
```

The kernel picks the index of the link in the other namespace and does not report it, so `createLinkInNamespace()` needs a `name` and resolves without a link. To work with the link afterwards, e.g. to bring it up, use a `createRtnetlink()` instance whose socket was created in that namespace. With po6, enter the namespace with `setns()`, create the socket and switch back, see the po6 README.

### Notifications

Bind the socket to `RTMGRP_LINK` and parse the messages node-netlink passes to `onMessage`:

```ts
import { hostStructures, parseLinkAttributes, parseLinkMessage, RTMGRP_LINK } from "node-rtnetlink";

// bind with nl_groups: RTMGRP_LINK, then
const netlink = createNetlinkSocket({
  transport,
  onMessage: ({ message }) => {
    const linkMessage = parseLinkMessage({ message });

    if (linkMessage !== undefined) {
      const { attributes } = parseLinkAttributes({ rta: linkMessage.rta, structures: hostStructures });
      console.log(linkMessage.header.nlmsg_type, attributes.name);
    }
  },
});
```

See [examples/](examples/) for complete programs that list links, create a bridge and monitor link changes.

## API

All functions take a single object of arguments.

### `createRtnetlink({ netlink, structures? })`

- `netlink`: a node-netlink socket, or anything with its `talk()` and `tryTalk()`, e.g. a fake in tests
- `structures`: layouts of the kernel structures, `hostStructures` by default

Returns `{ link, address, talk, tryTalk }`.

### `rt.link`

| Function | Description |
| --- | --- |
| `listAll()` | resolves with a `TLinkInfo` for every link |
| `findAllBy(criteria)` | resolves with all links that match the criteria |
| `findOneBy(criteria)` | resolves with the only matching link, rejects if there is none or more than one |
| `tryFindOneBy(criteria)` | like `findOneBy()`, but resolves with `undefined` instead of rejecting |
| `fromIndex({ ifindex })` | returns the link with this index, without talking to the kernel |
| `createLink({ flags?, ...attributes })` | creates a link and resolves with it |
| `createLinkInNamespace({ netns, name, flags?, ...attributes })` | creates a link directly in another network namespace, see [Network namespaces](#network-namespaces) |

The criteria are link attributes, `type` and `flags`. A link matches if all given values are equal. For `linkinfo`, only the given fields are compared, and for `flags`, only the given flags. The links are filtered after dumping all of them, as the kernel can only look up single links by name or index.

`createLink()` needs to know the index of the new link. With a `name`, the kernel picks the index: kernels since 6.3 report the new link back (`NLM_F_ECHO`), older ones are asked for the link with that name afterwards. If the name is taken, it rejects with `EEXIST`. Without a `name`, nothing identifies the link on older kernels, so `createLink()` requests the next free index explicitly and retries up to 3 times if the kernel reports `EEXIST` or `EBUSY`, e.g. because another process created a link at the same time, or because a link created along with the new one, like the peer of a veth link, took the index. Give links a name where possible.

A link (`TLink`) has:

| Member | Description |
| --- | --- |
| `ifindex` | the index of the link |
| `fetch()` | resolves with the current `TLinkInfo`, rejects with `ENODEV` if the link does not exist |
| `modify({ flags?, ...attributes })` | changes the given attributes and flags |
| `deleteLink()` | deletes the link |
| `moveToNamespace({ netns })` | moves the link into another network namespace, where it may get another index. The handle is of no use afterwards |

`TLinkInfo` contains `ifindex`, `type` (`ARPHRD_*`), `flags`, the link attributes the kernel reported and `unknownAttributes`, the raw `rtattr`s node-rtnetlink has no definition for.

### Link attributes

| Attribute | rtattr | Type |
| --- | --- | --- |
| `name` | `IFLA_IFNAME` | `string` |
| `mtu` | `IFLA_MTU` | `number` |
| `address` | `IFLA_ADDRESS` | `Uint8Array` |
| `broadcast` | `IFLA_BROADCAST` | `Uint8Array` |
| `txqlen` | `IFLA_TXQLEN` | `number` |
| `masterIndex` | `IFLA_MASTER` | `number`, 0 removes the link from its master |
| `linkIndex` | `IFLA_LINK` | `number`, the lower link of a virtual link, e.g. the parent of a macvlan link |
| `linkinfo` | `IFLA_LINKINFO` | `{ kind?: string, slaveKind?: string, data?: TLinkinfoData }` |

`linkinfo.data` holds the kind specific attributes of `IFLA_INFO_DATA`. They are supported for `macvlan` and `macvtap` links, as `{ mode?: "private" | "vepa" | "bridge" | "passthru" | "source" }`, the kernel uses `"vepa"` if the mode is omitted. For other kinds, `data` is left out when parsing, and setting it throws.

```ts
const eth0 = await rt.link.findOneBy({ name: "eth0" });
const macvtap = await rt.link.createLink({
  name: "macvtap0",
  linkIndex: eth0.ifindex,
  linkinfo: { kind: "macvtap", data: { mode: "bridge" } },
});
```

### Link flags

`flags` is an object with the `IFF_*` flags of `<linux/if.h>` as keys, e.g. `{ IFF_UP: true, IFF_PROMISC: false }`. In `TLinkInfo`, all flags are present. For `modify()` and `createLink()`, `true` sets a flag, `false` clears it, and flags that are not given stay unchanged.

### `rt.address`

| Function | Description |
| --- | --- |
| `add({ ifindex, address, prefixLength, peer?, broadcast?, label?, scope?, flags? })` | assigns an address to a link, rejects with `EEXIST` if it has it already |
| `remove({ ifindex, address, prefixLength })` | removes an address from a link, rejects with `EADDRNOTAVAIL` if it does not have it |
| `listAll({ ifindex?, family? })` | resolves with a `TAddressInfo` for every address, of all links or the given one, and of both or the given family |

Addresses are strings like `"192.0.2.1"` or `"2001:db8::1"`, the family (`"inet"` or `"inet6"`) follows from them. `add()` sends the address as `IFA_LOCAL` and `IFA_ADDRESS`, or `peer` as `IFA_ADDRESS` for point-to-point links. `scope` is `"universe"` (default), `"site"`, `"link"`, `"host"` or `"nowhere"`. `flags` is an object with the `IFA_F_*` flags as keys, e.g. `{ IFA_F_NODAD: true }`, sent in `ifa_flags` and, as some do not fit there, in `IFA_FLAGS`.

`TAddressInfo` contains `ifindex`, `family`, `address`, `prefixLength`, `scope`, all `flags`, and `peer`, `broadcast` and `label` if the kernel reports them, as well as `unknownAttributes`, e.g. `IFA_CACHEINFO`. `IFA_F_SECONDARY` and `IFA_F_TEMPORARY` are the same bit, which marks temporary addresses for IPv6.

Like `rt.talk()`, `rt.address.talk({ header, ifa, rta?, timeoutMs? })` and `rt.address.tryTalk()` send address requests (`RTM_NEWADDR`, `RTM_DELADDR` or `RTM_GETADDR`) with a `struct ifaddrmsg` and resolve with the responses as `{ header, ifa, rta }`. For notifications of `RTMGRP_IPV4_IFADDR` and `RTMGRP_IPV6_IFADDR`, `parseAddressMessage({ message })` parses node-netlink messages of address types, and `addressInfoOf({ message })` turns them into a `TAddressInfo`.

### Low-level API

`rt.talk({ header, ifi, rta?, timeoutMs? })` sends a link request (`RTM_NEWLINK`, `RTM_DELLINK`, `RTM_GETLINK` or `RTM_SETLINK`) and resolves with the responses as `{ header, ifi, rta }`. Missing `ifi` fields are 0. `rt.tryTalk()` resolves with `{ errno, messages }` instead of rejecting.

```ts
import { NLM_F_DUMP } from "node-netlink";
import { AF_PACKET, RTM_GETLINK } from "node-rtnetlink";

const messages = await rt.talk({
  header: { nlmsg_type: RTM_GETLINK, nlmsg_flags: NLM_F_DUMP },
  ifi: { ifi_family: AF_PACKET },
});
```

| Function | Description |
| --- | --- |
| `parseLinkMessage({ message, structures? })` | parses a node-netlink message of a link type, `undefined` for other types |
| `formatIfinfoPayload({ ifi, rta?, structures })`, `parseIfinfoPayload({ payload, structures })` | `struct ifinfomsg` followed by attributes |
| `formatIfaddrPayload({ ifa, rta?, structures })`, `parseIfaddrPayload({ payload, structures })` | `struct ifaddrmsg` followed by attributes |
| `formatAddressFlags({ flags })`, `parseAddressFlags({ bits })` | address flags from and to the bits of `IFA_FLAGS` |
| `formatAttributes({ attributes, structures })`, `parseAttributes({ data, structures })` | lists of `rtattr` |
| `formatLinkAttributes({ attributes, structures })`, `parseLinkAttributes({ rta, structures })` | link attributes from and to `rtattr`s |
| `formatLinkFlags({ flags })`, `parseLinkFlags({ ifi_flags })` | link flags from and to `ifi_flags` and `ifi_change` |
| `parseIpAddress({ address })`, `formatIpAddress({ bytes })` | IPv4 and IPv6 addresses from and to their bytes in network byte order, formatted as recommended by RFC 5952 |
| `typeOfAttribute({ attribute })` | the type of an `rtattr` without `NLA_F_NESTED` and `NLA_F_NET_BYTEORDER` |
| `stringCodec`, `u32Codec`, `bytesCodec` | codecs of attribute values |

Pass `hostStructures` as `structures`, or `createRtnetlinkStructuresFor({ abi })` for another byte order. The ya-struct definitions of the structures are exported as `ifinfomsgDefinition`, `rtattrDefinition` and `ifaddrmsgDefinition`.

### Constants

`AF_UNSPEC`, `AF_PACKET`, `AF_INET`, `AF_INET6`, `RTM_*LINK`, `RTM_*ADDR`, `RTMGRP_LINK`, `RTMGRP_IPV4_IFADDR`, `RTMGRP_IPV6_IFADDR`, the address attributes `IFA_*`, the address flags `IFA_F_*`, the scopes `RT_SCOPE_*`, the attribute types `IFLA_*`, `IFLA_INFO_*` and `IFLA_MACVLAN_*`, the macvlan modes `MACVLAN_MODE_*`, `NLA_F_*`, `NLA_TYPE_MASK` and the link flags `IFF_*` are exported as `bigint`s.

## Migrating from 0.0.x

- node-rtnetlink no longer opens sockets. Replace `rtnetlink.open()` with your own socket and node-netlink socket, see [Setup](#setup), and `createRtnetlink({ netlink })`. `close()` is replaced by `detach()` of node-netlink and closing the socket yourself.
- The package is an ES module with named exports, there is no default export anymore.
- `ifindex`, `mtu` and `masterIndex` are `number`s instead of `bigint`s, `address` is a `Uint8Array` instead of an array of numbers.
- `fetch()` no longer takes `provideUnknown`, unknown attributes are always returned as `unknownAttributes`. It also returns `type` and `flags`.
- `findAllBy()` matches all given criteria on the client side, `family` is no criterion anymore.
- `tryTalk()` resolves with `{ errno, messages }` instead of `{ errorCode, packets }`.
- `on()` and `once()` are replaced by `onMessage` of node-netlink and `parseLinkMessage()`.
- The license is LGPL-2.1, like node-netlink.

## Development

```sh
npm ci
npm run build       # transpile to dist/
npm run type-check
npm run test        # mocha with c8, 100% coverage required
npm run lint
```

The sources are in `lib/`, tests are next to them as `*.spec.ts`:

- `lib/rtnetlink.ts`: link requests on top of an injected node-netlink socket
- `lib/link.ts`: the high-level link API
- `lib/link-attributes.ts`, `lib/linkinfo.ts`, `lib/link-flags.ts`: link attributes, linkinfo and flags
- `lib/address.ts`, `lib/ip-address.ts`: the address API and IP addresses
- `lib/ifinfo.ts`, `lib/ifaddr.ts`, `lib/rtattr.ts`, `lib/structures.ts`, `lib/constants.ts`: message formats, structure layouts and constants

The unit tests run against the fake kernel in `lib/test-support/fake-kernel.ts`. `lib/index.spec.ts` talks to the kernel of the host, which needs no privileges for reading. If `sudo` works without a password, it also creates, modifies and deletes links in a fresh network namespace, creates a macvtap in a second one and assigns addresses to it there. The structure layouts and constants are compared with the C headers by compiling C programs, so `gcc` and the Linux headers are required.

Releases are published by pushing a tag like `v0.1.0`, which builds the package, merges `package.npm.json` into `package.json` and sets the version.

## License

LGPL-2.1, see [LICENSE](LICENSE).
