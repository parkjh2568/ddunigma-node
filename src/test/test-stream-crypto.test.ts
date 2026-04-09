import { describe, it, expect } from "vitest";
import { Ddu64 } from "../encoders/Ddu64";
import { randomBytes } from "crypto";
import { createEncodeStream, createDecodeStream } from "../utils";
import { PassThrough, Readable } from "stream";

describe("Stream Encryption Logic", () => {
  it("should flawlessly encode and decode async with encryption", async () => {
    const encoder = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=", {
      encryptionKey: "secret-key",
      compress: false
    });
    const largeBuffer = randomBytes(100 * 1024); // 100KB to trigger chunking
    const encoded = await encoder.encodeAsync(largeBuffer);
    const decoded = await encoder.decodeToBufferAsync(encoded);
    expect(decoded.equals(largeBuffer)).toBe(true);
  });

  it("should round-trip public stream API with encryption", async () => {
    const encoder = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=", {
      encryptionKey: "secret-key",
      compress: false,
    });
    const input = randomBytes(96 * 1024);
    const encodeStream = createEncodeStream(encoder);
    const encodedChunks: string[] = [];

    await new Promise<void>((resolve, reject) => {
      Readable.from([input])
        .pipe(encodeStream)
        .on("data", (chunk: Buffer | string) => encodedChunks.push(chunk.toString()))
        .on("end", resolve)
        .on("error", reject);
    });

    const decodeStream = createDecodeStream(encoder);
    const decodedChunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      Readable.from([Buffer.from(encodedChunks.join(""))])
        .pipe(decodeStream)
        .on("data", (chunk: Buffer) => decodedChunks.push(chunk))
        .on("end", resolve)
        .on("error", reject);
    });

    expect(Buffer.concat(decodedChunks).equals(input)).toBe(true);
  });

  it("should round-trip public stream API with compression and encryption", async () => {
    const encoder = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=", {
      encryptionKey: "secret-key",
      compress: true,
      compressionAlgorithm: "brotli",
    });
    const input = Buffer.from("stream-encryption-with-compression::".repeat(5000));
    const encodeStream = createEncodeStream(encoder);
    const encodedChunks: string[] = [];

    await new Promise<void>((resolve, reject) => {
      Readable.from([input])
        .pipe(encodeStream)
        .on("data", (chunk: Buffer | string) => encodedChunks.push(chunk.toString()))
        .on("end", resolve)
        .on("error", reject);
    });

    const decodeStream = createDecodeStream(encoder);
    const decodedChunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      Readable.from([Buffer.from(encodedChunks.join(""))])
        .pipe(decodeStream)
        .on("data", (chunk: Buffer) => decodedChunks.push(chunk))
        .on("end", resolve)
        .on("error", reject);
    });

    expect(Buffer.concat(decodedChunks).equals(input)).toBe(true);
  });

  it("should auto-detect compression in public decode stream without matching defaults", async () => {
    const encodeEncoder = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=", {
      compress: true,
      compressionAlgorithm: "brotli",
    });
    const decodeEncoder = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=");
    const input = Buffer.from("stream-autodetect-compression::".repeat(4000));
    const encodeStream = createEncodeStream(encodeEncoder);
    const encodedChunks: string[] = [];

    await new Promise<void>((resolve, reject) => {
      Readable.from([input])
        .pipe(encodeStream)
        .on("data", (chunk: Buffer | string) => encodedChunks.push(chunk.toString()))
        .on("end", resolve)
        .on("error", reject);
    });

    const decodeStream = createDecodeStream(decodeEncoder);
    const decodedChunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      Readable.from([Buffer.from(encodedChunks.join(""))])
        .pipe(decodeStream)
        .on("data", (chunk: Buffer) => decodedChunks.push(chunk))
        .on("end", resolve)
        .on("error", reject);
    });

    expect(Buffer.concat(decodedChunks).equals(input)).toBe(true);
  });

  it("should auto-detect encryption and compression in public decode stream when key matches", async () => {
    const encodeEncoder = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=", {
      encryptionKey: "secret-key",
      compress: true,
      compressionAlgorithm: "brotli",
    });
    const decodeEncoder = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=", {
      encryptionKey: "secret-key",
    });
    const input = Buffer.from("stream-autodetect-encryption::".repeat(4000));
    const encodeStream = createEncodeStream(encodeEncoder);
    const encodedChunks: string[] = [];

    await new Promise<void>((resolve, reject) => {
      Readable.from([input])
        .pipe(encodeStream)
        .on("data", (chunk: Buffer | string) => encodedChunks.push(chunk.toString()))
        .on("end", resolve)
        .on("error", reject);
    });

    const decodeStream = createDecodeStream(decodeEncoder);
    const decodedChunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      Readable.from([Buffer.from(encodedChunks.join(""))])
        .pipe(decodeStream)
        .on("data", (chunk: Buffer) => decodedChunks.push(chunk))
        .on("end", resolve)
        .on("error", reject);
    });

    expect(Buffer.concat(decodedChunks).equals(input)).toBe(true);
  });

  it("should emit decoded data before source end when stream header is present", async () => {
    const encoder = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=", {
      compress: false,
    });
    const input = Buffer.from("stream-header-early-output::".repeat(600));
    const encodeStream = createEncodeStream(encoder);
    const encodedChunks: string[] = [];

    await new Promise<void>((resolve, reject) => {
      Readable.from([input])
        .pipe(encodeStream)
        .on("data", (chunk: Buffer | string) => encodedChunks.push(chunk.toString()))
        .on("end", resolve)
        .on("error", reject);
    });

    const encoded = encodedChunks.join("");
    const decodeStream = createDecodeStream(encoder);
    const source = new PassThrough();
    const decodedChunks: Buffer[] = [];
    let emittedBeforeSourceEnd = false;
    let sourceEnded = false;

    decodeStream.on("data", (chunk: Buffer) => {
      decodedChunks.push(chunk);
      if (!sourceEnded) {
        emittedBeforeSourceEnd = true;
      }
    });

    const completion = new Promise<void>((resolve, reject) => {
      source
        .pipe(decodeStream)
        .on("end", resolve)
        .on("error", reject);
    });

    source.write(Buffer.from(encoded.slice(0, 4096), "utf-8"));
    await new Promise<void>((resolve) => setImmediate(resolve));
    sourceEnded = true;
    expect(emittedBeforeSourceEnd).toBe(true);

    source.end(Buffer.from(encoded.slice(4096), "utf-8"));
    await completion;

    expect(Buffer.concat(decodedChunks).equals(input)).toBe(true);
  });

  it("should keep decoding legacy footer-only stream payloads with default auto-detect", async () => {
    const encoder = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=", {
      encryptionKey: "secret-key",
      compress: true,
      compressionAlgorithm: "brotli",
    });
    const input = Buffer.from("legacy-stream-footer::".repeat(4000));
    const encodeStream = createEncodeStream(encoder, { streamAutoDetect: false });
    const encodedChunks: string[] = [];

    await new Promise<void>((resolve, reject) => {
      Readable.from([input])
        .pipe(encodeStream)
        .on("data", (chunk: Buffer | string) => encodedChunks.push(chunk.toString()))
        .on("end", resolve)
        .on("error", reject);
    });

    const decodeStream = createDecodeStream(encoder);
    const decodedChunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      Readable.from([Buffer.from(encodedChunks.join(""), "utf-8")])
        .pipe(decodeStream)
        .on("data", (chunk: Buffer) => decodedChunks.push(chunk))
        .on("end", resolve)
        .on("error", reject);
    });

    expect(Buffer.concat(decodedChunks).equals(input)).toBe(true);
  });
});
