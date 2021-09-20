import assert from "assert";
import rtnetlink from "../index.js";

const AF_PACKET = 17;

describe("opening", function () {
  this.timeout(5000);

  describe("normal case", () => {
    it("should open without error", async() => {
      const rt = await rtnetlink.open();
      await rt.close();
    });
  });
});

describe("performing requests", function () {
  this.timeout(5000);

  describe("RTM_GETLINK", () => {
    it("should work properly", async() => {
      const rt = await rtnetlink.open();

      try {
        const result = await rt.talk({
          "header": {
            "nlmsg_type": rtnetlink.RTM_GETLINK,
            "nlmsg_flags": rtnetlink.NLM_F_REQUEST | rtnetlink.NLM_F_DUMP | rtnetlink.NLM_F_ACK
          },
          "ifi": {
            "ifi_family": AF_PACKET
          }
        });

        assert(Array.isArray(result), "result of talk() should be an array");
      } finally {
        await rt.close();
      }
    });
  });
});

describe("high level APIs", () => {
  describe("link", () => {
    it.only("should fetch link config correctly", async() => {
      const rt = await rtnetlink.open();

      try {
        const link = await rt.link.findBy({ "family": 17, "name": "tap0" });
        // await link.modify({
        //   "masterIndex": 0
        // });

        // const result = await link.fetch({ "provideUnknown": true });
        // const result = await rt.link.fromIndex({ "index": 2 }).fetchLinkConfig();

        // console.log("test result =", result);
        // await link.modifyLinkConfig({
        //   "master": {
        //     "ifindex": 0
        //   }
        // });

        const newLink = await rt.link.createLink({
          "linkinfo": {
            "kind": "bridge"
          }
        });
        await newLink.deleteLink();

        await new Promise((resolve) => setTimeout(resolve, 1000));
        
      } finally {
        await rt.close();
      }
    });
  });
})
