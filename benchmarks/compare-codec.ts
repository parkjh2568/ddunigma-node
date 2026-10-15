import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { setImmediate } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const baseline = process.argv[2];
if (!baseline)
  throw new Error(
    "Usage: node --expose-gc --import tsx benchmarks/compare-codec.ts <baseline-directory>",
  );
const samples = Number(process.env.DDU_BENCH_SAMPLES ?? 9);
if (!Number.isSafeInteger(samples) || samples < 9) throw new Error("Use at least 9 samples");
const roots = [resolve(baseline), resolve(import.meta.dirname, "..")];
const codecs = await Promise.all(
  roots.map(async (root) => ({
    codec: (await import(
      pathToFileURL(resolve(root, "src/Ddu64Node.ts")).href
    )) as typeof import("../src/Ddu64Node.js"),
    utils: (await import(
      pathToFileURL(resolve(root, "src/core/codecUtils.ts")).href
    )) as typeof import("../src/core/codecUtils.js"),
    layer: (await import(
      pathToFileURL(resolve(root, "src/obfuscation/ObfuscationLayer.ts")).href
    )) as typeof import("../src/obfuscation/ObfuscationLayer.js"),
  })),
);
const sourceFiles = [
  "src/obfuscation/ObfuscationLayer.ts",
  "src/core/internal/NativeBase64FastPath.ts",
  "src/core/codecUtils.ts",
];
console.log(
  JSON.stringify({
    metadata: {
      node: process.version,
      cpu: cpus()[0]?.model,
      platform: platform(),
      os: release(),
      samples,
      roots,
      sourceSha256: roots.map((root) =>
        createHash("sha256")
          .update(
            sourceFiles
              .map((file) => file + "\n" + readFileSync(resolve(root, file), "utf8"))
              .join("\n"),
          )
          .digest("hex"),
      ),
      lockfileSha256: roots.map((root) =>
        createHash("sha256")
          .update(readFileSync(resolve(root, "pnpm-lock.yaml")))
          .digest("hex"),
      ),
      benchmarkSha256: createHash("sha256")
        .update(readFileSync(new URL(import.meta.url)))
        .digest("hex"),
      order: "alternating before/after; GC before each batch; warmed instances",
      throughput: "original input MiB / call seconds; chunk operation uses UTF-16 code units",
      memory:
        "observed batch heap/external/arrayBuffers deltas; not peak allocation or RSS savings",
      percentiles: "empirical batch-average call latency; not individual-call tail latency",
    },
  }),
);

let sink = 0;
for (const size of [64, 16 * 1024, 1024 * 1024, 8 * 1024 * 1024]) {
  const input = new Uint8Array(size);
  for (let i = 0; i < input.length; i++) input[i] = (i * 31 + 17) & 255;
  for (const workload of ["plain", "obfuscate", "base64-fallback"] as const) {
    const instances = codecs.map(({ codec }) =>
      workload === "base64-fallback"
        ? new codec.Ddu64Node(
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
            "=",
          )
        : new codec.Ddu64Node({ obfuscate: workload === "obfuscate" }),
    );
    const encoded = instances.map((codec) => codec.encode(input));
    assert.equal(encoded[0], encoded[1]);
    for (const codec of instances) assert.deepEqual(codec.decodeToUint8Array(encoded[0]), input);
    const operations =
      workload === "base64-fallback" ? (["decode"] as const) : (["encode", "decode"] as const);
    for (const operation of operations) {
      const fromBase64 = Object.getOwnPropertyDescriptor(Uint8Array, "fromBase64");
      const buffer = Object.getOwnPropertyDescriptor(globalThis, "Buffer");
      if (workload === "base64-fallback") {
        Object.defineProperty(Uint8Array, "fromBase64", { configurable: true, value: undefined });
        Object.defineProperty(globalThis, "Buffer", { configurable: true, value: undefined });
      }
      const timing: number[][] = [[], []];
      const cpu: number[][] = [[], []];
      const observed = [[], []] as Record<string, number>[][];
      const iterations = Math.max(1, Math.min(10_000, Math.floor((1024 * 1024) / size)));
      try {
        for (const codec of instances) {
          assert.deepEqual(codec.decodeToUint8Array(encoded[0]), input);
          for (let warm = 0; warm < 5; warm++) {
            if (operation === "encode") codec.encode(input);
            else codec.decodeToUint8Array(encoded[0]);
          }
        }
        for (let sample = 0; sample < samples; sample++) {
          for (const variant of sample % 2 ? [1, 0] : [0, 1]) {
            globalThis.gc?.();
            const startMemory = process.memoryUsage();
            const startCpu = process.cpuUsage();
            const start = performance.now();
            for (let i = 0; i < iterations; i++) {
              const value =
                operation === "encode"
                  ? instances[variant].encode(input)
                  : instances[variant].decodeToUint8Array(encoded[0]);
              sink = Math.imul(sink ^ value.length, 16_777_619);
              sink ^=
                typeof value === "string"
                  ? value.charCodeAt(value.length >>> 1)
                  : value[value.length >>> 1];
            }
            timing[variant].push((performance.now() - start) / iterations);
            const usedCpu = process.cpuUsage(startCpu);
            cpu[variant].push((usedCpu.user + usedCpu.system) / 1000 / iterations);
            const endMemory = process.memoryUsage();
            observed[variant].push({
              heapUsed: endMemory.heapUsed - startMemory.heapUsed,
              external: endMemory.external - startMemory.external,
              arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers,
            });
          }
          await setImmediate();
        }
      } finally {
        if (workload === "base64-fallback") {
          if (fromBase64) Object.defineProperty(Uint8Array, "fromBase64", fromBase64);
          else Reflect.deleteProperty(Uint8Array, "fromBase64");
          if (buffer) Object.defineProperty(globalThis, "Buffer", buffer);
          else Reflect.deleteProperty(globalThis, "Buffer");
        }
      }
      console.log(
        JSON.stringify({
          workload,
          operation,
          inputBytes: size,
          iterations,
          timingMs: timing,
          cpuMs: cpu,
          observedMemoryDeltas: observed,
          percentiles: timing.map((values) => {
            const sorted = [...values].sort((a, b) => a - b);
            return {
              p50: sorted[Math.ceil(samples * 0.5) - 1],
              p95: sorted[Math.ceil(samples * 0.95) - 1],
            };
          }),
        }),
      );
    }
  }
}

for (const size of [16 * 1024, 1024 * 1024]) {
  const input = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    .repeat(Math.ceil(size / 64))
    .slice(0, size);
  for (const chunkSize of [1, 76]) {
    const functions = codecs.map(
      ({ utils }) =>
        () =>
          utils.splitIntoChunks(input, chunkSize, "\r\n"),
    );
    assert.equal(functions[0](), functions[1]());
    const iterations = Math.max(2, Math.floor((1024 * 1024) / size));
    const timing: number[][] = [[], []];
    for (const fn of functions) for (let warm = 0; warm < 5; warm++) fn();
    for (let sample = 0; sample < samples; sample++) {
      for (const variant of sample % 2 ? [1, 0] : [0, 1]) {
        globalThis.gc?.();
        const start = performance.now();
        for (let i = 0; i < iterations; i++) sink ^= functions[variant]().length;
        timing[variant].push((performance.now() - start) / iterations);
      }
      await setImmediate();
    }
    console.log(
      JSON.stringify({
        workload: "chunk",
        inputCodeUnits: size,
        chunkSize,
        iterations,
        timingMs: timing,
        p50: timing.map(
          (values) => [...values].sort((a, b) => a - b)[Math.ceil(samples * 0.5) - 1],
        ),
        arraySlots: [2 * Math.ceil(size / chunkSize) - 1, Math.ceil(size / chunkSize)],
      }),
    );
  }
}
for (const alphabetSize of [83, 1024, 11_172]) {
  const alphabet = Array.from({ length: alphabetSize }, (_, i) => String.fromCharCode(256 + i));
  const input = alphabet[0].repeat(64);
  const functions = codecs.map(
    ({ layer }) =>
      () =>
        new layer.HangulObfuscationLayer(alphabet).obfuscate(input),
  );
  assert.equal(functions[0](), functions[1]());
  const iterations = Math.max(5, Math.floor(83_000 / alphabetSize));
  const timing: number[][] = [[], []];
  for (let sample = 0; sample < samples; sample++) {
    for (const variant of sample % 2 ? [1, 0] : [0, 1]) {
      globalThis.gc?.();
      const start = performance.now();
      for (let i = 0; i < iterations; i++) sink ^= functions[variant]().charCodeAt(0);
      timing[variant].push((performance.now() - start) / iterations);
    }
    await setImmediate();
  }
  console.log(
    JSON.stringify({
      workload: "cold-layer",
      alphabetSize,
      inputCodeUnits: input.length,
      iterations,
      timingMs: timing,
      p50: timing.map((values) => [...values].sort((a, b) => a - b)[Math.ceil(samples * 0.5) - 1]),
    }),
  );
}
console.log(JSON.stringify({ sink }));
