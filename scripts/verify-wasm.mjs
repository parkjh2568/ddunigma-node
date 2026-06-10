import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const manifest = join(root, "src", "wasm", "Cargo.toml");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf-8",
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("cargo", ["fmt", "--check", "--manifest-path", manifest]);
run("cargo", ["test", "--manifest-path", manifest]);
run("cargo", [
  "clippy",
  "--manifest-path",
  manifest,
  "--target",
  "wasm32-unknown-unknown",
  "--release",
  "--",
  "-D",
  "warnings",
]);
run("cargo", [
  "build",
  "--manifest-path",
  manifest,
  "--target",
  "wasm32-unknown-unknown",
  "--release",
]);

const tracked = readFileSync(join(root, "src", "wasm", "codec.wasm"));
const built = readFileSync(
  join(
    root,
    "src",
    "wasm",
    "target",
    "wasm32-unknown-unknown",
    "release",
    "ddunigma_wasm_codec.wasm",
  ),
);

if (!tracked.equals(built)) {
  throw new Error(
    "[wasm:check] src/wasm/codec.wasm is stale. Run src/wasm/build.sh and commit the result.",
  );
}

console.log(`[wasm:check] source, tests, clippy, and ${tracked.length}-byte binary match`);
