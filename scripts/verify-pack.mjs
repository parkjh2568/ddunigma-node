import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const cwd = process.cwd();
const packageJson = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8"));
const cacheDir = mkdtempSync(join(tmpdir(), "ddunigma-pack-"));

function fail(message) {
  console.error(`[pack:check] ${message}`);
  process.exitCode = 1;
}

try {
  const distDir = join(cwd, "dist");
  if (!existsSync(distDir)) {
    fail("dist/ does not exist. Run `pnpm build` before `pnpm pack:check`.");
    process.exit(process.exitCode ?? 1);
  }

  const pack = spawnSync(
    "npm",
    ["pack", "--dry-run", "--json", "--cache", cacheDir],
    {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  if (pack.status !== 0) {
    fail(`npm pack failed.\n${pack.stderr || pack.stdout}`);
    process.exit(process.exitCode ?? 1);
  }

  const parsed = JSON.parse(pack.stdout);
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    fail(`Unexpected npm pack JSON output.\n${pack.stdout}`);
    process.exit(process.exitCode ?? 1);
  }

  const manifest = parsed[0];
  const filePaths = manifest.files.map((file) => file.path);

  const requiredFiles = [
    "README.md",
    "LICENCE",
    "package.json",
    "dist/index.js",
    "dist/index.cjs",
    "dist/index.d.ts",
    "dist/index.d.cts",
  ];

  for (const file of requiredFiles) {
    if (!filePaths.includes(file)) {
      fail(`Missing required published file: ${file}`);
    }
  }

  const forbiddenPatterns = [
    { label: "source map", test: (file) => file.endsWith(".map") },
    { label: "source TypeScript", test: (file) => file.startsWith("src/") },
    { label: "benchmark source", test: (file) => file.startsWith("benchmarks/") },
    { label: "coverage output", test: (file) => file.startsWith("coverage/") },
    { label: "node_modules content", test: (file) => file.startsWith("node_modules/") },
  ];

  for (const { label, test } of forbiddenPatterns) {
    const match = filePaths.find(test);
    if (match) {
      fail(`Unexpected published ${label}: ${match}`);
    }
  }

  const expectedMain = packageJson.main;
  const expectedModule = packageJson.module;
  const expectedTypes = packageJson.types;
  if (!filePaths.includes(expectedMain)) {
    fail(`package.json main is not published: ${expectedMain}`);
  }
  if (!filePaths.includes(expectedModule)) {
    fail(`package.json module is not published: ${expectedModule}`);
  }
  if (!filePaths.includes(expectedTypes)) {
    fail(`package.json types is not published: ${expectedTypes}`);
  }

  if (process.exitCode) {
    process.exit(process.exitCode);
  }

  console.log("[pack:check] npm pack dry-run passed");
  console.log(`[pack:check] entryCount=${manifest.entryCount}`);
  console.log(`[pack:check] unpackedSize=${manifest.unpackedSize}`);
  console.log(`[pack:check] published files:\n${filePaths.map((file) => ` - ${file}`).join("\n")}`);
} finally {
  rmSync(cacheDir, { recursive: true, force: true });
}
