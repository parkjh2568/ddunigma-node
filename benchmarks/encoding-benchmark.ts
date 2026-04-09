import { performance } from "perf_hooks";
import { Readable, Writable } from "stream";
import { Ddu64, DduSetSymbol, createEncodeStream, createDecodeStream } from "../src/index";

type GcEnabledGlobal = typeof globalThis & {
  gc?: () => void;
};

function formatMs(value: number): string {
  return `${value.toFixed(2)}ms`;
}

function formatMb(value: number): string {
  return `${(value / 1024 / 1024).toFixed(2)}MB`;
}

function runGc(): void {
  (globalThis as GcEnabledGlobal).gc?.();
}

async function measurePeakHeap<T>(
  fn: () => Promise<T> | T
): Promise<{ result: T; peakHeapDelta: number }> {
  runGc();
  const baselineHeap = process.memoryUsage().heapUsed;
  let peakHeap = baselineHeap;
  const sampleHeap = (): void => {
    const currentHeap = process.memoryUsage().heapUsed;
    if (currentHeap > peakHeap) {
      peakHeap = currentHeap;
    }
  };

  sampleHeap();
  const timer = setInterval(sampleHeap, 5);
  timer.unref();

  try {
    const result = await fn();
    sampleHeap();
    return {
      result,
      peakHeapDelta: peakHeap - baselineHeap,
    };
  } finally {
    clearInterval(timer);
    sampleHeap();
  }
}

async function measure<T>(
  label: string,
  fn: () => Promise<T> | T,
  iterations: number = 3
): Promise<void> {
  await fn(); // warm-up
  runGc();

  let elapsedTotal = 0;
  let peakHeapDelta = 0;
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const { peakHeapDelta: iterationPeakHeapDelta } = await measurePeakHeap(fn);
    elapsedTotal += performance.now() - start;
    peakHeapDelta = Math.max(peakHeapDelta, iterationPeakHeapDelta);
  }
  const averageElapsed = elapsedTotal / iterations;
  console.log(
    `${label.padEnd(34)} | ${formatMs(averageElapsed).padStart(10)} | ${`${formatMb(peakHeapDelta)}`.padStart(16)}`
  );
}

async function streamToString(readable: NodeJS.ReadableStream): Promise<string> {
  const chunks: string[] = [];
  return new Promise((resolve, reject) => {
    readable
      .on("data", (chunk: Buffer | string) => chunks.push(chunk.toString()))
      .on("end", () => resolve(chunks.join("")))
      .on("error", reject);
  });
}

async function streamToBuffer(readable: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    readable
      .on("data", (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      .on("end", () => resolve(Buffer.concat(chunks)))
      .on("error", reject);
  });
}

function createPseudoRandomBuffer(size: number): Buffer {
  const buffer = Buffer.allocUnsafe(size);
  let seed = 0x12345678;
  for (let i = 0; i < size; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    buffer[i] = seed & 0xff;
  }
  return buffer;
}

async function main(): Promise<void> {
  const plainEncoder = new Ddu64(undefined, undefined, {
    dduSetSymbol: DduSetSymbol.ONECHARSET,
  });
  const dduEncoder = new Ddu64(undefined, undefined, {
    dduSetSymbol: DduSetSymbol.DDU,
  });
  const twoCharsetEncoder = new Ddu64(undefined, undefined, {
    dduSetSymbol: DduSetSymbol.TWOCHARSET,
  });
  const compressedEncoder = new Ddu64(undefined, undefined, {
    dduSetSymbol: DduSetSymbol.ONECHARSET,
    compress: true,
    compressionAlgorithm: "brotli",
  });
  const encryptedEncoder = new Ddu64(undefined, undefined, {
    dduSetSymbol: DduSetSymbol.ONECHARSET,
    encryptionKey: "benchmark-secret-key",
    compress: true,
    compressionAlgorithm: "brotli",
  });

  const textPayload = "Benchmark payload :: ddunigma :: ".repeat(30_000);
  const koreanPayload = "벤치마크 페이로드 :: 디디유니그마 :: ".repeat(18_000);
  const mixedPayload = "DDU::한글::ASCII::12345::!@#::가나다라마바사::".repeat(14_000);
  const binaryPayload = Buffer.alloc(1024 * 1024, 0xab);
  const pseudoRandomPayload = createPseudoRandomBuffer(768 * 1024);

  console.log("DDUNIGMA NODE BENCHMARK");
  console.log("Scenario".padEnd(34) + " | " + "Avg Time".padStart(10) + " | " + "Peak Heap Δ".padStart(16));
  console.log("-".repeat(67));
  console.log("Note: peak heap is sampled during execution and is most stable when GC is exposed.\n");

  await measure("encode plain text", () => {
    const encoded = plainEncoder.encode(textPayload);
    const decoded = plainEncoder.decode(encoded);
    if (decoded !== textPayload) {
      throw new Error("plain text round-trip failed");
    }
  });

  await measure("encode chunked text", () => {
    const encoded = plainEncoder.encode(textPayload, {
      chunkSize: 76,
      chunkSeparator: "\n",
    });
    const decoded = plainEncoder.decode(encoded);
    if (decoded !== textPayload) {
      throw new Error("chunked text round-trip failed");
    }
  });

  await measure("encode ddu korean text", () => {
    const encoded = dduEncoder.encode(koreanPayload);
    const decoded = dduEncoder.decode(encoded);
    if (decoded !== koreanPayload) {
      throw new Error("DDU korean text round-trip failed");
    }
  });

  await measure("encode two-charset mixed text", () => {
    const encoded = twoCharsetEncoder.encode(mixedPayload);
    const decoded = twoCharsetEncoder.decode(encoded);
    if (decoded !== mixedPayload) {
      throw new Error("two-charset mixed round-trip failed");
    }
  });

  await measure("encode compressed binary", () => {
    const encoded = compressedEncoder.encode(binaryPayload);
    const decoded = compressedEncoder.decodeToBuffer(encoded);
    if (!decoded.equals(binaryPayload)) {
      throw new Error("compressed binary round-trip failed");
    }
  });

  await measure("encodeAsync encrypted payload", async () => {
    const encoded = await encryptedEncoder.encodeAsync(textPayload);
    const decoded = await encryptedEncoder.decodeAsync(encoded);
    if (decoded !== textPayload) {
      throw new Error("encrypted async round-trip failed");
    }
  });

  await measure("stream compress + encrypt", async () => {
    const encodedReadable = Readable.from([Buffer.from(textPayload)]).pipe(
      createEncodeStream(encryptedEncoder)
    );
    const encoded = await streamToString(encodedReadable);

    const decodedReadable = Readable.from([Buffer.from(encoded)]).pipe(
      createDecodeStream(encryptedEncoder)
    );
    const decoded = await streamToBuffer(decodedReadable);
    if (decoded.toString("utf-8") !== textPayload) {
      throw new Error("stream encrypt round-trip failed");
    }
  });

  await measure("stream mixed text round-trip", async () => {
    const encodedReadable = Readable.from([Buffer.from(mixedPayload)]).pipe(
      createEncodeStream(twoCharsetEncoder)
    );
    const encoded = await streamToString(encodedReadable);

    const decodedReadable = Readable.from([Buffer.from(encoded)]).pipe(
      createDecodeStream(twoCharsetEncoder)
    );
    const decoded = await streamToBuffer(decodedReadable);
    if (decoded.toString("utf-8") !== mixedPayload) {
      throw new Error("stream mixed text round-trip failed");
    }
  });

  await measure("stream binary no-output sink", async () => {
    await new Promise<void>((resolve, reject) => {
      const sink = new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      });

      Readable.from([binaryPayload])
        .pipe(createEncodeStream(plainEncoder))
        .pipe(sink)
        .on("finish", resolve)
        .on("error", reject);
    });
  });

  await measure("encode incompressible binary", () => {
    const encoded = plainEncoder.encode(pseudoRandomPayload);
    const decoded = plainEncoder.decodeToBuffer(encoded);
    if (!decoded.equals(pseudoRandomPayload)) {
      throw new Error("incompressible binary round-trip failed");
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
