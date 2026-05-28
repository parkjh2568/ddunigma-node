/**
 * Unit tests for Web Streams encode/decode TransformStreams.
 *
 * Tests verify:
 * - Encode stream produces valid header
 * - Decode stream parses header correctly
 * - Encode → Decode round-trip works for plain data
 * - Encode → Decode round-trip works with compression
 * - Encode → Decode round-trip works with encryption
 * - Error signaling on invalid input
 */

import { describe, it, expect } from "vitest";
import { Ddu64Core } from "../core/Ddu64Core.js";
import { Ddu64Node as Ddu64 } from "../Ddu64Node.js";
import { NodeAdapter } from "../adapters/NodeAdapter.js";
import { createReadableEncodeStream, createReadableDecodeStream } from "../streams/WebStreams.js";
import { DduSetSymbol, type DduConstructorOptions } from "../core/types.js";
import {
  getStreamHeaderLength,
  parseStreamHeader,
  WIRE_FORMAT_VERSION,
} from "../core/wireFormat.js";
import {
  Ddu64ChecksumError,
  Ddu64DecryptionError,
  Ddu64ErrorCode,
  isDdu64Error,
} from "../core/errors.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createEncoder(opts: DduConstructorOptions = {}) {
  return new Ddu64Core(undefined, undefined, {
    ...opts,
    adapter: new NodeAdapter(),
  });
}

/**
 * Helper to pipe a Uint8Array through an encode TransformStream and collect output.
 */
async function encodeViaStream(
  encoder: Ddu64Core,
  input: Uint8Array,
  options?: Parameters<typeof createReadableEncodeStream>[1],
): Promise<string> {
  const stream = createReadableEncodeStream(encoder, options);

  const inputStream = new ReadableStream<Uint8Array>({
    start(controller) {
      const chunkSize = Math.max(1, Math.ceil(input.length / 3));
      for (let i = 0; i < input.length; i += chunkSize) {
        controller.enqueue(input.slice(i, Math.min(i + chunkSize, input.length)));
      }
      controller.close();
    },
  });

  const outputStream = inputStream.pipeThrough(stream);
  const reader = outputStream.getReader();

  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += value;
  }
  return result;
}

/**
 * Helper to pipe a string through a decode TransformStream and collect output.
 */
async function decodeViaStream(
  encoder: Ddu64Core,
  input: string,
  options?: Parameters<typeof createReadableDecodeStream>[1],
): Promise<Uint8Array> {
  const stream = createReadableDecodeStream(encoder, options);

  const inputStream = new ReadableStream<string>({
    start(controller) {
      const chunkSize = Math.max(1, Math.ceil(input.length / 3));
      for (let i = 0; i < input.length; i += chunkSize) {
        controller.enqueue(input.slice(i, Math.min(i + chunkSize, input.length)));
      }
      controller.close();
    },
  });

  const outputStream = inputStream.pipeThrough(stream);
  const reader = outputStream.getReader();

  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Helper to attempt decoding a string and expect an error.
 */
async function expectDecodeError(
  encoder: Ddu64Core,
  input: string,
  matchPattern?: RegExp,
): Promise<void> {
  const stream = createReadableDecodeStream(encoder);

  const inputStream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue(input);
      controller.close();
    },
  });

  const fn = async () => {
    const outputStream = inputStream.pipeThrough(stream);
    const reader = outputStream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  };

  if (matchPattern) {
    await expect(fn()).rejects.toThrow(matchPattern);
  } else {
    await expect(fn()).rejects.toThrow();
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("WebStreams", () => {
  describe("createReadableEncodeStream", () => {
    it("produces valid stream header with DDS1 magic", async () => {
      const encoder = createEncoder();
      const info = encoder.getCharSetInfo();
      const input = new TextEncoder().encode("Hello, World!");

      const encoded = await encodeViaStream(encoder, input);

      // Verify header structure: [pad]DDS1[compress][encrypt][pad]
      const headerLength = getStreamHeaderLength(info.paddingChar);
      expect(encoded.length).toBeGreaterThanOrEqual(headerLength);

      const header = encoded.slice(0, headerLength);
      expect(header.startsWith(info.paddingChar)).toBe(true);
      expect(header.endsWith(info.paddingChar)).toBe(true);
      expect(header.includes(WIRE_FORMAT_VERSION)).toBe(true);

      // Parse the header
      const meta = parseStreamHeader(header, info.paddingChar);
      expect(meta).not.toBeNull();
      expect(meta!.compressionAlgorithm).toBeUndefined();
      expect(meta!.encrypted).toBe(false);
    });

    it("produces header with compression flag when compress is enabled", async () => {
      const encoder = createEncoder({ compress: true });
      const info = encoder.getCharSetInfo();
      const input = new TextEncoder().encode("Hello, World! This is a test of compression.");

      const encoded = await encodeViaStream(encoder, input, { compress: true });

      const headerLength = getStreamHeaderLength(info.paddingChar);
      const header = encoded.slice(0, headerLength);
      const meta = parseStreamHeader(header, info.paddingChar);

      expect(meta).not.toBeNull();
      expect(meta!.compressionAlgorithm).toBe("deflate");
      expect(meta!.encrypted).toBe(false);
    });

    it("produces header with encryption flag when encryption is enabled", async () => {
      const encoder = createEncoder({ encryptionKey: "test-secret-key" });
      const info = encoder.getCharSetInfo();
      const input = new TextEncoder().encode("Secret message");

      const encoded = await encodeViaStream(encoder, input, { encrypt: true });

      const headerLength = getStreamHeaderLength(info.paddingChar);
      const header = encoded.slice(0, headerLength);
      const meta = parseStreamHeader(header, info.paddingChar);

      expect(meta).not.toBeNull();
      expect(meta!.encrypted).toBe(true);
    });

    it("produces header even for empty input", async () => {
      const encoder = createEncoder();
      const info = encoder.getCharSetInfo();
      const input = new Uint8Array(0);

      const encoded = await encodeViaStream(encoder, input);

      const headerLength = getStreamHeaderLength(info.paddingChar);
      expect(encoded.length).toBe(headerLength);

      const meta = parseStreamHeader(encoded, info.paddingChar);
      expect(meta).not.toBeNull();
    });
  });

  describe("createReadableDecodeStream", () => {
    it("parses stream header correctly", async () => {
      const encoder = createEncoder();
      const input = new TextEncoder().encode("Test data for decoding");

      const encoded = await encodeViaStream(encoder, input);
      const decoded = await decodeViaStream(encoder, encoded);
      expect(decoded).toEqual(input);
    });

    it("signals error on invalid stream header", async () => {
      const encoder = createEncoder();
      await expectDecodeError(encoder, "INVALID_DATA_WITHOUT_HEADER");
    });

    it("signals error on incomplete stream header", async () => {
      const encoder = createEncoder();
      const info = encoder.getCharSetInfo();
      await expectDecodeError(encoder, info.paddingChar);
    });

    it("signals error when encrypted stream lacks encryption key", async () => {
      const encEncoder = createEncoder({ encryptionKey: "secret" });
      const input = new TextEncoder().encode("Secret");
      const encoded = await encodeViaStream(encEncoder, input, { encrypt: true });

      const decEncoder = createEncoder();
      await expectDecodeError(decEncoder, encoded, /encryptionKey/);
    });
  });

  describe("Encode → Decode round-trip", () => {
    it("round-trips plain data correctly", async () => {
      const encoder = createEncoder();
      const input = new TextEncoder().encode("Hello, World! 안녕하세요!");

      const encoded = await encodeViaStream(encoder, input);
      const decoded = await decodeViaStream(encoder, encoded);

      expect(decoded).toEqual(input);
    });

    it("round-trips V2 default constructor streams", async () => {
      const encoder = new Ddu64();
      const input = new TextEncoder().encode("V2 default stream compatibility: 안녕하세요 12345");

      expect(encoder.getCharSetInfo().usePowerOfTwo).toBe(true);

      const encoded = await encodeViaStream(encoder, input);
      const decoded = await decodeViaStream(encoder, encoded);

      expect(decoded).toEqual(input);
    });

    it("round-trips V1 constructor streams without corrupting non-power-of-two chunks", async () => {
      const encoder = new Ddu64({ dduSetSymbol: DduSetSymbol.DDU_V1 });
      const input = new TextEncoder().encode("V1 stream compatibility: 안녕하세요 12345");

      expect(encoder.getCharSetInfo().usePowerOfTwo).toBe(false);

      const encoded = await encodeViaStream(encoder, input);
      const decoded = await decodeViaStream(encoder, encoded);

      expect(decoded).toEqual(input);
    });

    it("round-trips empty data correctly", async () => {
      const encoder = createEncoder();
      const input = new Uint8Array(0);

      const encoded = await encodeViaStream(encoder, input);
      const decoded = await decodeViaStream(encoder, encoded);

      expect(decoded).toEqual(input);
    });

    it("round-trips single byte correctly", async () => {
      const encoder = createEncoder();
      const input = new Uint8Array([42]);

      const encoded = await encodeViaStream(encoder, input);
      const decoded = await decodeViaStream(encoder, encoded);

      expect(decoded).toEqual(input);
    });

    it("round-trips binary data correctly", async () => {
      const encoder = createEncoder();
      const input = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        input[i] = i;
      }

      const encoded = await encodeViaStream(encoder, input);
      const decoded = await decodeViaStream(encoder, encoded);

      expect(decoded).toEqual(input);
    });

    it("round-trips larger data correctly", async () => {
      const encoder = createEncoder();
      const input = new Uint8Array(10240);
      for (let i = 0; i < input.length; i++) {
        input[i] = (i * 7 + 13) % 256;
      }

      const encoded = await encodeViaStream(encoder, input);
      const decoded = await decodeViaStream(encoder, encoded);

      expect(decoded).toEqual(input);
    });

    it("round-trips with compression (deflate)", async () => {
      const encoder = createEncoder();
      const text = "Hello World! ".repeat(100);
      const input = new TextEncoder().encode(text);

      const encoded = await encodeViaStream(encoder, input, { compress: true });
      const decoded = await decodeViaStream(encoder, encoded);

      expect(decoded).toEqual(input);
    });

    it("round-trips with compression (brotli)", async () => {
      const encoder = createEncoder();
      const text = "Brotli compression test data. ".repeat(50);
      const input = new TextEncoder().encode(text);

      const encoded = await encodeViaStream(encoder, input, {
        compress: true,
        compressionAlgorithm: "brotli",
      });
      const decoded = await decodeViaStream(encoder, encoded);

      expect(decoded).toEqual(input);
    });

    it("round-trips with encryption", async () => {
      const encoder = createEncoder({ encryptionKey: "my-secret-key-123" });
      const input = new TextEncoder().encode("This is a secret message!");

      const encoded = await encodeViaStream(encoder, input, { encrypt: true });
      const decoded = await decodeViaStream(encoder, encoded);

      expect(decoded).toEqual(input);
    });

    it("round-trips with both compression and encryption", async () => {
      const encoder = createEncoder({ encryptionKey: "combined-key" });
      const text = "Compressed and encrypted data. ".repeat(20);
      const input = new TextEncoder().encode(text);

      const encoded = await encodeViaStream(encoder, input, {
        compress: true,
        encrypt: true,
      });
      const decoded = await decodeViaStream(encoder, encoded);

      expect(decoded).toEqual(input);
    });

    it("round-trips and verifies checksum when checksum is enabled", async () => {
      const encoder = createEncoder();
      const input = new TextEncoder().encode("Checksum protected stream payload");

      const encoded = await encodeViaStream(encoder, input, { checksum: true });
      expect(encoded).toMatch(/CHK[0-9a-f]{8}$/i);

      const decoded = await decodeViaStream(encoder, encoded, { checksum: true });
      expect(decoded).toEqual(input);

      const corruptedChecksum = encoded.replace(/.$/, (last) => (last === "0" ? "1" : "0"));
      await expect(decodeViaStream(encoder, corruptedChecksum, { checksum: true })).rejects.toThrow(
        Ddu64ChecksumError,
      );
      try {
        await decodeViaStream(encoder, corruptedChecksum, { checksum: true });
      } catch (err) {
        expect(isDdu64Error(err)).toBe(true);
        expect((err as Ddu64ChecksumError).code).toBe(Ddu64ErrorCode.ChecksumMismatch);
      }
    });

    it("round-trips with brotli compression and encryption", async () => {
      const encoder = createEncoder({ encryptionKey: "brotli-enc-key" });
      const text = "Brotli + encryption test. ".repeat(30);
      const input = new TextEncoder().encode(text);

      const encoded = await encodeViaStream(encoder, input, {
        compress: true,
        compressionAlgorithm: "brotli",
        encrypt: true,
      });
      const decoded = await decodeViaStream(encoder, encoded);

      expect(decoded).toEqual(input);
    });
  });

  describe("Error signaling", () => {
    it("signals error on corrupted encoded data", async () => {
      const encoder = createEncoder();
      const info = encoder.getCharSetInfo();

      const headerLength = getStreamHeaderLength(info.paddingChar);
      const validEncoded = await encodeViaStream(encoder, new TextEncoder().encode("test"));
      const header = validEncoded.slice(0, headerLength);
      const corrupted = header + "!!!INVALID!!!";

      await expectDecodeError(encoder, corrupted);
    });

    it("signals error on corrupted header magic", async () => {
      const encoder = createEncoder();
      const info = encoder.getCharSetInfo();

      const corrupted = info.paddingChar + "XXXX" + "N0" + info.paddingChar;
      await expectDecodeError(encoder, corrupted);
    });

    it("signals error when decryption fails (wrong key)", async () => {
      const encEncoder = createEncoder({ encryptionKey: "key-one" });
      const input = new TextEncoder().encode("Secret data");
      const encoded = await encodeViaStream(encEncoder, input, { encrypt: true });

      const decEncoder = createEncoder({ encryptionKey: "key-two" });
      await expect(decodeViaStream(decEncoder, encoded)).rejects.toThrow(Ddu64DecryptionError);
      try {
        await decodeViaStream(decEncoder, encoded);
      } catch (err) {
        expect(isDdu64Error(err)).toBe(true);
        expect((err as Ddu64DecryptionError).code).toBe(Ddu64ErrorCode.DecryptionFailed);
      }
    });
  });
});
