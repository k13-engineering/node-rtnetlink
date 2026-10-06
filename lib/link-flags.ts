import {
  IFF_ALLMULTI,
  IFF_AUTOMEDIA,
  IFF_BROADCAST,
  IFF_DEBUG,
  IFF_DORMANT,
  IFF_DYNAMIC,
  IFF_ECHO,
  IFF_LOOPBACK,
  IFF_LOWER_UP,
  IFF_MASTER,
  IFF_MULTICAST,
  IFF_NOARP,
  IFF_NOTRAILERS,
  IFF_POINTOPOINT,
  IFF_PORTSEL,
  IFF_PROMISC,
  IFF_RUNNING,
  IFF_SLAVE,
  IFF_UP
} from "./constants.ts";

// spelled out, as the declaration files are generated per file and could not infer the types of the imported values
type TLinkFlagName =
  "IFF_UP" | "IFF_BROADCAST" | "IFF_DEBUG" | "IFF_LOOPBACK" | "IFF_POINTOPOINT" | "IFF_NOTRAILERS" | "IFF_RUNNING" |
  "IFF_NOARP" | "IFF_PROMISC" | "IFF_ALLMULTI" | "IFF_MASTER" | "IFF_SLAVE" | "IFF_MULTICAST" | "IFF_PORTSEL" |
  "IFF_AUTOMEDIA" | "IFF_DYNAMIC" | "IFF_LOWER_UP" | "IFF_DORMANT" | "IFF_ECHO";

const linkFlagValues: Record<TLinkFlagName, bigint> = {
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

// flags to set (true) or clear (false), flags that are not given are left unchanged
type TLinkFlags = Partial<Record<TLinkFlagName, boolean>>;

const valueOfFlag = ({ name }: { name: string }) => {
  if (!Object.hasOwn(linkFlagValues, name)) {
    throw Error(`unknown link flag "${name}"`);
  }

  return linkFlagValues[name as TLinkFlagName];
};

/**
 * Turns flags into ifi_flags and ifi_change of struct ifinfomsg.
 */
const formatLinkFlags = ({ flags }: { flags: TLinkFlags }): { ifi_flags: bigint, ifi_change: bigint } => {
  return Object.entries(flags).reduce(({ ifi_flags, ifi_change }, [name, set]) => {
    const value = valueOfFlag({ name });

    return {
      ifi_flags: set ? ifi_flags | value : ifi_flags,
      ifi_change: ifi_change | value,
    };
  }, { ifi_flags: 0n, ifi_change: 0n });
};

/**
 * Turns ifi_flags of struct ifinfomsg into an object with all known flags.
 */
const parseLinkFlags = ({ ifi_flags }: { ifi_flags: bigint }): Record<TLinkFlagName, boolean> => {
  return Object.fromEntries(Object.entries(linkFlagValues).map(([name, value]) => {
    return [name, (ifi_flags & value) !== 0n];
  })) as Record<TLinkFlagName, boolean>;
};

export {
  formatLinkFlags,
  parseLinkFlags,
};

export type {
  TLinkFlagName,
  TLinkFlags,
};
