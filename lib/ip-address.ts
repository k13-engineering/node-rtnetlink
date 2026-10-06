import { isIPv4, isIPv6 } from "node:net";

type TAddressFamily = "inet" | "inet6";

type TIpAddress = {
  family: TAddressFamily;
  // 4 bytes for inet, 16 bytes for inet6, in network byte order
  bytes: Uint8Array;
};

const parseIpv4 = ({ address }: { address: string }) => {
  return Uint8Array.from(address.split(".").map((part) => {
    return Number(part);
  }));
};

// the groups of an IPv6 address without "::", an IPv4 address at the end counts as two groups
const groupsOf = ({ part }: { part: string }) => {
  if (part === "") {
    return [];
  }

  return part.split(":").flatMap((group) => {
    if (!group.includes(".")) {
      return [parseInt(group, 16)];
    }

    const [a, b, c, d] = parseIpv4({ address: group });
    return [(a << 8) | b, (c << 8) | d];
  });
};

const parseIpv6 = ({ address }: { address: string }) => {
  const [head, tail] = address.split("::");
  const headGroups = groupsOf({ part: head });
  const tailGroups = tail === undefined ? [] : groupsOf({ part: tail });
  const zeroGroups = Array.from({ length: 8 - headGroups.length - tailGroups.length }, () => {
    return 0;
  });

  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);

  [...headGroups, ...zeroGroups, ...tailGroups].forEach((group, index) => {
    view.setUint16(index * 2, group);
  });

  return bytes;
};

/**
 * Parses an IPv4 or IPv6 address like "192.0.2.1" or "2001:db8::1". Throws for anything else, including zone ids.
 */
const parseIpAddress = ({ address }: { address: string }): TIpAddress => {
  if (isIPv4(address)) {
    return { family: "inet", bytes: parseIpv4({ address }) };
  }

  if (isIPv6(address) && !address.includes("%")) {
    return { family: "inet6", bytes: parseIpv6({ address }) };
  }

  throw Error(`invalid IP address "${address}"`);
};

const formatIpv4 = ({ bytes }: { bytes: Uint8Array }) => {
  return [...bytes].join(".");
};

type TZeroRun = { start: number, length: number };

// the runs of consecutive zero groups
const zeroRunsOf = ({ groups }: { groups: number[] }) => {
  return groups.reduce((runs: TZeroRun[], group, index) => {
    if (group !== 0) {
      return runs;
    }

    const last = runs.at(-1);

    if (last !== undefined && last.start + last.length === index) {
      return [...runs.slice(0, -1), { start: last.start, length: last.length + 1 }];
    }

    return [...runs, { start: index, length: 1 }];
  }, []);
};

// the first longest run of at least two zero groups, which "::" replaces
const longestZeroRun = ({ groups }: { groups: number[] }) => {
  return zeroRunsOf({ groups }).filter((run) => {
    return run.length >= 2;
  }).reduce((best, run) => {
    return run.length > best.length ? run : best;
  }, { start: -1, length: 0 });
};

const formatGroups = ({ groups }: { groups: number[] }) => {
  return groups.map((group) => {
    return group.toString(16);
  }).join(":");
};

const isIpv4Mapped = ({ bytes }: { bytes: Uint8Array }) => {
  return bytes.subarray(0, 10).every((byte) => {
    return byte === 0;
  }) && bytes[10] === 0xFF && bytes[11] === 0xFF;
};

// RFC 5952: lowercase, without leading zeros, the longest run of zero groups as "::"
const formatIpv6 = ({ bytes }: { bytes: Uint8Array }) => {
  if (isIpv4Mapped({ bytes })) {
    return `::ffff:${formatIpv4({ bytes: bytes.subarray(12) })}`;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const groups = [0, 1, 2, 3, 4, 5, 6, 7].map((index) => {
    return view.getUint16(index * 2);
  });

  const { start, length } = longestZeroRun({ groups });

  if (length === 0) {
    return formatGroups({ groups });
  }

  return `${formatGroups({ groups: groups.slice(0, start) })}::${formatGroups({ groups: groups.slice(start + length) })}`;
};

/**
 * Formats 4 bytes as IPv4 and 16 bytes as IPv6 address, throws for other lengths.
 */
const formatIpAddress = ({ bytes }: { bytes: Uint8Array }): string => {
  if (bytes.length === 4) {
    return formatIpv4({ bytes });
  }

  if (bytes.length === 16) {
    return formatIpv6({ bytes });
  }

  throw Error(`an IP address has 4 or 16 bytes, not ${bytes.length}`);
};

export {
  parseIpAddress,
  formatIpAddress,
};

export type {
  TAddressFamily,
  TIpAddress,
};
