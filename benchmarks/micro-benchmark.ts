import { performance } from "node:perf_hooks";
import { bitPackEncode } from "../src/core/BitPack.js";
import { splitIntoChunks } from "../src/core/codecUtils.js";
import { buildFooter, parseFooter } from "../src/core/wireFormat.js";
import { indicesToString } from "../src/core/internal/IndexStringMapper.js";

type BenchCase = {
  name: string;
  iterations: number;
  bytes: number;
  fn: () => unknown;
};

let sink = 0;

function consume(value: unknown): void {
  if (typeof value === "string") {
    sink ^= value.length;
    return;
  }
  if (value instanceof Uint8Array) {
    sink ^= value.length;
    return;
  }
  if (Array.isArray(value)) {
    sink ^= value.length;
    return;
  }
  if (value && typeof value === "object") {
    const maybeResult = value as {
      cleanedInput?: string;
      paddingBits?: number;
      indices?: ArrayLike<number>;
    };
    sink ^= maybeResult.cleanedInput?.length ?? 0;
    sink ^= maybeResult.paddingBits ?? 0;
    sink ^= maybeResult.indices?.length ?? 0;
  }
}

function makeIndices(length: number): Uint16Array {
  const indices = new Uint16Array(length);
  for (let i = 0; i < length; i++) {
    indices[i] = i & 63;
  }
  return indices;
}

function makeBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = (i * 31 + 17) & 0xff;
  }
  return bytes;
}

function runCase(testCase: BenchCase): {
  name: string;
  iterations: number;
  totalMs: number;
  avgUs: number;
  mbps: number;
} {
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
  gc?.();

  consume(testCase.fn());

  const started = performance.now();
  for (let i = 0; i < testCase.iterations; i++) {
    consume(testCase.fn());
  }
  const totalMs = performance.now() - started;
  const totalMb = (testCase.bytes * testCase.iterations) / (1024 * 1024);
  const seconds = totalMs / 1000;

  return {
    name: testCase.name,
    iterations: testCase.iterations,
    totalMs,
    avgUs: (totalMs * 1000) / testCase.iterations,
    mbps: seconds > 0 ? totalMb / seconds : 0,
  };
}

function main(): void {
  const pad = "뭐";
  const footer = buildFooter({
    paddingBits: 4,
    compressionAlgorithm: "deflate",
    isEncrypted: true,
    paddingChar: pad,
    pipelineVersion: 4,
  });
  const parseSmallInput = "ABCDEF" + footer;
  const parseLargeInput = "A".repeat(256 * 1024) + footer;
  const chunkInput = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".repeat(
    4096,
  );
  const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const charCodes = new Uint16Array([...base64Chars].map((char) => char.charCodeAt(0)));
  const indices16k = makeIndices(16 * 1024);
  const indices4k = makeIndices(4 * 1024);
  const indices256k = makeIndices(256 * 1024);
  const bytes16k = makeBytes(16 * 1024);
  const bytes256k = makeBytes(256 * 1024);
  const bitPack6Config = { bitLength: 6, usePowerOfTwo: true, charsetSize: 64 };
  const bitPack8Config = { bitLength: 8, usePowerOfTwo: true, charsetSize: 256 };

  const cases: BenchCase[] = [
    {
      name: "parseFooter small v4",
      iterations: 300_000,
      bytes: parseSmallInput.length,
      fn: () => parseFooter(parseSmallInput, pad, 6),
    },
    {
      name: "parseFooter 256KB v4",
      iterations: 1_000,
      bytes: parseLargeInput.length,
      fn: () => parseFooter(parseLargeInput, pad, 6),
    },
    {
      name: "indicesToString 4KB",
      iterations: 20_000,
      bytes: indices4k.byteLength,
      fn: () => indicesToString(indices4k, charCodes),
    },
    {
      name: "indicesToString 16KB",
      iterations: 5_000,
      bytes: indices16k.byteLength,
      fn: () => indicesToString(indices16k, charCodes),
    },
    {
      name: "indicesToString 256KB",
      iterations: 200,
      bytes: indices256k.byteLength,
      fn: () => indicesToString(indices256k, charCodes),
    },
    {
      name: "splitIntoChunks 256KB",
      iterations: 500,
      bytes: chunkInput.length,
      fn: () => splitIntoChunks(chunkInput, 76, "\n"),
    },
    {
      name: "bitPackEncode 6bit 16KB",
      iterations: 5_000,
      bytes: bytes16k.byteLength,
      fn: () => bitPackEncode(bytes16k, bitPack6Config),
    },
    {
      name: "bitPackEncode 6bit 256KB",
      iterations: 300,
      bytes: bytes256k.byteLength,
      fn: () => bitPackEncode(bytes256k, bitPack6Config),
    },
    {
      name: "bitPackEncode 8bit 16KB",
      iterations: 5_000,
      bytes: bytes16k.byteLength,
      fn: () => bitPackEncode(bytes16k, bitPack8Config),
    },
    {
      name: "bitPackEncode 8bit 256KB",
      iterations: 300,
      bytes: bytes256k.byteLength,
      fn: () => bitPackEncode(bytes256k, bitPack8Config),
    },
  ];

  console.log("case                       iter     total(ms)    avg(us)      MB/s");
  console.log("------------------------------------------------------------------------");
  for (const result of cases.map(runCase)) {
    console.log(
      `${result.name.padEnd(26)} ${result.iterations.toString().padStart(6)} ` +
        `${result.totalMs.toFixed(1).padStart(12)} ` +
        `${result.avgUs.toFixed(2).padStart(10)} ` +
        `${result.mbps.toFixed(1).padStart(9)}`,
    );
  }
  console.log(`sink=${sink}`);
}

main();
