import assert from "assert";
import rtnetlink from "../index.js";

const AF_PACKET = 17n;

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

const withRTNetlink = async (fn) => {
  const rt = await rtnetlink.open();

  try {
    await fn({ rt });
  } finally {
    await rt.close();
  }
};

const ifRoot = (fn) => {
  if (process.geteuid() === 0) {
    return fn;
  } else {
    return undefined;
  }
};

describe("high level APIs", () => {
  describe("link", () => {
    describe("tryFindOneBy", () => {
      it("should find lo interface by name correctly", async() => {
        await withRTNetlink(async ({ rt }) => {
          const link = await rt.link.tryFindOneBy({ "name": "lo" });
          assert(link);
        });
      });

      it("should not throw if interface cannot be found", async() => {
        await withRTNetlink(async ({ rt }) => {
          const link = await rt.link.tryFindOneBy({ "name": "A#3JSda" });
          assert.strictEqual(link, undefined);
        });
      });
    });

    describe("findOneBy", () => {
      it("should find lo interface by name correctly", async() => {
        await withRTNetlink(async ({ rt }) => {
          const link = await rt.link.findOneBy({ "name": "lo" });
          assert(link);
        });
      });
    });

    describe("createLink / deleteLink", () => {
      it("should create and destroy bridges without error", ifRoot(async() => {
        await withRTNetlink(async ({ rt }) => {
          const newLink = await rt.link.createLink({
            "linkinfo": {
              "kind": "bridge"
            }
          });
          await newLink.deleteLink();
        });
      }))
    });

    describe("fetch", () => {
      it("should fetch interface data of lo correctly", async () => {
        await withRTNetlink(async ({ rt }) => {
          const link = await rt.link.findOneBy({ "name": "lo" });
          const info = await link.fetch();

          assert(Array.isArray(info.address));
          assert.strictEqual(info.address.length, 6);
          info.address.forEach((octet) => {
            assert.strictEqual(typeof octet, "number");
            assert(octet >= 0);
            assert(octet <= 255);
          });
          assert.strictEqual(typeof info.name, "string");
          assert(info.name.length > 0);
          assert.strictEqual(typeof info.ifindex, "bigint");
          assert(info.ifindex >= 0n);
        });
      });
    })
  });
})
