import assert from "assert";
import ref from "ref-napi";
import StructType from "ref-struct-napi";

const RTA_ALIGN = (addr) => (addr + 3) & ~3;

const rtattr = StructType({
  "rta_len": ref.types.ushort,
  "rta_type": ref.types.ushort
});

const marshal = (attrs) => {
  let result = Buffer.alloc(0);

  attrs.forEach((attr) => {
    let len = RTA_ALIGN(rtattr.size + attr.data.length);

    const header = new rtattr({
      "rta_len": len,
      "rta_type": attr.rta_type
    });

    const data = Buffer.concat([header.ref(), attr.data]);
    const padding = Buffer.alloc(len - data.length);

    result = Buffer.concat([result, data, padding]);
  });

  return result;
};

const unmarshal = (data) => {
  let result = [];

  let offset = 0;

  while (offset < data.length) {
    // console.log("offset = " + offset);

    const header = new rtattr(data.slice(offset, offset + rtattr.size));

    result = result.concat([{
      // "rta_len": header.rta_len,
      "rta_type": header.rta_type,
      "data": data.slice(offset + rtattr.size, offset + header.rta_len)
    }]);

    assert(header.rta_len > 0);
    offset += RTA_ALIGN(header.rta_len);
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
      buf.writeUInt32LE(value);
      return buf;
    },
    "unmarshal": (buf) => {
      return buf.readUInt32LE(0);
    }
  },
  "ifindex": {
    "marshal": (value) => {
      const buf = Buffer.alloc(4);
      buf.writeUInt32LE(value);
      return buf;
    },
    "unmarshal": (buf) => {
      return buf.readUInt32LE(0);
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
