import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { setImmediate, setTimeout } from "node:timers/promises";
import { deflateRawSync } from "node:zlib";
import { createDdu, Ddu64 } from "../src/index.js";
import type { DduCodec, DduCreateOptions } from "../src/index.js";

const samples = Number(process.env.DDU_BENCH_SAMPLES ?? 20);
if (!Number.isSafeInteger(samples) || samples < 20) throw new Error("Use at least 20 samples");
const sizes = [64, 1024, 16 * 1024, 1024 * 1024, 8 * 1024 * 1024];
const workloads: {
  name: string;
  input: string | Uint8Array;
  concurrency: number;
  options: DduCreateOptions;
}[] = [];
for (const size of sizes) {
  workloads.push({ name: `text-${size}`, input: "a".repeat(size), concurrency: 1, options: {} });
}
for (const size of [16 * 1024, 1024 * 1024, 8 * 1024 * 1024]) {
  workloads.push({
    name: `unicode-secure-${size}`,
    input: "\uFEFF한글😀".repeat(Math.floor(size / 13)),
    concurrency: 1,
    options: { compress: true, obfuscate: true, checksum: true, encryptionKey: "benchmark-key" },
  });
}
for (const size of [16 * 1024, 1024 * 1024]) {
  let seed = 0x12345678;
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    bytes[i] = seed & 255;
  }
  for (const [name, input] of [
    ["random", bytes],
    ["precompressed", new Uint8Array(deflateRawSync(bytes))],
  ] as const) {
    workloads.push({ name: `${name}-${size}`, input, concurrency: 1, options: { compress: true } });
  }
}
for (const concurrency of [4, 16]) {
  workloads.push({
    name: `concurrent-secure-${concurrency}`,
    input: "concurrent ".repeat(128),
    concurrency,
    options: { compress: true, checksum: true, encryptionKey: "benchmark-key" },
  });
}

console.log(
  JSON.stringify({
    metadata: {
      node: process.version,
      platform: platform(),
      os: release(),
      cpu: cpus()[0]?.model,
      commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      workingTreeDiffSha256: createHash("sha256")
        .update(execFileSync("git", ["diff", "HEAD"]))
        .digest("hex"),
      benchmarkSha256: createHash("sha256")
        .update(readFileSync(new URL(import.meta.url)))
        .digest("hex"),
      lockfileSha256: createHash("sha256").update(readFileSync("pnpm-lock.yaml")).digest("hex"),
      samples,
      inputBytes: "UTF-8 bytes or byteLength",
      throughput: "raw input MiB / encode+decode batch seconds",
      memory:
        "observed absolute bytes; arrayBuffers is included in external; transient allocations may be missed",
      percentiles: "empirical samples, not a latency guarantee",
      delayUnit: "milliseconds",
      delayResolutionMs: 10,
    },
  }),
);

const coldImportMs = [];
for (let i = 0; i < 5; i++) {
  coldImportMs.push(
    Number(
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          'const t=performance.now(); await import("./dist/index.js"); console.log(performance.now()-t);',
        ],
        { encoding: "utf8" },
      ).trim(),
    ),
  );
}
const firstKeyMs = [];
const reusedKeyMs = [];
for (let i = 0; i < 5; i++) {
  const ddu = createDdu({ encryptionKey: "benchmark-key" });
  let start = performance.now();
  await ddu.encode("first key");
  firstKeyMs.push(performance.now() - start);
  start = performance.now();
  await ddu.encode("reused key");
  reusedKeyMs.push(performance.now() - start);
}
console.log(JSON.stringify({ coldImportMs, firstKeyMs, reusedKeyMs, kdfIterations: 210_000 }));

let sink = 0;
for (const workload of workloads) {
  const inputBytes =
    typeof workload.input === "string"
      ? Buffer.byteLength(workload.input)
      : workload.input.byteLength;
  const legacy = new Ddu64(workload.options);
  const simple = createDdu({
    ...workload.options,
    output: typeof workload.input === "string" ? "text" : "bytes",
  });
  const codecs: Record<string, DduCodec<string | Uint8Array>> = {
    legacy: {
      encode: (input) => legacy.encodeAsync(input),
      decode: (input) =>
        typeof workload.input === "string"
          ? legacy.decodeAsync(input)
          : legacy.decodeToUint8ArrayAsync(input),
    },
    factory: simple,
  };
  for (const codec of Object.values(codecs)) {
    for (let i = 0; i < 3; i++)
      assert.deepEqual(await codec.decode(await codec.encode(workload.input)), workload.input);
  }
  globalThis.gc?.();
  const stats = Object.fromEntries(
    Object.keys(codecs).map((name) => [
      name,
      {
        callMs: [] as number[],
        encodeMs: [] as number[],
        decodeMs: [] as number[],
        batchMs: [] as number[],
        peak: process.memoryUsage(),
      },
    ]),
  );
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  await setTimeout(20);
  delay.reset();
  const utilization = performance.eventLoopUtilization();
  for (let sample = 0; sample < samples; sample++) {
    const order = sample % 2 ? ["factory", "legacy"] : ["legacy", "factory"];
    for (const name of order) {
      const codec = codecs[name];
      const stat = stats[name];
      const batchStart = performance.now();
      await Promise.all(
        Array.from({ length: workload.concurrency }, async () => {
          const start = performance.now();
          const pending = codec.encode(workload.input);
          stat.callMs.push(performance.now() - start);
          const encoded = await pending;
          stat.encodeMs.push(performance.now() - start);
          let observed = process.memoryUsage();
          for (const key of Object.keys(stat.peak) as (keyof typeof stat.peak)[])
            stat.peak[key] = Math.max(stat.peak[key], observed[key]);
          const decodeStart = performance.now();
          const decoded = await codec.decode(encoded);
          stat.decodeMs.push(performance.now() - decodeStart);
          sink ^= decoded.length;
          sink ^=
            typeof decoded === "string"
              ? decoded.charCodeAt(decoded.length >>> 1)
              : decoded[decoded.length >>> 1];
          observed = process.memoryUsage();
          for (const key of Object.keys(stat.peak) as (keyof typeof stat.peak)[])
            stat.peak[key] = Math.max(stat.peak[key], observed[key]);
        }),
      );
      stat.batchMs.push(performance.now() - batchStart);
      await setImmediate();
    }
  }
  await setTimeout(20);
  const elu = performance.eventLoopUtilization(utilization).utilization;
  delay.disable();
  for (const [api, stat] of Object.entries(stats)) {
    const totalMs = stat.batchMs.reduce((a, b) => a + b, 0);
    const percentiles = Object.fromEntries(
      ["callMs", "encodeMs", "decodeMs", "batchMs"].map((key) => {
        const values = [...stat[key as "callMs"]].sort((a, b) => a - b);
        return [
          key,
          {
            p50: values[Math.ceil(values.length * 0.5) - 1],
            p95: values[Math.ceil(values.length * 0.95) - 1],
          },
        ];
      }),
    );
    console.log(
      JSON.stringify({
        name: workload.name,
        api,
        inputBytes,
        concurrency: workload.concurrency,
        percentiles,
        roundTripMiBps:
          (inputBytes * workload.concurrency * samples) / (1024 * 1024) / (totalMs / 1000),
        observedMemory: stat.peak,
        raw: {
          callMs: stat.callMs,
          encodeMs: stat.encodeMs,
          decodeMs: stat.decodeMs,
          batchMs: stat.batchMs,
        },
        pairedEventLoop: {
          p95Ms: delay.percentile(95) / 1e6,
          maxMs: delay.max / 1e6,
          utilization: elu,
        },
      }),
    );
  }
}
console.log(JSON.stringify({ sink }));
