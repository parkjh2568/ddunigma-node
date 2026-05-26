import { performance } from "node:perf_hooks";
import { Ddu64, DduSetSymbol, preloadWasm } from "../src/index.js";

type BenchCase = {
  name: string;
  encoder: Ddu64;
  input: Uint8Array | string;
  iterations: number;
};

type BenchResult = {
  name: string;
  encodeMs: number;
  decodeMs: number;
  encodedChars: number;
  mbps: number;
};

const textEncoder = new TextEncoder();

function makeText(size: number): string {
  const seed = "ddunigma benchmark 안녕하세요 0123456789 ABC xyz\n";
  let result = "";
  while (textEncoder.encode(result).length < size) {
    result += seed;
  }
  return result.slice(0, size);
}

function makeBinary(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    bytes[i] = (i * 31 + 17) & 0xff;
  }
  return bytes;
}

function time(fn: () => void): number {
  const started = performance.now();
  fn();
  return performance.now() - started;
}

function runCase(testCase: BenchCase): BenchResult {
  const inputBytes =
    typeof testCase.input === "string" ? textEncoder.encode(testCase.input).length : testCase.input.length;

  let encoded = "";
  const encodeMs = time(() => {
    for (let i = 0; i < testCase.iterations; i++) {
      encoded = testCase.encoder.encode(testCase.input);
    }
  });

  const decodeMs = time(() => {
    for (let i = 0; i < testCase.iterations; i++) {
      testCase.encoder.decodeToUint8Array(encoded);
    }
  });

  const totalMb = (inputBytes * testCase.iterations) / (1024 * 1024);
  const totalSeconds = (encodeMs + decodeMs) / 1000;

  return {
    name: testCase.name,
    encodeMs,
    decodeMs,
    encodedChars: encoded.length,
    mbps: totalSeconds > 0 ? totalMb / totalSeconds : 0,
  };
}

async function main(): Promise<void> {
  try {
    await preloadWasm();
    console.log("WASM: ready");
  } catch {
    console.log("WASM: unavailable, using JS/native fallback");
  }

  const smallText = makeText(16 * 1024);
  const largeText = makeText(256 * 1024);
  const binary = makeBinary(256 * 1024);

  const cases: BenchCase[] = [
    {
      name: "DDU text 16KB",
      encoder: new Ddu64(),
      input: smallText,
      iterations: 200,
    },
    {
      name: "DDU text 256KB",
      encoder: new Ddu64(),
      input: largeText,
      iterations: 30,
    },
    {
      name: "ONECHARSET binary 256KB",
      encoder: new Ddu64(undefined, undefined, { dduSetSymbol: DduSetSymbol.ONECHARSET }),
      input: binary,
      iterations: 30,
    },
    {
      name: "DDU compressed text 256KB",
      encoder: new Ddu64(undefined, undefined, { compress: true }),
      input: largeText,
      iterations: 20,
    },
    {
      name: "DDU compress+encrypt text 256KB",
      encoder: new Ddu64(undefined, undefined, {
        compress: true,
        encryptionKey: "benchmark-secret",
      }),
      input: largeText,
      iterations: 10,
    },
  ];

  globalThis.gc?.();

  const results = cases.map(runCase);
  const width = Math.max(...results.map((result) => result.name.length), "case".length);

  console.log("");
  console.log(
    `${"case".padEnd(width)}  encode(ms)  decode(ms)  chars       MB/s`,
  );
  console.log("-".repeat(width + 43));
  for (const result of results) {
    console.log(
      `${result.name.padEnd(width)}  ${result.encodeMs.toFixed(1).padStart(10)}  ${result.decodeMs
        .toFixed(1)
        .padStart(10)}  ${String(result.encodedChars).padStart(8)}  ${result.mbps
        .toFixed(1)
        .padStart(8)}`,
    );
  }
}

await main();
