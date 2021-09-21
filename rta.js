import assert from "assert";
import struct from "../node-ya-struct/lib/index.js";

const RTA_ALIGN = (addr) => ((addr + 3n) / 4n) * 4n;

const rtattr = struct.define(({ field }) => {
  field.UInt16("rta_len");
  field.UInt16("rta_type");
}).forHost();

const marshal = (attrs) => {
  let result = Buffer.alloc(0);

  attrs.forEach((attr) => {
    let len = RTA_ALIGN(BigInt(rtattr.size)) + BigInt(attr.data.length);

    const header = rtattr.format({
      "rta_len": len,
      "rta_type": attr.rta_type
    });

    const data = Buffer.concat([header, attr.data]);
    const padding = Buffer.alloc(Number(len) - data.length);

    result = Buffer.concat([result, data, padding]);
  });

  return result;
};

const unmarshal = (data) => {
  let result = [];

  let offset = 0;

  while (offset < data.length) {
    const header = rtattr.parse(data.slice(offset, offset + rtattr.size));

    result = result.concat([{
      // "rta_len": header.rta_len,
      "rta_type": header.rta_type,
      "data": data.slice(offset + rtattr.size, offset + Number(header.rta_len))
    }]);

    assert(header.rta_len > 0n);
    offset += Number(RTA_ALIGN(BigInt(header.rta_len)));
  }

  return result;
};

const types = {
  "asciiz": {
    "marshal": (str) => {
      return Buffer.concat([Buffer.from(str, "utf8"), Buffer.alloc(1)]);
    },
    "unmarshal": (data) => {
      const zeroByte = data.lastIndexOf(0);
      if(zeroByte < 0) {
        throw new Error("trailing zero is missing");
      }
      return data.slice(0, zeroByte).toString("utf8");
    }
  },
  "uint32": {
    "marshal": (value) => {
      const buf = Buffer.alloc(4);
      buf.writeUInt32LE(Number(value));
      return buf;
    },
    "unmarshal": (buf) => {
      return BigInt(buf.readUInt32LE(0));
    }
  },
  "ifindex": {
    "marshal": (value) => {
      const buf = Buffer.alloc(4);
      buf.writeUInt32LE(Number(value));
      return buf;
    },
    "unmarshal": (buf) => {
      return BigInt(buf.readUInt32LE(0));
    }
  },
  "hwaddr": {
    "marshal": (addr) => {
      const buf = Buffer.alloc(addr.length);
      addr.forEach((byte, idx) => {
        buf.writeUInt8(byte, idx);
      });
      return buf;
    },
    "unmarshal": (buf) => {
      let result = [];
      for(let i = 0; i < buf.length; i += 1) {
        result = [...result, buf.readUInt8(i) ];
      }
      return result;
    }
  }
};

export default {
  marshal,
  unmarshal,

  types
};
