const allFlags = {
  IFF_UP: 1n << 0n,
  IFF_BROADCAST: 1n << 1n,
  IFF_DEBUG: 1n << 2n,
  IFF_LOOPBACK: 1n << 3n,
  IFF_POINTOPOINT: 1n << 4n,
  IFF_NOTRAILERS: 1n << 5n,
  IFF_RUNNING: 1n << 6n,
  IFF_NOARP: 1n << 7n,
  IFF_PROMISC: 1n << 8n,
  IFF_ALLMULTI: 1n << 9n,
  IFF_MASTER: 1n << 10n,
  IFF_SLAVE: 1n << 11n,
  IFF_MULTICAST: 1n << 12n,
  IFF_PORTSEL: 1n << 13n,
  IFF_AUTOMEDIA: 1n << 14n,
  IFF_DYNAMIC: 1n << 15n,
  IFF_LOWER_UP: 1n << 16n,
  IFF_DORMANT: 1n << 17n,
  IFF_ECHO: 1n << 18n,
};

const mask = (flags) => {
  if (typeof flags !== "object") {
    throw new Error(`flags must be provided as an object`);
  }

  let result = 0n;

  Object.keys(flags).forEach((key) => {
    const val = allFlags[key];
    if (val === undefined) {
      throw new Error(`unknown flag "${key}"`);
    }

    if (flags[key]) {
      result |= val;
    }
  });

  return result;
};

const changeMask = (flags) => {
  let result = 0n;

  Object.keys(flags).forEach((key) => {
    const val = allFlags[key];
    if (val === undefined) {
      throw new Error(`unknown flag "${key}"`);
    }

    result |= val;
  });

  return result;
};

const unmask = (mask) => {
  let result = {};

  Object.keys(allFlags).forEach((key) => {
    const val = allFlags[key];

    result = Object.assign({}, result, {
      [key]: (mask & val) === val,
    });
  });

  return result;
};

export default {
  mask,
  changeMask,
  unmask,
};
