import { performance } from "node:perf_hooks";
import { bitPackEncode } from "../src/core/BitPack.js";
import { splitIntoChunks } from "../src/core/codecUtils.js";
import { buildFooter, parseFooter } from "../src/core/wireFormat.js";
import { packPow2ToString } from "../src/core/internal/IndexStringMapper.js";
import { HangulObfuscationLayer } from "../src/obfuscation/ObfuscationLayer.js";
import { NodeAdapter } from "../src/adapters/NodeAdapter.js";
import { Ddu64Node } from "../src/Ddu64Node.js";
import { Ddu64Browser } from "../src/Ddu64Browser.js";
import { DduSetSymbol } from "../src/core/types.js";

type BenchCase = {
  name: string;
  iterations: number;
  bytes?: number;
  fn: () => unknown;
};

let sink = 0;

function consume(value: unknown): void {
  if (typeof value === "string") {
    sink = Math.imul(sink ^ value.length ^ (value.charCodeAt(value.length >>> 1) || 0), 16_777_619);
    return;
  }
  if (value instanceof Uint8Array) {
    sink = Math.imul(sink ^ value.length ^ (value[value.length >>> 1] ?? 0), 16_777_619);
    return;
  }
  if (Array.isArray(value)) {
    sink ^= value.length;
    return;
  }
  if (value && typeof value === "object") {
    const maybeResult = value as {
      cleanedInput?: string;
      payload?: string;
      paddingBits?: number;
      indices?: ArrayLike<number>;
    };
    sink ^= maybeResult.cleanedInput?.length ?? 0;
    sink ^= maybeResult.paddingBits ?? 0;
    sink ^= maybeResult.indices?.length ?? 0;
    if (maybeResult.payload !== undefined) consume(maybeResult.payload);
  }
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
  mbps: number | undefined;
} {
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
  for (let i = 0; i < 5; i++) consume(testCase.fn());
  const samples: number[] = [];
  for (let sample = 0; sample < 3; sample++) {
    gc?.();
    const started = performance.now();
    for (let i = 0; i < testCase.iterations; i++) {
      consume(testCase.fn());
    }
    samples.push(performance.now() - started);
  }
  const totalMs = samples.sort((a, b) => a - b)[1];
  const totalMb = ((testCase.bytes ?? 0) * testCase.iterations) / (1024 * 1024);
  const seconds = totalMs / 1000;

  return {
    name: testCase.name,
    iterations: testCase.iterations,
    totalMs,
    avgUs: (totalMs * 1000) / testCase.iterations,
    mbps: testCase.bytes !== undefined && seconds > 0 ? totalMb / seconds : undefined,
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
  const bytes4k = makeBytes(4 * 1024);
  const bytes16k = makeBytes(16 * 1024);
  const bytes256k = makeBytes(256 * 1024);
  const bitPack6Config = { bitLength: 6, usePowerOfTwo: true, charsetSize: 64 };
  const bitPack8Config = { bitLength: 8, usePowerOfTwo: true, charsetSize: 256 };

  const cases: BenchCase[] = [
    {
      name: "parseFooter small v4",
      iterations: 300_000,
      fn: () => parseFooter(parseSmallInput, pad, 6),
    },
    {
      name: "parseFooter 256KiB v4",
      iterations: 1_000,
      fn: () => parseFooter(parseLargeInput, pad, 6),
    },
    {
      name: "packPow2ToString 4KiB",
      iterations: 20_000,
      bytes: bytes4k.byteLength,
      fn: () => packPow2ToString(bytes4k, 6, charCodes),
    },
    {
      name: "packPow2ToString 16KiB",
      iterations: 5_000,
      bytes: bytes16k.byteLength,
      fn: () => packPow2ToString(bytes16k, 6, charCodes),
    },
    {
      name: "packPow2ToString 256KiB",
      iterations: 200,
      bytes: bytes256k.byteLength,
      fn: () => packPow2ToString(bytes256k, 6, charCodes),
    },
    {
      name: "splitIntoChunks 256KiB",
      iterations: 500,
      bytes: chunkInput.length,
      fn: () => splitIntoChunks(chunkInput, 76, "\n"),
    },
    {
      name: "bitPackEncode 6bit 16KiB",
      iterations: 5_000,
      bytes: bytes16k.byteLength,
      fn: () => bitPackEncode(bytes16k, bitPack6Config),
    },
    {
      name: "bitPackEncode 6bit 256KiB",
      iterations: 300,
      bytes: bytes256k.byteLength,
      fn: () => bitPackEncode(bytes256k, bitPack6Config),
    },
    {
      name: "bitPackEncode 8bit 16KiB",
      iterations: 5_000,
      bytes: bytes16k.byteLength,
      fn: () => bitPackEncode(bytes16k, bitPack8Config),
    },
    {
      name: "bitPackEncode 8bit 256KiB",
      iterations: 300,
      bytes: bytes256k.byteLength,
      fn: () => bitPackEncode(bytes256k, bitPack8Config),
    },
  ];

  const layer = new HangulObfuscationLayer([...base64Chars, "="]);
  const adapter = new NodeAdapter();
  const key = adapter.deriveKeySync("micro-benchmark", { algorithm: "sha256" });
  for (const size of [64, 1024, 16 * 1024, 1024 * 1024]) {
    const bytes = makeBytes(size);
    const iterations = Math.max(5, Math.floor((2 * 1024 * 1024) / size));
    const text = base64Chars.repeat(Math.ceil(size / 64)).slice(0, size);
    const obfuscated = layer.obfuscate(text);
    const encrypted = adapter.encryptSync(bytes, key);
    cases.push(
      { name: `obfuscate ${size} chars`, bytes: size, iterations, fn: () => layer.obfuscate(text) },
      {
        name: `deobfuscate ${size} chars`,
        bytes: size,
        iterations,
        fn: () => layer.deobfuscate(obfuscated),
      },
      {
        name: `AES encrypt ${size} B`,
        bytes: size,
        iterations,
        fn: () => adapter.encryptSync(bytes, key),
      },
      {
        name: `AES decrypt ${size} B`,
        bytes: size,
        iterations,
        fn: () => adapter.decryptSync(encrypted, key),
      },
    );
    for (const Codec of [Ddu64Node, Ddu64Browser]) {
      for (const obfuscate of [false, true]) {
        const codec = new Codec({ obfuscate });
        const encoded = codec.encode(bytes);
        cases.push(
          {
            name: `${Codec.name} encode ${size} ${obfuscate}`,
            bytes: size,
            iterations,
            fn: () => codec.encode(bytes),
          },
          {
            name: `${Codec.name} decode ${size} ${obfuscate}`,
            bytes: size,
            iterations,
            fn: () => codec.decodeToUint8Array(encoded),
          },
        );
      }
    }
    const legacy = new Ddu64Node({ dduSetSymbol: DduSetSymbol.DDU_V1 });
    cases.push({
      name: `DDU_V1 encode ${size} B`,
      bytes: size,
      iterations,
      fn: () => legacy.encode(bytes),
    });
  }

  console.log(
    "Median of 3 samples; codec/AES throughput uses original bytes, text operations use code units.",
  );
  console.log(
    "Footer parsing inspects only the suffix; report latency without payload throughput.",
  );
  console.log(
    "case                                             iter     total(ms)    avg(us)     MiB/s",
  );
  console.log("------------------------------------------------------------------------");
  for (const result of cases.map(runCase)) {
    console.log(
      `${result.name.padEnd(48)} ${result.iterations.toString().padStart(6)} ` +
        `${result.totalMs.toFixed(1).padStart(12)} ` +
        `${result.avgUs.toFixed(2).padStart(10)} ` +
        `${(result.mbps?.toFixed(1) ?? "-").padStart(9)}`,
    );
  }
  console.log(`sink=${sink}`);
}

main();
