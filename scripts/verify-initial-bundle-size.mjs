import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { resolve } from "node:path";
import { build } from "esbuild";

const cwd = process.cwd();
const checks = [
  { name: "node", entry: "./dist/index.js", platform: "node", limit: 15_800 },
  { name: "browser", entry: "./dist/browser.js", platform: "browser", limit: 15_750 },
];

for (const check of checks) {
  const result = await build({
    absWorkingDir: cwd,
    bundle: true,
    chunkNames: "chunk-[hash]",
    entryNames: "entry-[hash]",
    external: ["crypto", "zlib", "util", "node:crypto", "node:zlib", "node:util"],
    format: "esm",
    logOverride: { "ignored-bare-import": "silent" },
    metafile: true,
    minify: true,
    outdir: ".initial-size",
    platform: check.platform,
    splitting: true,
    stdin: {
      contents: `import { Ddu64 } from ${JSON.stringify(check.entry)}; console.log(Ddu64);`,
      resolveDir: cwd,
      sourcefile: `${check.name}-initial-entry.mjs`,
    },
    target: "es2022",
    treeShaking: true,
    write: false,
  });

  const outputFiles = new Map(result.outputFiles.map((file) => [file.path, file.contents]));
  const entry = Object.entries(result.metafile.outputs).find(
    ([, output]) => output.entryPoint === `${check.name}-initial-entry.mjs`,
  )?.[0];
  if (!entry) throw new Error(`[initial-size] ${check.name} entry output was not generated`);

  let size = 0;
  const pending = [entry];
  const visited = new Set();
  while (pending.length > 0) {
    const outputPath = pending.pop();
    if (visited.has(outputPath)) continue;
    visited.add(outputPath);

    const contents = outputFiles.get(resolve(cwd, outputPath));
    if (!contents) throw new Error(`[initial-size] Missing output: ${outputPath}`);
    size += brotliCompressSync(contents, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength;

    for (const imported of result.metafile.outputs[outputPath].imports) {
      if (!imported.external && imported.kind !== "dynamic-import") pending.push(imported.path);
    }
  }

  console.log(`[initial-size] ${check.name}=${size} bytes (limit ${check.limit})`);
  if (size > check.limit) {
    throw new Error(
      `[initial-size] ${check.name} initial static graph exceeds the limit by ${size - check.limit} bytes`,
    );
  }
}
