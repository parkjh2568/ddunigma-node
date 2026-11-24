import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

let root: string;
let packageDir: string;
let victim: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ddunigma-installed-"));
  packageDir = join(root, "package");
  victim = join(root, "original.txt");
  mkdirSync(packageDir);
  writeFileSync(victim, "original content");
  writeFileSync(join(packageDir, "index.js"), 'throw new Error("Must not execute");');
  writeFileSync(join(packageDir, "index.d.ts"), "export {};");
  writeFileSync(
    join(packageDir, "package.json"),
    JSON.stringify({
      name: "@ddunigma/node",
      version: "6.3.0",
      type: "module",
      main: "index.js",
      module: "index.js",
      types: "index.d.ts",
      browser: "index.js",
      exports: { ".": "./index.js" },
    }),
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("extracted package consumer safety", () => {
  it.each(["__pack-smoke.mjs", "node_modules"])(
    "rejects %s symlinks before writing smoke consumers",
    (filename) => {
      symlinkSync(victim, join(packageDir, filename));
      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL("../scripts/verify-pack.mjs", import.meta.url)),
          "--installed",
          packageDir,
        ],
        { encoding: "utf8", timeout: 20_000 },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("without symlinks");
      expect(readFileSync(victim, "utf8")).toBe("original content");
      expect(readFileSync(join(packageDir, "index.js"), "utf8")).toContain("Must not execute");
    },
  );

  it("rejects declared entrypoints outside the extracted package", () => {
    const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
    manifest.exports["."] = "../original.txt";
    writeFileSync(join(packageDir, "package.json"), JSON.stringify(manifest));
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("../scripts/verify-pack.mjs", import.meta.url)),
        "--installed",
        packageDir,
      ],
      { encoding: "utf8", timeout: 20_000 },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("inside the package");
    expect(readFileSync(victim, "utf8")).toBe("original content");
  });
});
