import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { setTimeout } from "node:timers/promises";
import { Ddu64Node } from "../src/Ddu64Node.js";

const encoder = new Ddu64Node();
const input = Uint8Array.from({ length: 1024 * 1024 }, (_, i) => (i * 31 + 7) & 255);

for (const checksum of [false, true]) {
  globalThis.gc?.();
  const before = process.memoryUsage();
  let peakRss = before.rss;
  let peakArrayBuffers = before.arrayBuffers;
  let writeWaitMs = 0;
  const sample = () => {
    const usage = process.memoryUsage();
    peakRss = Math.max(peakRss, usage.rss);
    peakArrayBuffers = Math.max(peakArrayBuffers, usage.arrayBuffers);
  };
  const stream = await encoder.createEncodeStream({ checksum });
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const output: string[] = [];
  const started = performance.now();
  await Promise.all([
    (async () => {
      for (let offset = 0; offset < input.length; offset += 64 * 1024) {
        const pendingAt = performance.now();
        await writer.write(input.subarray(offset, offset + 64 * 1024));
        writeWaitMs = Math.max(writeWaitMs, performance.now() - pendingAt);
        sample();
      }
      await writer.close();
    })(),
    (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        output.push(value);
        sample();
        await setTimeout(1);
      }
    })(),
  ]);
  const wire = output.join("");
  const decode = await encoder.createDecodeStream({ checksum, maxBufferedChars: wire.length });
  const destination = new Uint8Array(input.length);
  let length = 0;
  const decodeStarted = performance.now();
  await new ReadableStream<string>({
    start(controller) {
      for (let offset = 0; offset < wire.length; offset += 64 * 1024) {
        controller.enqueue(wire.slice(offset, offset + 64 * 1024));
      }
      controller.close();
    },
  })
    .pipeThrough(decode)
    .pipeTo(
      new WritableStream({
        write(chunk) {
          destination.set(chunk, length);
          length += chunk.length;
          sample();
        },
      }),
    );
  assert.equal(length, input.length);
  assert.deepEqual(destination, input);
  console.log(
    JSON.stringify({
      checksum,
      inputBytes: input.length,
      wireCodeUnits: wire.length,
      outputChunks: output.length,
      maxWriteWaitMs: writeWaitMs,
      encodeAndDecodeMs: performance.now() - started,
      decodeMs: performance.now() - decodeStarted,
      sampledPeakRssDelta: peakRss - before.rss,
      sampledPeakArrayBufferDelta: peakArrayBuffers - before.arrayBuffers,
    }),
  );
}

const cancelled = await encoder.createEncodeStream({ checksum: false });
const cancelWriter = cancelled.writable.getWriter();
const cancelReader = cancelled.readable.getReader();
const reason = new Error("benchmark reader cancelled");
const stalled = cancelWriter.write(input);
const rejected = assert.rejects(stalled, (error) => error === reason);
await cancelReader.cancel(reason);
await rejected;
console.log(JSON.stringify({ cancelledWriteRejected: true }));
