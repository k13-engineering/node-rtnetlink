const allFlags = {
  "IFF_UP": 1<<0,
  "IFF_BROADCAST": 1<<1,
  "IFF_DEBUG": 1<<2,
  "IFF_LOOPBACK": 1<<3,
  "IFF_POINTOPOINT": 1<<4,
  "IFF_NOTRAILERS": 1<<5,
  "IFF_RUNNING": 1<<6,
  "IFF_NOARP": 1<<7,
  "IFF_PROMISC": 1<<8,
  "IFF_ALLMULTI": 1<<9,
  "IFF_MASTER": 1<<10,
  "IFF_SLAVE": 1<<11,
  "IFF_MULTICAST": 1<<12,
  "IFF_PORTSEL": 1<<13,
  "IFF_AUTOMEDIA": 1<<14,
  "IFF_DYNAMIC": 1<<15,
  "IFF_LOWER_UP": 1<<16,
  "IFF_DORMANT": 1<<17,
  "IFF_ECHO": 1<<18
};

const mask = (flags) => {
  if(typeof flags !== "object") {
    throw new Error(`flags must be provided as an object`);
  }
  
  let result = 0;

  Object.keys(flags).forEach((key) => {
    const val = allFlags[key];
    if(val === undefined) {
      throw new Error(`unknown flag "${key}"`);
    }

    if(flags[key]) {
      result |= val;
    }
  });

  return result;
};

const changeMask = (flags) => {
  let result = 0;

  Object.keys(flags).forEach((key) => {
    const val = allFlags[key];
    if(val === undefined) {
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
      [key]: (mask & val) === val
    });
  });

  return result;
};

export default {
  mask,
  changeMask,
  unmask
};
