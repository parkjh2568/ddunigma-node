import { performance } from "node:perf_hooks";
import { CharsetBuilder, Ddu64, DduSetSymbol, preloadWasm } from "../src/index.js";

type BenchCase = {
  name: string;
  mode: "native-base64" | "js-bitpack" | "wasm-bitpack" | "variable-charset" | "pipeline";
  encoder: Ddu64;
  input: Uint8Array | string;
  iterations: number;
  disableNativeBase64?: boolean;
};

type BenchResult = {
  name: string;
  mode: BenchCase["mode"];
  encodeMs: number;
  decodeMs: number;
  encodedChars: number;
  mbps: number;
};

const textEncoder = new TextEncoder();
const BASE64_CHARS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"];

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

function withoutNativeBase64<T>(disabled: boolean | undefined, fn: () => T): T {
  if (!disabled) return fn();

  const globals = globalThis as typeof globalThis & { Buffer?: unknown };
  const originalBuffer = globals.Buffer;
  try {
    globals.Buffer = undefined;
    return fn();
  } finally {
    globals.Buffer = originalBuffer;
  }
}

function runCase(testCase: BenchCase): BenchResult {
  const inputBytes =
    typeof testCase.input === "string"
      ? textEncoder.encode(testCase.input).length
      : testCase.input.length;

  let encoded = "";
  withoutNativeBase64(testCase.disableNativeBase64, () => {
    encoded = testCase.encoder.encode(testCase.input);
    testCase.encoder.decodeToUint8Array(encoded);
  });

  const encodeMs = withoutNativeBase64(testCase.disableNativeBase64, () =>
    time(() => {
      for (let i = 0; i < testCase.iterations; i++) {
        encoded = testCase.encoder.encode(testCase.input);
      }
    }),
  );

  const decodeMs = withoutNativeBase64(testCase.disableNativeBase64, () =>
    time(() => {
      for (let i = 0; i < testCase.iterations; i++) {
        testCase.encoder.decodeToUint8Array(encoded);
      }
    }),
  );

  const totalMb = (inputBytes * testCase.iterations) / (1024 * 1024);
  const totalSeconds = (encodeMs + decodeMs) / 1000;

  return {
    name: testCase.name,
    mode: testCase.mode,
    encodeMs,
    decodeMs,
    encodedChars: encoded.length,
    mbps: totalSeconds > 0 ? totalMb / totalSeconds : 0,
  };
}

async function main(): Promise<void> {
  let wasmReady = false;
  try {
    await preloadWasm();
    wasmReady = true;
  } catch {
    wasmReady = false;
  }
  console.log(`WASM: ${wasmReady ? "ready" : "unavailable, using JS fallback"}`);

  const smallText = makeText(16 * 1024);
  const largeText = makeText(256 * 1024);
  const binary = makeBinary(256 * 1024);
  const { charset: variableCharset, padding: variablePadding } = CharsetBuilder.base64()
    .limit(50)
    .buildWithPadding();

  const cases: BenchCase[] = [
    {
      name: "Base64 text 256KB",
      mode: "native-base64",
      encoder: new Ddu64(BASE64_CHARS, "="),
      input: largeText,
      iterations: 30,
    },
    {
      name: "DDU text 256KB",
      mode: "js-bitpack",
      encoder: new Ddu64({ wasmThreshold: 1024 * 1024 }),
      input: largeText,
      iterations: 15,
      disableNativeBase64: true,
    },
    {
      name: "DDU text 256KB",
      mode: "wasm-bitpack",
      encoder: new Ddu64({ wasmThreshold: 1024 }),
      input: largeText,
      iterations: 15,
      disableNativeBase64: true,
    },
    {
      name: "ONECHARSET binary 256KB",
      mode: "wasm-bitpack",
      encoder: new Ddu64({ dduSetSymbol: DduSetSymbol.ONECHARSET }),
      input: binary,
      iterations: 30,
    },
    {
      name: "50-char binary 256KB",
      mode: "variable-charset",
      encoder: new Ddu64(variableCharset, variablePadding),
      input: binary,
      iterations: 10,
    },
    {
      name: "DDU text 16KB",
      mode: "js-bitpack",
      encoder: new Ddu64({ wasmThreshold: 1024 * 1024 }),
      input: smallText,
      iterations: 200,
      disableNativeBase64: true,
    },
    {
      name: "DDU compressed text 256KB",
      mode: "pipeline",
      encoder: new Ddu64({ compress: true }),
      input: largeText,
      iterations: 20,
    },
    {
      name: "DDU compress+encrypt text 256KB",
      mode: "pipeline",
      encoder: new Ddu64({
        compress: true,
        encryptionKey: "benchmark-secret",
      }),
      input: largeText,
      iterations: 10,
    },
  ];

  globalThis.gc?.();

  const results = cases.map(runCase);
  const nameWidth = Math.max(...results.map((result) => result.name.length), "case".length);
  const modeWidth = Math.max(...results.map((result) => result.mode.length), "mode".length);

  console.log("");
  console.log(
    `${"case".padEnd(nameWidth)}  ${"mode".padEnd(modeWidth)}  encode(ms)  decode(ms)  chars       MB/s`,
  );
  console.log("-".repeat(nameWidth + modeWidth + 55));
  for (const result of results) {
    console.log(
      `${result.name.padEnd(nameWidth)}  ${result.mode.padEnd(modeWidth)}  ${result.encodeMs
        .toFixed(1)
        .padStart(10)}  ${result.decodeMs.toFixed(1).padStart(10)}  ${String(
        result.encodedChars,
      ).padStart(8)}  ${result.mbps.toFixed(1).padStart(8)}`,
    );
  }
}

await main();
