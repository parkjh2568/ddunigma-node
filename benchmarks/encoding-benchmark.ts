import { performance } from "node:perf_hooks";
import { deflateSync } from "node:zlib";
import { Ddu64Node } from "../src/Ddu64Node.js";
import {
  CharsetBuilder,
  createReadableDecodeStream,
  createReadableEncodeStream,
  Ddu64,
  DduSetSymbol,
} from "../src/secure.js";

type BenchCase = {
  name: string;
  mode:
    | "platform-base64"
    | "base64-wrapper"
    | "js-bitpack"
    | "variable-charset"
    | "pipeline"
    | "legacy-v1"
    | "large-js"
    | "stream";
  encoder: Ddu64 | null;
  input: Uint8Array | string;
  iterations: number;
};

type BenchResult = {
  name: string;
  mode: BenchCase["mode"];
  encodeMs: number;
  decodeMs: number;
  encodedChars: number;
  encodedUtf8Bytes: number;
  mbps: number;
};

const textEncoder = new TextEncoder();
const BASE64_CHARS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"];
let sink = 0;

function makeText(size: number): string {
  const seed = "ddunigma benchmark 안녕하세요 0123456789 ABC xyz\n";
  const seedBytes = textEncoder.encode(seed).length;
  return seed.repeat(Math.floor(size / seedBytes)) + "a".repeat(size % seedBytes);
}

function makeBinary(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  let state = 0x12345678;
  for (let i = 0; i < size; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[i] = state & 0xff;
  }
  return bytes;
}

function inputToBytes(input: Uint8Array | string): Uint8Array {
  return typeof input === "string" ? textEncoder.encode(input) : input;
}

function runCase(testCase: BenchCase): BenchResult {
  const inputBytes = inputToBytes(testCase.input);
  const buffer = Buffer.from(inputBytes.buffer, inputBytes.byteOffset, inputBytes.byteLength);
  const encode = testCase.encoder
    ? () => testCase.encoder!.encode(testCase.input)
    : () =>
        (typeof testCase.input === "string"
          ? Buffer.from(testCase.input, "utf8")
          : buffer
        ).toString("base64");
  const decode = testCase.encoder
    ? (value: string) => testCase.encoder!.decodeToUint8Array(value)
    : (value: string) => Buffer.from(value, "base64");
  let encoded = encode();
  if (!buffer.equals(decode(encoded))) throw new Error(`${testCase.name}: round-trip failed`);

  const encodeSamples: number[] = [];
  const decodeSamples: number[] = [];
  for (let sample = 0; sample < 3; sample++) {
    globalThis.gc?.();
    let started = performance.now();
    for (let i = 0; i < testCase.iterations; i++) {
      encoded = encode();
      sink = Math.imul(
        sink ^ encoded.length ^ encoded.charCodeAt(encoded.length >>> 1),
        16_777_619,
      );
    }
    encodeSamples.push((performance.now() - started) / testCase.iterations);
    started = performance.now();
    for (let i = 0; i < testCase.iterations; i++) {
      const decoded = decode(encoded);
      sink = Math.imul(sink ^ decoded.length ^ decoded[decoded.length >>> 1], 16_777_619);
    }
    decodeSamples.push((performance.now() - started) / testCase.iterations);
  }
  const encodeMs = encodeSamples.sort((a, b) => a - b)[1];
  const decodeMs = decodeSamples.sort((a, b) => a - b)[1];

  const totalMb = inputBytes.length / (1024 * 1024);
  const totalSeconds = (encodeMs + decodeMs) / 1000;

  return {
    name: testCase.name,
    mode: testCase.mode,
    encodeMs,
    decodeMs,
    encodedChars: encoded.length,
    encodedUtf8Bytes: textEncoder.encode(encoded).length,
    mbps: totalSeconds > 0 ? totalMb / totalSeconds : 0,
  };
}

async function encodeViaStream(encoder: Ddu64, input: Uint8Array | string): Promise<string> {
  const inputBytes = inputToBytes(input);
  const stream = createReadableEncodeStream(encoder);
  const inputStream = new ReadableStream<Uint8Array>({
    start(controller) {
      const chunkSize = 16 * 1024;
      for (let offset = 0; offset < inputBytes.length; offset += chunkSize) {
        controller.enqueue(inputBytes.slice(offset, offset + chunkSize));
      }
      controller.close();
    },
  });

  const reader = inputStream.pipeThrough(stream).getReader();
  let encoded = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    encoded += value;
  }
  return encoded;
}

async function decodeViaStream(encoder: Ddu64, encoded: string): Promise<Uint8Array> {
  const stream = createReadableDecodeStream(encoder);
  const inputStream = new ReadableStream<string>({
    start(controller) {
      const chunkSize = 16 * 1024;
      for (let offset = 0; offset < encoded.length; offset += chunkSize) {
        controller.enqueue(encoded.slice(offset, offset + chunkSize));
      }
      controller.close();
    },
  });

  const reader = inputStream.pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  const decoded = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    decoded.set(chunk, offset);
    offset += chunk.length;
  }
  return decoded;
}

async function runStreamCase(testCase: BenchCase): Promise<BenchResult> {
  const inputBytes = inputToBytes(testCase.input);
  const encoder = testCase.encoder!;
  let encoded = await encodeViaStream(encoder, inputBytes);
  const decoded = await decodeViaStream(encoder, encoded);
  if (!Buffer.from(inputBytes).equals(decoded))
    throw new Error(`${testCase.name}: round-trip failed`);

  const encodeSamples: number[] = [];
  const decodeSamples: number[] = [];
  for (let sample = 0; sample < 3; sample++) {
    globalThis.gc?.();
    let started = performance.now();
    for (let i = 0; i < testCase.iterations; i++) {
      encoded = await encodeViaStream(encoder, inputBytes);
      sink = Math.imul(
        sink ^ encoded.length ^ encoded.charCodeAt(encoded.length >>> 1),
        16_777_619,
      );
    }
    encodeSamples.push((performance.now() - started) / testCase.iterations);
    started = performance.now();
    for (let i = 0; i < testCase.iterations; i++) {
      const decoded = await decodeViaStream(encoder, encoded);
      sink = Math.imul(sink ^ decoded.length ^ decoded[decoded.length >>> 1], 16_777_619);
    }
    decodeSamples.push((performance.now() - started) / testCase.iterations);
  }
  const encodeMs = encodeSamples.sort((a, b) => a - b)[1];
  const decodeMs = decodeSamples.sort((a, b) => a - b)[1];

  const totalMb = inputBytes.length / (1024 * 1024);
  const totalSeconds = (encodeMs + decodeMs) / 1000;

  return {
    name: testCase.name,
    mode: testCase.mode,
    encodeMs,
    decodeMs,
    encodedChars: encoded.length,
    encodedUtf8Bytes: textEncoder.encode(encoded).length,
    mbps: totalSeconds > 0 ? totalMb / totalSeconds : 0,
  };
}

async function main(): Promise<void> {
  const smallText = makeText(16 * 1024);
  const largeText = makeText(256 * 1024);
  const binary = makeBinary(256 * 1024);
  const largeBinary = makeBinary(8 * 1024 * 1024);
  const { charset: variableCharset, padding: variablePadding } = CharsetBuilder.base64()
    .limit(50)
    .buildWithPadding();

  const cases: BenchCase[] = [
    {
      name: "Buffer Base64 text 256KiB",
      mode: "platform-base64",
      encoder: null,
      input: largeText,
      iterations: 30,
    },
    {
      name: "Ddu64 Base64 text 256KiB",
      mode: "base64-wrapper",
      encoder: new Ddu64(BASE64_CHARS, "="),
      input: largeText,
      iterations: 30,
    },
    {
      name: "DDU text 256KiB",
      mode: "js-bitpack",
      encoder: new Ddu64(),
      input: largeText,
      iterations: 15,
    },
    {
      name: "DDU_V1 text 256KiB",
      mode: "legacy-v1",
      encoder: new Ddu64({ dduSetSymbol: DduSetSymbol.DDU_V1 }),
      input: largeText,
      iterations: 10,
    },
    {
      name: "ONECHARSET binary 256KiB",
      mode: "js-bitpack",
      encoder: new Ddu64({ dduSetSymbol: DduSetSymbol.ONECHARSET }),
      input: binary,
      iterations: 30,
    },
    {
      name: "50-char binary 256KiB",
      mode: "variable-charset",
      encoder: new Ddu64(variableCharset, variablePadding),
      input: binary,
      iterations: 10,
    },
    {
      name: "DDU binary 8MiB",
      mode: "large-js",
      encoder: new Ddu64(),
      input: largeBinary,
      iterations: 2,
    },
    {
      name: "DDU text 16KiB",
      mode: "js-bitpack",
      encoder: new Ddu64(),
      input: smallText,
      iterations: 200,
    },
    {
      name: "DDU compressed text 256KiB",
      mode: "pipeline",
      encoder: new Ddu64({ compress: true }),
      input: largeText,
      iterations: 20,
    },
    {
      name: "DDU compressed random 256KiB",
      mode: "pipeline",
      encoder: new Ddu64({ compress: true }),
      input: binary,
      iterations: 20,
    },
    {
      name: "DDU compressed deflate payload",
      mode: "pipeline",
      encoder: new Ddu64({ compress: true }),
      input: deflateSync(binary),
      iterations: 20,
    },
    {
      name: "DDU obfuscated text 16KiB",
      mode: "pipeline",
      encoder: new Ddu64({ obfuscate: true }),
      input: smallText,
      iterations: 100,
    },
    {
      name: "DDU compress+encrypt text 256KiB",
      mode: "pipeline",
      encoder: new Ddu64({
        compress: true,
        encryptionKey: "benchmark-secret",
      }),
      input: largeText,
      iterations: 10,
    },
    {
      name: "DDU WebStreams bytes 256KiB",
      mode: "stream",
      encoder: new Ddu64(),
      input: largeText,
      iterations: 5,
    },
  ];

  globalThis.gc?.();

  const results: BenchResult[] = [];
  for (const testCase of cases) {
    results.push(testCase.mode === "stream" ? await runStreamCase(testCase) : runCase(testCase));
  }
  const nameWidth = Math.max(...results.map((result) => result.name.length), "case".length);
  const modeWidth = Math.max(...results.map((result) => result.mode.length), "mode".length);

  console.log(
    "\nMedian of 3 samples; times are ms/call. Round-trip MiB/s uses original input bytes.",
  );
  console.log(
    "String inputs include UTF-8 conversion in platform/codec timings; WebStreams uses preconverted bytes.",
  );
  console.log(
    `${"case".padEnd(nameWidth)}  ${"mode".padEnd(modeWidth)}  encode(ms)  decode(ms)  chars     UTF8 bytes    MiB/s`,
  );
  console.log("-".repeat(nameWidth + modeWidth + 55));
  for (const result of results) {
    console.log(
      `${result.name.padEnd(nameWidth)}  ${result.mode.padEnd(modeWidth)}  ${result.encodeMs
        .toFixed(3)
        .padStart(10)}  ${result.decodeMs.toFixed(3).padStart(10)}  ${String(
        result.encodedChars,
      ).padStart(
        8,
      )}  ${String(result.encodedUtf8Bytes).padStart(10)}  ${result.mbps.toFixed(1).padStart(8)}`,
    );
  }

  console.log(
    "\n64-byte AES-GCM: median of 3 samples, first call vs 20 calls on the same instance.",
  );
  console.log(
    "Modules are already loaded; first call includes constructor and key derivation. ms/call.",
  );
  for (const iterations of [210_000, 600_000]) {
    const firstSamples: number[] = [];
    const reusedSamples: number[] = [];
    for (let sample = 0; sample < 3; sample++) {
      const input = new Uint8Array(64).fill(65);
      const started = performance.now();
      const codec = new Ddu64Node({
        encryptionKey: "benchmark-secret",
        keyDerivation: { algorithm: "pbkdf2", salt: "benchmark-salt", iterations },
      });
      let encoded = await codec.encodeAsync(input);
      firstSamples.push(performance.now() - started);
      const reusedStarted = performance.now();
      for (let i = 0; i < 20; i++) {
        encoded = await codec.encodeAsync(input);
        sink = Math.imul(sink ^ encoded.charCodeAt(encoded.length >>> 1), 16_777_619);
      }
      reusedSamples.push((performance.now() - reusedStarted) / 20);
      if (!Buffer.from(input).equals(await codec.decodeToUint8ArrayAsync(encoded))) {
        throw new Error("KDF benchmark round-trip failed");
      }
    }
    console.log(
      `PBKDF2 ${iterations}: first=${firstSamples.sort((a, b) => a - b)[1].toFixed(3)}, reused=${reusedSamples.sort((a, b) => a - b)[1].toFixed(3)}`,
    );
  }
  console.log(`sink=${sink}`);
}

await main();
