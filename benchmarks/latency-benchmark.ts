import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { setImmediate, setTimeout } from "node:timers/promises";
import { brotliCompressSync, constants, deflateRawSync } from "node:zlib";
import { createDdu, Ddu64 } from "../src/index.js";
import type { DduCodec, DduCreateOptions } from "../src/index.js";
import { getBenchmarkMetadata } from "./benchmarkMetadata.js";
import { parseFooter } from "../src/core/wireFormat.js";

let failureContext: Record<string, unknown> | undefined;
try {
  const samples = Number(process.env.DDU_BENCH_SAMPLES ?? 20);
  if (!Number.isSafeInteger(samples) || samples < 20 || samples > 10_000)
    throw new Error("Use 20 to 10000 samples");
  const sizes = [64, 1024, 16 * 1024, 1024 * 1024, 8 * 1024 * 1024];
  const workloads: {
    name: string;
    input: string | Uint8Array;
    concurrency: number;
    options: DduCreateOptions;
    compareCompression?: boolean;
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
      for (const algorithm of ["deflate", "brotli"] as const) {
        workloads.push({
          name: `${name}-${algorithm}-${size}`,
          input,
          concurrency: 1,
          options: { compressionAlgorithm: algorithm, compressionLevel: 6 },
          compareCompression: true,
        });
      }
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

  const filter = process.env.DDU_BENCH_FILTER ?? "";
  const selected = workloads.filter((workload) => workload.name.includes(filter));
  if (!selected.length) throw new Error(`No workload matches filter: ${filter}`);
  const metadata = getBenchmarkMetadata(import.meta.url);
  console.log(
    JSON.stringify({
      metadata: {
        ...metadata,
        samples,
        filter,
        warmup: 3,
        measurementTarget: "source/tsx; cold import separately uses fingerprinted dist",
        inputBytes: "UTF-8 bytes or byteLength",
        throughput: "raw input MiB / encode+decode batch seconds",
        memory:
          "observed absolute bytes; arrayBuffers is included in external; transient allocations may be missed",
        percentiles:
          "empirical per-call and per-batch; calls within a batch are correlated, not independent",
        ordering: "rotate variants per sample; all variants occupy each position in a full cycle",
        pairedEventLoop:
          "common interval for all variants including JSONL output, instrumentation and waits; not attributable to a single API",
        cpuScope:
          "whole-process CPU including native workers and GC; do not subtract from wall time to infer queue waits",
        gc: "optional explicit GC before workload only",
        failurePolicy: "retain every execution; no automatic retries or outlier removal",
        delayUnit: "milliseconds",
        delayResolutionMs: 10,
      },
    }),
  );
  if (!metadata.buildReceipt.matches)
    throw new Error(
      "Source/dist build receipt mismatch. Run pnpm build before latency measurements.",
    );

  const coldImportMs = [];
  failureContext = { phase: "cold-import" };
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
          { encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024 },
        ).trim(),
      ),
    );
  }
  const firstKeyMs = [];
  const reusedKeyMs = [];
  failureContext = { phase: "cold-key" };
  for (let i = 0; i < 5; i++) {
    const ddu = createDdu({ encryptionKey: "benchmark-key" });
    let start = performance.now();
    await ddu.encode("first key");
    firstKeyMs.push(performance.now() - start);
    start = performance.now();
    await ddu.encode("reused key");
    reusedKeyMs.push(performance.now() - start);
  }
  console.log(
    JSON.stringify({
      coldImportMs,
      firstKeyMs,
      reusedKeyMs,
      kdfIterations: 210_000,
      coldSamples: 5,
      coldImportScope: "module import only; excludes process start, does not clear OS caches",
      firstKeyScope: "lazy adapter + KDF + first encode, not isolated PBKDF2",
    }),
  );

  let sink = 0;
  for (const workload of selected) {
    failureContext = { workload: workload.name, phase: "setup" };
    const inputBytes =
      typeof workload.input === "string"
        ? Buffer.byteLength(workload.input)
        : workload.input.byteLength;
    const codecs: Record<string, DduCodec<string | Uint8Array>> = {};
    const profiles: Record<
      string,
      {
        compress: boolean;
        encodedCodeUnits: number;
        encodedUtf8Bytes: number;
        compressionApplied: boolean | undefined;
      }
    > = {};
    let rawCompressedBytes: number | undefined;
    if (workload.compareCompression) {
      assert(workload.input instanceof Uint8Array);
      rawCompressedBytes =
        workload.options.compressionAlgorithm === "brotli"
          ? brotliCompressSync(workload.input, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } })
              .length
          : deflateRawSync(workload.input, { level: 6 }).length;
    }
    for (const compress of workload.compareCompression
      ? [false, true]
      : [workload.options.compress ?? false]) {
      const options = { ...workload.options, compress };
      failureContext = { workload: workload.name, phase: "preflight", compress };
      const legacy = new Ddu64(options);
      const suffix = workload.compareCompression ? (compress ? "-on" : "-off") : "";
      codecs[`legacy${suffix}`] = {
        encode: (input) => legacy.encodeAsync(input),
        decode: (input) =>
          typeof workload.input === "string"
            ? legacy.decodeAsync(input)
            : legacy.decodeToUint8ArrayAsync(input),
      };
      codecs[`factory${suffix}`] = createDdu({
        ...options,
        output: typeof workload.input === "string" ? "text" : "bytes",
      });
      for (const name of [`legacy${suffix}`, `factory${suffix}`]) {
        const codec = codecs[name];
        failureContext = { workload: workload.name, variant: name, phase: "warmup" };
        for (let i = 0; i < 3; i++) {
          const encoded = await codec.encode(workload.input);
          assert.deepEqual(await codec.decode(encoded), workload.input);
          let compressionApplied: boolean | undefined;
          if (workload.compareCompression) {
            const info = legacy.getCharSetInfo();
            const footer = parseFooter(
              encoded,
              info.paddingChar,
              info.bitLength,
              2,
              info.usePowerOfTwo,
            );
            const expected =
              compress && rawCompressedBytes! < inputBytes
                ? workload.options.compressionAlgorithm
                : undefined;
            assert.equal(footer.compressionAlgorithm, expected);
            compressionApplied = footer.compressionAlgorithm !== undefined;
          }
          profiles[name] = {
            compress,
            encodedCodeUnits: encoded.length,
            encodedUtf8Bytes: Buffer.byteLength(encoded),
            compressionApplied,
          };
        }
      }
    }
    if (workload.compareCompression && rawCompressedBytes! >= inputBytes) {
      // Rejected compression must preserve the same unencrypted wire, not only round-trip bytes.
      assert.equal(
        await codecs["legacy-off"].encode(workload.input),
        await codecs["legacy-on"].encode(workload.input),
      );
      assert.equal(
        await codecs["factory-off"].encode(workload.input),
        await codecs["factory-on"].encode(workload.input),
      );
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
          batchCpuMicros: [] as { user: number; system: number }[],
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
      const names = Object.keys(codecs);
      const offset = sample % names.length;
      const order = [...names.slice(offset), ...names.slice(0, offset)];
      for (const name of order) {
        const codec = codecs[name];
        const stat = stats[name];
        failureContext = { workload: workload.name, variant: name, sample, partial: stat };
        const batchStart = performance.now();
        const cpuStart = process.cpuUsage();
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
        stat.batchCpuMicros.push(process.cpuUsage(cpuStart));
        console.log(
          JSON.stringify({
            type: "sample",
            name: workload.name,
            variant: name,
            sample,
            callRange: [sample * workload.concurrency, (sample + 1) * workload.concurrency],
            batchMs: stat.batchMs.at(-1),
            cpuMicros: stat.batchCpuMicros.at(-1),
            raw: {
              callMs: stat.callMs.slice(-workload.concurrency),
              encodeMs: stat.encodeMs.slice(-workload.concurrency),
              decodeMs: stat.decodeMs.slice(-workload.concurrency),
            },
          }),
        );
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
          inputSha256: createHash("sha256").update(workload.input).digest("hex"),
          inputSeed: workload.compareCompression
            ? "0x12345678; precompressed inputs use deflateRawSync"
            : undefined,
          options: workload.options,
          variant: profiles[api],
          rawCompressedBytes,
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
            batchCpuMicros: stat.batchCpuMicros,
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
} catch (error) {
  console.log(
    JSON.stringify({
      type: "failure",
      error: error instanceof Error ? error.message : String(error),
      context: failureContext,
    }),
  );
  process.exitCode = 1;
}
