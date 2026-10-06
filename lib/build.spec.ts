import assert from "node:assert";
import nodeChildProcess from "node:child_process";
import nodeFs from "node:fs";
import nodeOs from "node:os";
import nodePath from "node:path";
import { after, describe, it } from "mocha";

const projectRoot = nodePath.resolve(import.meta.dirname, "..");

const buildPackage = ({ outDirectory }: { outDirectory: string }) => {
  nodeChildProcess.execFileSync(nodePath.join(projectRoot, "node_modules", ".bin", "deno-node-build"), [
    "--root", projectRoot,
    "--out", `${outDirectory}/`,
    "--entry", "lib/index.ts",
  ], { stdio: "pipe" });
};

// The published package is the output of deno-node-build, which generates the declaration files
// per file. Types it cannot infer without the other files end up as any or unknown, which silently
// removes the type checks for users, so the public API declares its types explicitly.
describe("built package", () => {
  const outDirectory = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "rtnetlink-build-"));

  after(() => {
    nodeFs.rmSync(outDirectory, { recursive: true, force: true });
  });

  it("should declare the public API without any or unknown results", () => {
    buildPackage({ outDirectory });

    const declarationFiles = nodeFs.readdirSync(nodePath.join(outDirectory, "lib")).filter((file) => {
      return file.endsWith(".d.ts");
    });

    const problems = declarationFiles.flatMap((file) => {
      const lines = nodeFs.readFileSync(nodePath.join(outDirectory, "lib", file), "utf8").split("\n");

      return lines.filter((line) => {
        return /\bany\b/.test(line) || /=>\s*(?:unknown|Promise<unknown>);/.test(line);
      }).map((line) => {
        return `${file}: ${line.trim()}`;
      });
    });

    assert.ok(declarationFiles.length > 1);
    assert.deepStrictEqual(problems, []);
  }).timeout(60_000);
});
