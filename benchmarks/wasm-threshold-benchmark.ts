import { performance } from "node:perf_hooks";
import { Ddu64, preloadWasm } from "../src/index.js";

type ThresholdResult = {
  size: number;
  mode: "js" | "wasm";
  iterations: number;
  encodeMs: number;
  decodeMs: number;
  mbps: number;
};

function makeBinary(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    bytes[i] = (i * 31 + 17) & 0xff;
  }
  return bytes;
}

function iterationsForSize(size: number): number {
  if (size <= 1024) return 10_000;
  if (size <= 4096) return 4_000;
  if (size <= 16 * 1024) return 1_000;
  if (size <= 64 * 1024) return 300;
  return 80;
}

function time(fn: () => void): number {
  const started = performance.now();
  fn();
  return performance.now() - started;
}

function runCase(size: number, mode: "js" | "wasm"): ThresholdResult {
  const encoder = new Ddu64({
    wasmThreshold: mode === "wasm" ? 1024 : Number.POSITIVE_INFINITY,
  });
  const input = makeBinary(size);
  const iterations = iterationsForSize(size);

  let encoded = encoder.encode(input);
  encoder.decodeToUint8Array(encoded);

  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
  gc?.();

  const encodeMs = time(() => {
    for (let i = 0; i < iterations; i++) {
      encoded = encoder.encode(input);
    }
  });
  const decodeMs = time(() => {
    for (let i = 0; i < iterations; i++) {
      encoder.decodeToUint8Array(encoded);
    }
  });
  const totalMb = (size * iterations) / (1024 * 1024);
  const totalSeconds = (encodeMs + decodeMs) / 1000;

  return {
    size,
    mode,
    iterations,
    encodeMs,
    decodeMs,
    mbps: totalSeconds > 0 ? totalMb / totalSeconds : 0,
  };
}

async function main(): Promise<void> {
  try {
    await preloadWasm();
    console.log("WASM: ready");
  } catch {
    console.log("WASM: unavailable, wasm rows use JS fallback");
  }

  const sizes = [512, 1024, 2048, 4096, 8192, 16 * 1024, 32 * 1024, 64 * 1024, 256 * 1024];
  const results = sizes.flatMap((size) => [runCase(size, "js"), runCase(size, "wasm")]);

  console.log("size      mode   iter    encode(ms)  decode(ms)   MB/s");
  console.log("------------------------------------------------------------");
  for (const result of results) {
    console.log(
      `${result.size.toString().padStart(7)} ` +
        `${result.mode.padStart(5)} ` +
        `${result.iterations.toString().padStart(6)} ` +
        `${result.encodeMs.toFixed(1).padStart(11)} ` +
        `${result.decodeMs.toFixed(1).padStart(11)} ` +
        `${result.mbps.toFixed(1).padStart(7)}`,
    );
  }
}

await main();
