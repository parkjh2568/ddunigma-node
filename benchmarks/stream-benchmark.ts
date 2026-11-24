import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Ddu64 } from "../src/index.js";
import type { DduConstructorOptions } from "../src/core/types.js";
import { buildStreamHeader, getStreamHeaderLength } from "../src/core/wireFormat.js";
import { getBenchmarkMetadata } from "./benchmarkMetadata.js";

type Scenario = {
  name: string;
  operation: "encode" | "decode";
  mode: "plain" | "checksum" | "encryption" | "nonpow2" | "deflate";
  bytes: number;
  chunkSize: number;
  consumerDelayMs: number;
};

const scenarios: Scenario[] = [
  {
    name: "plain-encode-16k",
    operation: "encode",
    mode: "plain",
    bytes: 16_384,
    chunkSize: 1024,
    consumerDelayMs: 0,
  },
  {
    name: "plain-slow-encode-16k",
    operation: "encode",
    mode: "plain",
    bytes: 16_384,
    chunkSize: 1024,
    consumerDelayMs: 1,
  },
  {
    name: "plain-encode-1m",
    operation: "encode",
    mode: "plain",
    bytes: 1_048_576,
    chunkSize: 65_536,
    consumerDelayMs: 0,
  },
  {
    name: "plain-decode-1m",
    operation: "decode",
    mode: "plain",
    bytes: 1_048_576,
    chunkSize: 4096,
    consumerDelayMs: 0,
  },
  {
    name: "checksum-encode-1m",
    operation: "encode",
    mode: "checksum",
    bytes: 1_048_576,
    chunkSize: 65_536,
    consumerDelayMs: 0,
  },
  {
    name: "checksum-decode-16k",
    operation: "decode",
    mode: "checksum",
    bytes: 16_384,
    chunkSize: 4096,
    consumerDelayMs: 0,
  },
  {
    name: "encryption-encode-16k",
    operation: "encode",
    mode: "encryption",
    bytes: 16_384,
    chunkSize: 4096,
    consumerDelayMs: 0,
  },
  {
    name: "encryption-decode-16k",
    operation: "decode",
    mode: "encryption",
    bytes: 16_384,
    chunkSize: 4096,
    consumerDelayMs: 0,
  },
  {
    name: "nonpow2-encode-16k",
    operation: "encode",
    mode: "nonpow2",
    bytes: 16_384,
    chunkSize: 4096,
    consumerDelayMs: 0,
  },
  {
    name: "deflate-encode-1m",
    operation: "encode",
    mode: "deflate",
    bytes: 1_048_576,
    chunkSize: 65_536,
    consumerDelayMs: 0,
  },
];
for (const bytes of [0, 1, 2, 3]) {
  scenarios.push({
    name: `plain-encode-edge-${bytes}`,
    operation: "encode",
    mode: "plain",
    bytes,
    chunkSize: 1,
    consumerDelayMs: 0,
  });
}
scenarios.push(
  {
    name: "plain-encode-8m",
    operation: "encode",
    mode: "plain",
    bytes: 8_388_608,
    chunkSize: 65_536,
    consumerDelayMs: 0,
  },
  {
    name: "plain-single-encode-1m",
    operation: "encode",
    mode: "plain",
    bytes: 1_048_576,
    chunkSize: 1_048_576,
    consumerDelayMs: 0,
  },
  {
    name: "deflate-decode-1m",
    operation: "decode",
    mode: "deflate",
    bytes: 1_048_576,
    chunkSize: 4096,
    consumerDelayMs: 0,
  },
  {
    name: "plain-decode-edge-3",
    operation: "decode",
    mode: "plain",
    bytes: 3,
    chunkSize: 1,
    consumerDelayMs: 0,
  },
);

type StreamSample = {
  completeMs: number;
  firstHeaderMs: number | null;
  firstPayloadMs: number | null;
  writeAwaitMs: number;
  maxWriteAwaitMs: number;
  writes: number;
  outputChunks: number;
  outputUnits: number;
  signature: number;
};

function integerSetting(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

async function runStream(
  scenario: Scenario,
  codec: Ddu64,
  input: Uint8Array,
  wire: string,
  headerLength: number,
  verify: boolean,
): Promise<StreamSample> {
  const started = performance.now();
  const stream =
    scenario.operation === "encode"
      ? await codec.createEncodeStream()
      : await codec.createDecodeStream();
  // The two concrete stream types share lifecycle handling, but retain typed I/O in each branch.
  const writer = stream.writable.getWriter() as WritableStreamDefaultWriter<Uint8Array | string>;
  const reader = stream.readable.getReader() as ReadableStreamDefaultReader<Uint8Array | string>;
  const encodedParts: string[] = [];
  const result: StreamSample = {
    completeMs: 0,
    firstHeaderMs: null,
    firstPayloadMs: null,
    writeAwaitMs: 0,
    maxWriteAwaitMs: 0,
    writes: 0,
    outputChunks: 0,
    outputUnits: 0,
    signature: 0,
  };
  const writing = (async () => {
    const length = scenario.operation === "encode" ? input.length : wire.length;
    for (let offset = 0; offset < length; offset += scenario.chunkSize) {
      const chunk =
        scenario.operation === "encode"
          ? input.subarray(offset, offset + scenario.chunkSize)
          : wire.slice(offset, offset + scenario.chunkSize);
      const beforeWrite = performance.now();
      // One outstanding write makes producer demand follow the consumer's backpressure.
      await writer.write(chunk);
      const elapsed = performance.now() - beforeWrite;
      result.writeAwaitMs += elapsed;
      result.maxWriteAwaitMs = Math.max(result.maxWriteAwaitMs, elapsed);
      result.writes++;
    }
    await writer.close();
  })();
  const reading = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const elapsed = performance.now() - started;
      if (scenario.operation === "encode") {
        assert.equal(typeof value, "string");
        const text = value as string;
        if (text.length > 0 && result.firstHeaderMs === null) result.firstHeaderMs = elapsed;
        if (result.outputUnits + text.length > headerLength && result.firstPayloadMs === null) {
          result.firstPayloadMs = elapsed;
        }
        if (verify) encodedParts.push(text);
        result.signature = Math.imul(
          result.signature ^ text.length ^ text.charCodeAt(text.length >>> 1),
          16_777_619,
        );
      } else {
        assert.ok(value instanceof Uint8Array);
        if (value.length > 0 && result.firstPayloadMs === null) result.firstPayloadMs = elapsed;
        if (verify) {
          assert.deepEqual(
            value,
            input.subarray(result.outputUnits, result.outputUnits + value.length),
          );
        }
        result.signature = Math.imul(
          result.signature ^ value.length ^ value[value.length >>> 1],
          16_777_619,
        );
      }
      result.outputUnits += value.length;
      result.outputChunks++;
      if (scenario.consumerDelayMs > 0) await delay(scenario.consumerDelayMs);
    }
  })();
  try {
    await Promise.all([writing, reading]);
    result.completeMs = performance.now() - started;
    if (verify && scenario.operation === "encode") {
      const encoded = encodedParts.join("");
      assert.deepEqual(await codec.decodeToUint8ArrayAsync(encoded.slice(headerLength)), input);
    } else if (verify) {
      assert.equal(result.outputUnits, input.length);
    }
    return result;
  } catch (error) {
    await Promise.allSettled([writer.abort(error), reader.cancel(error)]);
    await Promise.allSettled([writing, reading]);
    throw error;
  } finally {
    writer.releaseLock();
    reader.releaseLock();
  }
}

async function runChild(scenario: Scenario, samples: number, concurrency: number): Promise<void> {
  const options: DduConstructorOptions = {};
  if (scenario.mode === "checksum") options.checksum = true;
  if (scenario.mode === "deflate") options.compress = true;
  if (scenario.mode === "nonpow2") {
    options.dduChar = "ABCDEFG";
    options.paddingChar = "=";
  }
  if (scenario.mode === "encryption") {
    options.encryptionKey = "stream-benchmark-key";
    options.keyDerivation = { algorithm: "pbkdf2", iterations: 10_000 };
  }
  const codec = new Ddu64(options);
  const input = Uint8Array.from({ length: scenario.bytes }, (_, i) => (i * 31 + 17) & 255);
  const body = await codec.encodeAsync(input);
  const wire =
    buildStreamHeader(codec.getCharSetInfo().paddingChar, {
      encrypted: scenario.mode === "encryption",
      compressionAlgorithm: scenario.mode === "deflate" ? "deflate" : undefined,
    }) + body;
  const headerLength = getStreamHeaderLength(codec.getCharSetInfo().paddingChar);
  await Promise.all(
    Array.from({ length: concurrency }, () =>
      runStream(scenario, codec, input, wire, headerLength, true),
    ),
  );
  for (let warmup = 0; warmup < 3; warmup++) {
    await runStream(scenario, codec, input, wire, headerLength, false);
  }
  globalThis.gc?.();
  const rows: {
    batchMs: number;
    streams: StreamSample[];
    observedRssBytes: number;
    lifecycleMaxRssKiB: number;
  }[] = [];
  for (let sample = 0; sample < samples; sample++) {
    const started = performance.now();
    const streams = await Promise.all(
      Array.from({ length: concurrency }, () =>
        runStream(scenario, codec, input, wire, headerLength, false),
      ),
    );
    rows.push({
      batchMs: performance.now() - started,
      streams,
      observedRssBytes: process.memoryUsage().rss,
      lifecycleMaxRssKiB: process.resourceUsage().maxRSS,
    });
    process.send!({
      kind: "sample",
      row: rows[rows.length - 1],
      rssBytes: process.memoryUsage().rss,
      maxRssKiB: process.resourceUsage().maxRSS,
    });
  }
  const complete = rows.map((row) => row.batchMs).sort((a, b) => a - b);
  const totalMs = rows.reduce((sum, row) => sum + row.batchMs, 0);
  const streamPercentiles: Record<string, { p50: number; p95: number } | null> = {};
  for (const metric of [
    "firstHeaderMs",
    "firstPayloadMs",
    "completeMs",
    "writeAwaitMs",
    "maxWriteAwaitMs",
  ] as const) {
    const values = rows
      .flatMap((row) => row.streams.map((stream) => stream[metric]))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    streamPercentiles[metric] =
      values.length === 0
        ? null
        : {
            p50: values[Math.ceil(values.length * 0.5) - 1],
            p95: values[Math.ceil(values.length * 0.95) - 1],
          };
  }
  await new Promise<void>((resolve, reject) =>
    process.send!(
      {
        kind: "result",
        result: {
          status: "ok",
          scenario,
          samples,
          concurrency,
          warmup: 3,
          inputSha256: createHash("sha256").update(input).digest("hex"),
          inputPattern: "byte[i] = (i * 31 + 17) & 255; compressible deterministic bytes",
          chunkUnit: scenario.operation === "encode" ? "bytes" : "UTF-16 code units",
          outputUnit: scenario.operation === "encode" ? "UTF-16 code units" : "bytes",
          keyDerivation:
            scenario.mode === "encryption"
              ? { algorithm: "pbkdf2", iterations: 10_000, cache: "warmed codec instance" }
              : null,
          percentiles: {
            batchMs: {
              p50: complete[Math.ceil(samples * 0.5) - 1],
              p95: complete[Math.ceil(samples * 0.95) - 1],
            },
          },
          correlatedStreamPercentiles: streamPercentiles,
          originalMiBps: (input.length * concurrency * samples) / (1024 * 1024) / (totalMs / 1000),
          lifecycleMaxRssKiB: process.resourceUsage().maxRSS,
          raw: rows,
        },
      },
      (error: Error | null) => (error ? reject(error) : resolve()),
    ),
  );
}

async function main(): Promise<void> {
  const samples = integerSetting("DDU_BENCH_SAMPLES", 20, 20, 1000);
  const concurrency = integerSetting("DDU_BENCH_CONCURRENCY", 1, 1, 16);
  if (![1, 4, 16].includes(concurrency))
    throw new Error("DDU_BENCH_CONCURRENCY must be 1, 4, or 16");
  const timeoutMs = integerSetting("DDU_BENCH_TIMEOUT_MS", 30_000, 100, 300_000);
  const maxRssMiB = integerSetting("DDU_BENCH_MAX_RSS_MIB", 512, 64, 8192);
  const args = process.argv.slice(2);
  if (args.length > 0) {
    if (args.length !== 2 || args[0] !== "--scenario" || !process.send)
      throw new Error("Internal scenario arguments require a parent IPC channel");
    const scenario = scenarios.find((candidate) => candidate.name === args[1]);
    if (!scenario) throw new Error("Unknown child scenario");
    const reporting = setInterval(
      () =>
        process.send?.({
          kind: "memory",
          rssBytes: process.memoryUsage().rss,
          maxRssKiB: process.resourceUsage().maxRSS,
        }),
      20,
    );
    try {
      await runChild(scenario, samples, concurrency);
    } catch (error) {
      await new Promise<void>((resolve, reject) =>
        process.send!(
          {
            kind: "error",
            message: error instanceof Error ? error.message : String(error),
          },
          (sendError: Error | null) => (sendError ? reject(sendError) : resolve()),
        ),
      );
      process.exitCode = 1;
    } finally {
      clearInterval(reporting);
      process.disconnect?.();
    }
    return;
  }
  const filter = process.env.DDU_BENCH_FILTER;
  if (filter !== undefined && (filter.length === 0 || filter.length > 100))
    throw new Error("DDU_BENCH_FILTER must have 1-100 characters");
  const selected = scenarios.filter(
    (scenario) => filter === undefined || scenario.name.includes(filter),
  );
  if (selected.length === 0) throw new Error("DDU_BENCH_FILTER matched no stream scenarios");
  console.log(
    JSON.stringify({
      metadata: {
        ...getBenchmarkMetadata(import.meta.url),
        benchmark: "DDS1 isolated child processes; source entrypoint",
        samples,
        concurrency,
        gcBeforeSamples: typeof globalThis.gc === "function",
        timeoutMs,
        maxRssMiB,
        selectedScenarios: selected.map((scenario) => scenario.name),
        scope:
          "stream creation, awaited input writes, output reads and close; fixture setup and correctness outside timing",
        memory:
          "maxRSS is lifecycle high-water in KiB including startup, fixtures, correctness collection and warmup; timed sink consumes without collecting output",
        cutoff:
          "parent deadline forcibly terminates child; RSS cutoff uses child reports every 20ms and at batch completion, not a hard allocation cap during blocking work",
        sampling:
          "empirical batch samples from one warmed process; streams within one concurrent batch share resources and are correlated; not independent-process repeats or SLO guarantees",
        writeAwait: "includes codec work and consumer backpressure; not an isolated queue delay",
        slowConsumer:
          "1ms requested timer delay after each output read; elapsed delay depends on scheduler",
        firstOutput:
          "encode separates header and payload; decode emits payload only after full decoding/authentication when encrypted",
      },
    }),
  );
  for (const scenario of selected) {
    const row = await new Promise<Record<string, unknown>>((resolve) => {
      const child = spawn(
        process.execPath,
        [...process.execArgv, fileURLToPath(import.meta.url), "--scenario", scenario.name],
        { stdio: ["ignore", "ignore", "pipe", "ipc"] },
      );
      let result: Record<string, unknown> | undefined;
      let reason: string | undefined;
      let stderr = "";
      let observedRssBytes = 0;
      let lifecycleMaxRssKiB = 0;
      const partialSamples: unknown[] = [];
      child.stderr?.on("data", (data: Buffer) => {
        stderr = (stderr + data.toString()).slice(-8192);
      });
      const deadline = setTimeout(() => {
        reason = "deadline";
        child.kill("SIGKILL");
      }, timeoutMs);
      child.on("message", (message: unknown) => {
        if (!message || typeof message !== "object") return;
        const data = message as {
          kind?: string;
          rssBytes?: number;
          maxRssKiB?: number;
          result?: Record<string, unknown>;
          row?: unknown;
          message?: string;
        };
        if (data.kind === "sample") partialSamples.push(data.row);
        if (
          (data.kind === "memory" || data.kind === "sample") &&
          typeof data.rssBytes === "number" &&
          typeof data.maxRssKiB === "number"
        ) {
          observedRssBytes = Math.max(observedRssBytes, data.rssBytes);
          lifecycleMaxRssKiB = Math.max(lifecycleMaxRssKiB, data.maxRssKiB);
          if (
            Math.max(observedRssBytes, lifecycleMaxRssKiB * 1024) > maxRssMiB * 1024 * 1024 &&
            !reason
          ) {
            reason = "observed-rss-limit";
            child.kill("SIGKILL");
          }
        } else if (data.kind === "result") result = data.result;
        else if (data.kind === "error") reason = `child-error: ${data.message}`;
      });
      child.on("error", (error) => {
        reason = `spawn-error: ${error.message}`;
      });
      child.on("close", (code, signal) => {
        clearTimeout(deadline);
        resolve(
          code === 0 && result && !reason
            ? result
            : {
                status: "failed",
                scenario,
                reason: reason ?? "child-failed-or-missing-result",
                exitCode: code,
                signal,
                observedRssBytes,
                lifecycleMaxRssKiB,
                completedSamples: partialSamples.length,
                raw: partialSamples,
                stderr,
              },
        );
      });
    });
    console.log(JSON.stringify(row));
    if (row.status !== "ok") process.exitCode = 1;
  }
}

await main().catch((error: unknown) => {
  console.log(
    JSON.stringify({
      status: "failed",
      reason: "benchmark-error",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
