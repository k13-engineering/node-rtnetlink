// values from <sys/socket.h>, <linux/rtnetlink.h>, <linux/if_link.h>, <linux/if.h> and <linux/netlink.h>

// address families, used as ifi_family
const AF_UNSPEC = 0n;
const AF_PACKET = 17n;

// rtnetlink message types for links
const RTM_NEWLINK = 16n;
const RTM_DELLINK = 17n;
const RTM_GETLINK = 18n;
const RTM_SETLINK = 19n;

// multicast group for link notifications, to be bound as nl_groups
const RTMGRP_LINK = 1n;

// link attributes
const IFLA_UNSPEC = 0n;
const IFLA_ADDRESS = 1n;
const IFLA_BROADCAST = 2n;
const IFLA_IFNAME = 3n;
const IFLA_MTU = 4n;
const IFLA_LINK = 5n;
const IFLA_QDISC = 6n;
const IFLA_STATS = 7n;
const IFLA_MASTER = 10n;
const IFLA_TXQLEN = 13n;
const IFLA_OPERSTATE = 16n;
const IFLA_LINKMODE = 17n;
const IFLA_LINKINFO = 18n;
const IFLA_IFALIAS = 20n;
const IFLA_GROUP = 27n;

// nested attributes of IFLA_LINKINFO
const IFLA_INFO_UNSPEC = 0n;
const IFLA_INFO_KIND = 1n;
const IFLA_INFO_DATA = 2n;
const IFLA_INFO_XSTATS = 3n;
const IFLA_INFO_SLAVE_KIND = 4n;
const IFLA_INFO_SLAVE_DATA = 5n;

// nested attributes of IFLA_INFO_DATA for macvlan and macvtap links
const IFLA_MACVLAN_UNSPEC = 0n;
const IFLA_MACVLAN_MODE = 1n;
const IFLA_MACVLAN_FLAGS = 2n;

// values of IFLA_MACVLAN_MODE
const MACVLAN_MODE_PRIVATE = 1n;
const MACVLAN_MODE_VEPA = 2n;
const MACVLAN_MODE_BRIDGE = 4n;
const MACVLAN_MODE_PASSTHRU = 8n;
const MACVLAN_MODE_SOURCE = 16n;

// flags of an rtattr type
const NLA_F_NESTED = 0x8000n;
const NLA_F_NET_BYTEORDER = 0x4000n;
const NLA_TYPE_MASK = 0x3FFFn;

// link flags, ifi_flags and ifi_change
const IFF_UP = 0x1n;
const IFF_BROADCAST = 0x2n;
const IFF_DEBUG = 0x4n;
const IFF_LOOPBACK = 0x8n;
const IFF_POINTOPOINT = 0x10n;
const IFF_NOTRAILERS = 0x20n;
const IFF_RUNNING = 0x40n;
const IFF_NOARP = 0x80n;
const IFF_PROMISC = 0x100n;
const IFF_ALLMULTI = 0x200n;
const IFF_MASTER = 0x400n;
const IFF_SLAVE = 0x800n;
const IFF_MULTICAST = 0x1000n;
const IFF_PORTSEL = 0x2000n;
const IFF_AUTOMEDIA = 0x4000n;
const IFF_DYNAMIC = 0x8000n;
const IFF_LOWER_UP = 0x10000n;
const IFF_DORMANT = 0x20000n;
const IFF_ECHO = 0x40000n;

export {
  AF_UNSPEC,
  AF_PACKET,

  RTM_NEWLINK,
  RTM_DELLINK,
  RTM_GETLINK,
  RTM_SETLINK,

  RTMGRP_LINK,

  IFLA_UNSPEC,
  IFLA_ADDRESS,
  IFLA_BROADCAST,
  IFLA_IFNAME,
  IFLA_MTU,
  IFLA_LINK,
  IFLA_QDISC,
  IFLA_STATS,
  IFLA_MASTER,
  IFLA_TXQLEN,
  IFLA_OPERSTATE,
  IFLA_LINKMODE,
  IFLA_LINKINFO,
  IFLA_IFALIAS,
  IFLA_GROUP,

  IFLA_INFO_UNSPEC,
  IFLA_INFO_KIND,
  IFLA_INFO_DATA,
  IFLA_INFO_XSTATS,
  IFLA_INFO_SLAVE_KIND,
  IFLA_INFO_SLAVE_DATA,

  IFLA_MACVLAN_UNSPEC,
  IFLA_MACVLAN_MODE,
  IFLA_MACVLAN_FLAGS,

  MACVLAN_MODE_PRIVATE,
  MACVLAN_MODE_VEPA,
  MACVLAN_MODE_BRIDGE,
  MACVLAN_MODE_PASSTHRU,
  MACVLAN_MODE_SOURCE,

  NLA_F_NESTED,
  NLA_F_NET_BYTEORDER,
  NLA_TYPE_MASK,

  IFF_UP,
  IFF_BROADCAST,
  IFF_DEBUG,
  IFF_LOOPBACK,
  IFF_POINTOPOINT,
  IFF_NOTRAILERS,
  IFF_RUNNING,
  IFF_NOARP,
  IFF_PROMISC,
  IFF_ALLMULTI,
  IFF_MASTER,
  IFF_SLAVE,
  IFF_MULTICAST,
  IFF_PORTSEL,
  IFF_AUTOMEDIA,
  IFF_DYNAMIC,
  IFF_LOWER_UP,
  IFF_DORMANT,
  IFF_ECHO,
};
