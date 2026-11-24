import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** Shared artifact identification for source benchmarks and build receipts. */
export function getBenchmarkMetadata(
  benchmarkUrl: string,
  root = fileURLToPath(new URL("../", import.meta.url)),
) {
  const artifacts: Record<
    string,
    { sha256: string; files: { path: string; sha256: string; bytes: number }[] } | null
  > = {};
  for (const directory of ["src", "dist"]) {
    if (!existsSync(join(root, directory))) {
      if (directory === "src") throw new Error("Missing benchmark source directory");
      artifacts[directory] = null;
      continue;
    }
    const paths: string[] = [];
    const pending = [directory];
    while (pending.length) {
      const parent = pending.pop()!;
      for (const entry of readdirSync(join(root, parent), { withFileTypes: true })) {
        const path = `${parent}/${entry.name}`;
        if (entry.isSymbolicLink()) throw new Error(`Cannot fingerprint symlink: ${path}`);
        if (entry.isDirectory()) pending.push(path);
        else if (entry.isFile()) paths.push(path);
      }
    }
    // Configuration and dependency resolution affect both source and built consumers.
    paths.push(
      "package.json",
      "pnpm-lock.yaml",
      "tsconfig-base.json",
      "tsconfig.json",
      "tsup.config.ts",
    );
    const files = paths.sort().map((path) => {
      const contents = readFileSync(join(root, path));
      return {
        path,
        sha256: createHash("sha256").update(contents).digest("hex"),
        bytes: contents.byteLength,
      };
    });
    artifacts[directory] = {
      sha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
      files,
    };
  }
  let buildReceipt: { status: string; matches: boolean } = { status: "missing", matches: false };
  if (existsSync(join(root, ".benchmark-build.json"))) {
    try {
      const receipt: unknown = JSON.parse(
        readFileSync(join(root, ".benchmark-build.json"), "utf8"),
      );
      const valid =
        receipt !== null &&
        typeof receipt === "object" &&
        "sourceSha256" in receipt &&
        "distSha256" in receipt &&
        typeof receipt.sourceSha256 === "string" &&
        /^[a-f0-9]{64}$/.test(receipt.sourceSha256) &&
        typeof receipt.distSha256 === "string" &&
        /^[a-f0-9]{64}$/.test(receipt.distSha256);
      buildReceipt = {
        status: valid ? "recorded" : "invalid",
        matches:
          valid &&
          artifacts.dist !== null &&
          receipt.sourceSha256 === artifacts.src!.sha256 &&
          receipt.distSha256 === artifacts.dist.sha256,
      };
    } catch {
      buildReceipt = { status: "invalid", matches: false };
    }
  }
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    packageManager?: string;
  };
  const installedTools: Record<string, string | null> = {};
  for (const name of ["tsx", "typescript", "tsup", "esbuild"]) {
    try {
      const tool: unknown = JSON.parse(
        readFileSync(join(root, "node_modules", name, "package.json"), "utf8"),
      );
      installedTools[name] =
        tool && typeof tool === "object" && "version" in tool && typeof tool.version === "string"
          ? tool.version
          : null;
    } catch {
      installedTools[name] = null;
    }
  }
  const gitOptions = {
    cwd: root,
    encoding: "utf8" as const,
    timeout: 10_000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: "pipe" as const,
  };
  let commit: string | null;
  let workingTreeStatus: string | null;
  let gitAvailability = "available";
  try {
    const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], gitOptions).trim();
    if (realpathSync(gitRoot) !== realpathSync(root))
      throw new Error("Git belongs to a different source root");
    commit = execFileSync("git", ["rev-parse", "HEAD"], gitOptions).trim();
    workingTreeStatus = execFileSync(
      "git",
      ["status", "--short", "--untracked-files=all"],
      gitOptions,
    ).trim();
  } catch {
    // Source archives and build environments need no Git; content hashes remain authoritative.
    commit = null;
    workingTreeStatus = null;
    gitAvailability = "unavailable";
  }
  return {
    timestamp: new Date().toISOString(),
    node: process.version,
    versions: process.versions,
    platform: platform(),
    os: release(),
    cpu: cpus()[0]?.model,
    cpuCount: cpus().length,
    execArgv: process.execArgv,
    packageManager: packageJson.packageManager,
    packageManagerUserAgent: process.env.npm_config_user_agent ?? null,
    installedTools,
    commit,
    workingTreeStatus,
    gitAvailability,
    benchmarkPath: relative(root, fileURLToPath(benchmarkUrl)).split("\\").join("/"),
    benchmarkSha256: createHash("sha256")
      .update(readFileSync(new URL(benchmarkUrl)))
      .digest("hex"),
    metadataImplementationSha256: createHash("sha256")
      .update(readFileSync(new URL(import.meta.url)))
      .digest("hex"),
    lockfileSha256: createHash("sha256")
      .update(readFileSync(join(root, "pnpm-lock.yaml")))
      .digest("hex"),
    artifacts,
    buildReceipt,
    provenance: "Local content fingerprints and build receipt, not a signed build attestation",
  };
}
