import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, rmdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const lock = path.join(root, ".dist.lock");
const [mode, ...args] = process.argv.slice(2);
const require = createRequire(import.meta.url);
if (!["build", "benchmark"].includes(mode)) {
  throw Error("Use the package build or benchmark script");
}

try {
  await mkdir(lock);
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  throw Error(
    "Another build or benchmark owns .dist.lock. If it was interrupted, verify it has stopped before removing the empty lock directory.",
    { cause: error },
  );
}

try {
  const parameters =
    mode === "build"
      ? [
          path.join(path.dirname(require.resolve("tsup/package.json")), "dist/cli-default.js"),
          ...args,
        ]
      : ["--expose-gc", "--import", "tsx", ...args];
  const child = spawn(process.execPath, parameters, { cwd: root, stdio: "inherit", shell: false });
  const forward = (signal) => child.kill(signal);
  const interrupt = () => forward("SIGINT");
  const terminate = () => forward("SIGTERM");
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  try {
    const [code, signal] = await once(child, "exit");
    process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
} finally {
  await rmdir(lock);
}
