import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { getBenchmarkMetadata } from "../benchmarks/benchmarkMetadata.js";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--before"))
  throw new Error("Usage: record-benchmark-build.ts [--before]");
const receiptPath = new URL("../.benchmark-build.json", import.meta.url);
const temporaryPath = new URL("../.benchmark-build.json.tmp", import.meta.url);
const inputPath = new URL("../.benchmark-build-input.json", import.meta.url);
const inputTemporaryPath = new URL("../.benchmark-build-input.json.tmp", import.meta.url);
if (args[0] === "--before") rmSync(receiptPath, { force: true });
const metadata = getBenchmarkMetadata(import.meta.url);
if (args[0] === "--before") {
  writeFileSync(
    inputTemporaryPath,
    JSON.stringify({ sourceSha256: metadata.artifacts.src!.sha256 }) + "\n",
  );
  renameSync(inputTemporaryPath, inputPath);
} else {
  if (!metadata.artifacts.dist) throw new Error("Build dist before recording its fingerprint");
  const input: unknown = JSON.parse(readFileSync(inputPath, "utf8"));
  if (
    !input ||
    typeof input !== "object" ||
    !("sourceSha256" in input) ||
    input.sourceSha256 !== metadata.artifacts.src!.sha256
  )
    throw new Error("Build inputs changed or no initial snapshot exists. Run pnpm build again.");
  writeFileSync(
    temporaryPath,
    JSON.stringify({
      sourceSha256: metadata.artifacts.src!.sha256,
      distSha256: metadata.artifacts.dist.sha256,
      recordedAt: metadata.timestamp,
    }) + "\n",
  );
  renameSync(temporaryPath, receiptPath);
}
