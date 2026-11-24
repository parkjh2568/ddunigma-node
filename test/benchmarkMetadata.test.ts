import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getBenchmarkMetadata } from "../benchmarks/benchmarkMetadata.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ddunigma-metadata-"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "dist"));
  writeFileSync(join(root, "src/index.ts"), "export const answer = 42;");
  writeFileSync(join(root, "dist/index.js"), "export const answer = 42;");
  for (const filename of [
    "package.json",
    "pnpm-lock.yaml",
    "tsconfig-base.json",
    "tsconfig.json",
    "tsup.config.ts",
  ])
    writeFileSync(
      join(root, filename),
      filename === "package.json" ? '{"type":"module","packageManager":"pnpm@test"}' : "{}",
    );
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    ],
    { cwd: root },
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("benchmark artifact identification", () => {
  it("records archive builds and rejects source changes during a build", () => {
    mkdirSync(join(root, "benchmarks"));
    mkdirSync(join(root, "scripts"));
    cpSync(
      fileURLToPath(new URL("../benchmarks/benchmarkMetadata.ts", import.meta.url)),
      join(root, "benchmarks/benchmarkMetadata.ts"),
    );
    const script = join(root, "scripts/record-benchmark-build.ts");
    cpSync(fileURLToPath(new URL("../scripts/record-benchmark-build.ts", import.meta.url)), script);
    rmSync(join(root, ".git"), { recursive: true });
    for (const args of [["--before"], []]) {
      const result = spawnSync(process.execPath, ["--import", "tsx", script, ...args], {
        encoding: "utf8",
        timeout: 15_000,
      });
      expect(result.status, result.stderr).toBe(0);
    }
    expect(getBenchmarkMetadata(import.meta.url, root).buildReceipt.matches).toBe(true);
    const before = spawnSync(process.execPath, ["--import", "tsx", script, "--before"], {
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(before.status, before.stderr).toBe(0);
    expect(getBenchmarkMetadata(import.meta.url, root).buildReceipt.matches).toBe(false);
    writeFileSync(join(root, "src/index.ts"), "changed during build");
    const after = spawnSync(process.execPath, ["--import", "tsx", script], {
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(after.status).toBe(1);
    expect(after.stderr).toContain("Build inputs changed");
    expect(getBenchmarkMetadata(import.meta.url, root).buildReceipt.matches).toBe(false);
  });
  it("does not attribute a nested source archive to its ancestor Git repository", () => {
    const nested = join(root, "archive");
    mkdirSync(nested);
    for (const filename of [
      "src",
      "dist",
      "package.json",
      "pnpm-lock.yaml",
      "tsconfig-base.json",
      "tsconfig.json",
      "tsup.config.ts",
    ]) {
      cpSync(join(root, filename), join(nested, filename), { recursive: true });
    }
    const metadata = getBenchmarkMetadata(import.meta.url, nested);
    expect(metadata.gitAvailability).toBe("unavailable");
    expect(metadata.commit).toBeNull();
    expect(metadata.artifacts.src!.files.length).toBeGreaterThan(0);
  });
  it("keeps content identification available in a source archive without Git", () => {
    const original = getBenchmarkMetadata(import.meta.url, root);
    rmSync(join(root, ".git"), { recursive: true });
    const archive = getBenchmarkMetadata(import.meta.url, root);
    expect(archive.gitAvailability).toBe("unavailable");
    expect(archive.commit).toBeNull();
    expect(archive.workingTreeStatus).toBeNull();
    expect(archive.artifacts).toEqual(original.artifacts);
  });
  it("includes untracked source content and separates dist changes", () => {
    const original = getBenchmarkMetadata(import.meta.url, root);
    writeFileSync(join(root, "src/untracked.ts"), "export const added = 1;");
    const added = getBenchmarkMetadata(import.meta.url, root);
    expect(added.artifacts.src!.sha256).not.toBe(original.artifacts.src!.sha256);
    expect(added.artifacts.src!.files.some((file) => file.path === "src/untracked.ts")).toBe(true);
    expect(added.artifacts.dist!.sha256).toBe(original.artifacts.dist!.sha256);
    writeFileSync(join(root, "dist/index.js"), "export const answer = 0;");
    const rebuilt = getBenchmarkMetadata(import.meta.url, root);
    expect(rebuilt.artifacts.src!.sha256).toBe(added.artifacts.src!.sha256);
    expect(rebuilt.artifacts.dist!.sha256).not.toBe(added.artifacts.dist!.sha256);
  });

  it("invalidates the build receipt when source, dist, or build inputs change", () => {
    const original = getBenchmarkMetadata(import.meta.url, root);
    const receipt = {
      sourceSha256: original.artifacts.src!.sha256,
      distSha256: original.artifacts.dist!.sha256,
    };
    writeFileSync(join(root, ".benchmark-build.json"), JSON.stringify(receipt));
    expect(getBenchmarkMetadata(import.meta.url, root).buildReceipt.matches).toBe(true);
    for (const path of ["src/index.ts", "dist/index.js", "pnpm-lock.yaml", "tsup.config.ts"]) {
      const contents = readFileSync(join(root, path));
      writeFileSync(join(root, path), "changed");
      expect(getBenchmarkMetadata(import.meta.url, root).buildReceipt.matches).toBe(false);
      writeFileSync(join(root, path), contents);
      expect(getBenchmarkMetadata(import.meta.url, root).buildReceipt.matches).toBe(true);
    }
  });

  it("handles missing build artifacts and rejects corrupt receipts without claiming a match", () => {
    for (const contents of ["{", "null", "[]", '{"sourceSha256":42,"distSha256":false}']) {
      writeFileSync(join(root, ".benchmark-build.json"), contents);
      expect(getBenchmarkMetadata(import.meta.url, root).buildReceipt.matches).toBe(false);
    }
    rmSync(join(root, "dist"), { recursive: true });
    expect(getBenchmarkMetadata(import.meta.url, root).artifacts.dist).toBeNull();
    rmSync(join(root, "src"), { recursive: true });
    expect(() => getBenchmarkMetadata(import.meta.url, root)).toThrow("Missing benchmark source");
  });

  it("rejects source symlinks rather than omitting potentially imported code", () => {
    symlinkSync(join(root, "package.json"), join(root, "src/linked.json"));
    expect(() => getBenchmarkMetadata(import.meta.url, root)).toThrow("Cannot fingerprint symlink");
  });
});
