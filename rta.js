const assert = require("assert");
const ref = require("ref");
const StructType = require("ref-struct");

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

  // console.log("input =", data);

  let offset = 0;

  while (offset < data.length) {
    // console.log("offset = " + offset);

    const header = new rtattr(data.slice(offset, offset + rtattr.size));

    // console.log("header =", header);

    result = result.concat([{
      "rta_len": header.rta_len,
      "rta_type": header.rta_type,
      "data": data.slice(offset + rtattr.size, offset + header.rta_len)
    }]);

    assert(header.rta_len > 0);
    offset += RTA_ALIGN(header.rta_len);
  }

  return result;
};

module.exports = {
  marshal,
  unmarshal
};
