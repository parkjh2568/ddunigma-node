import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { isAbsolute, join } from "path";
import { spawnSync } from "child_process";

const cwd = process.cwd();
const packageJson = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8"));
const cacheDir = mkdtempSync(join(tmpdir(), "ddunigma-pack-"));
const tscBin = join(cwd, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");

function fail(message) {
  throw new Error(`[pack:check] ${message}`);
}

function run(command, args, options, label) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  if (result.status !== 0) {
    fail(`${label} failed.\n${result.stderr || result.stdout}`);
  }

  return result;
}

function parsePackJson(stdout, label) {
  const parsed = JSON.parse(stdout);
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    fail(`Unexpected ${label} JSON output.\n${stdout}`);
  }
  return parsed[0];
}

function writeSmokeFile(packageDir, filename, source) {
  const filePath = join(packageDir, filename);
  writeFileSync(filePath, source.trimStart(), "utf-8");
  return filePath;
}

function runNodeSmoke(packageDir) {
  const esmSmoke = writeSmokeFile(
    packageDir,
    "__pack-smoke.mjs",
    `
      const cases = [
        ["@ddunigma/node", "node"],
        ["@ddunigma/node/browser", "browser"],
        ["@ddunigma/node/core", "core"],
      ];

      for (const [specifier, label] of cases) {
        const mod = await import(specifier);
        const encoder = new mod.Ddu64();
        const input = label + ":pack-smoke";
        const encoded = encoder.encode(input);
        const decoded = encoder.decode(encoded);
        if (decoded !== input) {
          throw new Error(specifier + " ESM round-trip failed");
        }
        if (label === "node" && typeof encoder.decodeToBuffer !== "function") {
          throw new Error("Node entry should expose decodeToBuffer");
        }
        if (label !== "node" && "decodeToBuffer" in encoder) {
          throw new Error(label + " entry should not expose decodeToBuffer");
        }
      }

      const node = await import("@ddunigma/node");

      const browser = await import("@ddunigma/node/browser");
      const browserEncoder = new browser.Ddu64();
      const asyncEncoded = await browserEncoder.encodeAsync("browser:async-pack-smoke");
      const asyncDecoded = await browserEncoder.decodeAsync(asyncEncoded);
      if (asyncDecoded !== "browser:async-pack-smoke") {
        throw new Error("Browser entry async round-trip failed");
      }

      // 미니파이된 published 빌드에서 커스텀 에러 name이 보존되는지 검증합니다.
      // (keepNames 없이 빌드하면 error.name이 "N" 같은 축약 식별자가 됩니다.)
      for (const errMod of [node, browser]) {
        const err = new errMod.Ddu64InvalidInputError("name-smoke");
        if (err.name !== "Ddu64InvalidInputError") {
          throw new Error("Custom error name mangled in published build: " + err.name);
        }
        if (!(err instanceof errMod.Ddu64Error) || err.code !== "DDU64_INVALID_INPUT") {
          throw new Error("Custom error identity broken in published build");
        }
      }
    `,
  );

  run(process.execPath, [esmSmoke], { cwd: packageDir }, "ESM package smoke test");

  const cjsSmoke = writeSmokeFile(
    packageDir,
    "__pack-smoke.cjs",
    `
      const cases = [
        ["@ddunigma/node", "node"],
        ["@ddunigma/node/browser", "browser"],
        ["@ddunigma/node/core", "core"],
      ];

      for (const [specifier, label] of cases) {
        const mod = require(specifier);
        const encoder = new mod.Ddu64();
        const input = label + ":pack-smoke-cjs";
        const encoded = encoder.encode(input);
        const decoded = encoder.decode(encoded);
        if (decoded !== input) {
          throw new Error(specifier + " CJS round-trip failed");
        }
      }
    `,
  );

  run(process.execPath, [cjsSmoke], { cwd: packageDir }, "CJS package smoke test");
}

async function runBrowserBundleSmoke(packageDir) {
  const esbuild = await import("esbuild");
  const entries = [
    writeSmokeFile(
      packageDir,
      "__browser-root-bundle-smoke.mjs",
      `
        import { Ddu64 } from "@ddunigma/node";
        const encoder = new Ddu64();
        encoder.decode(encoder.encode("browser root bundle smoke"));
      `,
    ),
    writeSmokeFile(
      packageDir,
      "__browser-bundle-smoke.mjs",
      `
        import { Ddu64 } from "@ddunigma/node/browser";
        const encoder = new Ddu64();
        encoder.decode(encoder.encode("browser bundle smoke"));
      `,
    ),
    writeSmokeFile(
      packageDir,
      "__core-bundle-smoke.mjs",
      `
        import { Ddu64 } from "@ddunigma/node/core";
        const encoder = new Ddu64();
        encoder.decode(encoder.encode("core bundle smoke"));
      `,
    ),
    writeSmokeFile(
      packageDir,
      "__browser-bundle-smoke.cjs",
      `
        const { Ddu64 } = require("@ddunigma/node/browser");
        const encoder = new Ddu64();
        encoder.decode(encoder.encode("browser cjs bundle smoke"));
      `,
    ),
  ];

  for (const [index, entry] of entries.entries()) {
    const output = join(packageDir, `__bundle-smoke-${index}.js`);
    try {
      await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        platform: "browser",
        format: "esm",
        outfile: output,
        logLevel: "silent",
        absWorkingDir: packageDir,
      });
    } catch (error) {
      fail(`browser bundle smoke test (${entry}) failed.\n${error?.message ?? error}`);
    }
    run(process.execPath, [output], { cwd: packageDir }, `browser bundle runtime smoke (${entry})`);
  }
}

function runTypeSmoke(packageDir) {
  const tsconfigPath = join(packageDir, "__pack-types.tsconfig.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify(
      {
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          strict: true,
          target: "ES2022",
          typeRoots: [join(cwd, "node_modules", "@types")],
        },
        include: ["__pack-types-smoke.ts", "__pack-types-smoke.cts"],
      },
      null,
      2,
    ),
    "utf-8",
  );

  writeSmokeFile(
    packageDir,
    "__pack-types-smoke.ts",
    `
      import {
        Ddu64,
        Ddu64Core,
        Ddu64Node,
        DduSetSymbol,
        type DduConstructorOptions,
        type DduOptions,
        type PlatformAdapter,
      } from "@ddunigma/node";
      import { Ddu64 as BrowserDdu64, BrowserAdapter } from "@ddunigma/node/browser";
      import { Ddu64 as CoreDdu64, CharsetBuilder } from "@ddunigma/node/core";

      const constructorOptions: DduConstructorOptions = {
        dduSetSymbol: DduSetSymbol.DDU,
        checksum: true,
        checksumScope: "output",
        encoding: "latin1",
        requireEncryption: true,
      };
      const callOptions: DduOptions = { checksum: true, compress: false };

      const nodeEncoder = new Ddu64(constructorOptions);
      const explicitNodeEncoder: Ddu64Node = nodeEncoder;
      const encoded = explicitNodeEncoder.encode("type smoke", callOptions);
      explicitNodeEncoder.decode(encoded, callOptions);
      const asyncStats = await explicitNodeEncoder.getStatsAsync("type smoke", callOptions);
      const syncStats = explicitNodeEncoder.getStats("type smoke", callOptions);
      asyncStats.encodedSize satisfies number;
      syncStats.encodedSize satisfies number;

      const browserEncoder = new BrowserDdu64();
      const browserAdapter: PlatformAdapter = new BrowserAdapter();
      browserAdapter.randomBytes(1);
      await browserEncoder.encodeAsync("browser type smoke");
      await browserEncoder.getStatsAsync("browser type smoke");

      const coreEncoder: Ddu64Core = new CoreDdu64();
      coreEncoder.decode(coreEncoder.encode("core type smoke"));
      CharsetBuilder.uppercase().build();
    `,
  );

  writeSmokeFile(
    packageDir,
    "__pack-types-smoke.cts",
    `
      import node = require("@ddunigma/node");
      import browser = require("@ddunigma/node/browser");
      import core = require("@ddunigma/node/core");

      const callOptions: node.DduOptions = { checksum: true, compress: false };
      const constructorOptions: node.DduConstructorOptions = {
        dduSetSymbol: node.DduSetSymbol.DDU,
        checksumScope: "output",
      };

      const nodeEncoder: node.Ddu64Node = new node.Ddu64(constructorOptions);
      const encoded = nodeEncoder.encode("cjs type smoke", callOptions);
      nodeEncoder.decode(encoded, callOptions);
      const stats: node.DduEncodeStats = nodeEncoder.getStats("cjs type smoke");
      const asyncStats: Promise<node.DduEncodeStats> = nodeEncoder.getStatsAsync("cjs type smoke");
      stats.encodedSize satisfies number;
      void asyncStats;

      const browserEncoder = new browser.Ddu64();
      const browserStats: Promise<browser.DduEncodeStats> =
        browserEncoder.getStatsAsync("browser cjs type smoke");
      void browserStats;

      const coreEncoder: core.Ddu64Core = new core.Ddu64();
      coreEncoder.decode(coreEncoder.encode("core cjs type smoke"));
      core.CharsetBuilder.uppercase().build();
    `,
  );

  run(tscBin, ["-p", tsconfigPath], { cwd: packageDir }, "TypeScript package smoke test");
}

try {
  const distDir = join(cwd, "dist");
  if (!existsSync(distDir)) {
    fail("dist/ does not exist. Run `pnpm build` before `pnpm pack:check`.");
  }

  const dryRun = run(
    "npm",
    ["pack", "--dry-run", "--json", "--cache", cacheDir],
    undefined,
    "npm pack dry-run",
  );
  const manifest = parsePackJson(dryRun.stdout, "npm pack dry-run");
  const filePaths = manifest.files.map((file) => file.path);

  const requiredFiles = [
    "README.md",
    "LICENCE",
    "package.json",
    "dist/index.js",
    "dist/index.cjs",
    "dist/index.d.ts",
    "dist/index.d.cts",
    "dist/browser.js",
    "dist/browser.cjs",
    "dist/browser.d.ts",
    "dist/browser.d.cts",
    "dist/core.js",
    "dist/core.cjs",
    "dist/core.d.ts",
    "dist/core.d.cts",
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
  const expectedBrowser = packageJson.browser;
  if (!filePaths.includes(expectedMain)) {
    fail(`package.json main is not published: ${expectedMain}`);
  }
  if (!filePaths.includes(expectedModule)) {
    fail(`package.json module is not published: ${expectedModule}`);
  }
  if (!filePaths.includes(expectedTypes)) {
    fail(`package.json types is not published: ${expectedTypes}`);
  }
  if (!filePaths.includes(expectedBrowser.replace(/^\.\//, ""))) {
    fail(`package.json browser is not published: ${expectedBrowser}`);
  }

  const actualPack = run(
    "npm",
    ["pack", "--json", "--cache", cacheDir, "--pack-destination", cacheDir],
    undefined,
    "npm pack",
  );
  const actualManifest = parsePackJson(actualPack.stdout, "npm pack");
  const tarballPath = isAbsolute(actualManifest.filename)
    ? actualManifest.filename
    : join(cacheDir, actualManifest.filename);

  const extractDir = join(cacheDir, "extract");
  mkdirSync(extractDir, { recursive: true });
  run("tar", ["-xzf", tarballPath, "-C", extractDir], undefined, "tar extract");

  const packageDir = join(extractDir, "package");
  runNodeSmoke(packageDir);
  runTypeSmoke(packageDir);
  await runBrowserBundleSmoke(packageDir);

  console.log("[pack:check] npm pack dry-run passed");
  console.log("[pack:check] extracted package smoke tests passed");
  console.log("[pack:check] TypeScript package smoke test passed");
  console.log("[pack:check] browser bundle smoke tests passed");
  console.log(`[pack:check] entryCount=${manifest.entryCount}`);
  console.log(`[pack:check] unpackedSize=${manifest.unpackedSize}`);
  console.log(`[pack:check] published files:\n${filePaths.map((file) => ` - ${file}`).join("\n")}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  rmSync(cacheDir, { recursive: true, force: true });
}
