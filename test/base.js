const assert = require("assert");
const rtnetlink = require("../index.js");

const AF_PACKET = 17;

describe("opening", function () {
  this.timeout(5000);

  describe("normal case", () => {
    it("should open without error", () => {
      const rt = rtnetlink.open();
      rt.close();
    });
  });
});

describe("performing requests", function () {
  this.timeout(5000);

  describe("RTM_GETLINK", () => {
    it("should work properly", async() => {
      const rt = rtnetlink.open();

      try {
        const result = await rt.talk({
          "header": {
            "nlmsg_type": rtnetlink.RTM_GETLINK,
            "nlmsg_flags": rtnetlink.NLM_F_REQUEST | rtnetlink.NLM_F_DUMP
          },
          "ifi": {
            "ifi_family": AF_PACKET
          }
        });

        assert(Array.isArray(result), "result of talk() should be an array");
      } finally {
        rt.close();
      }
    });
  });
});
