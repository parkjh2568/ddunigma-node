/**
 * Unit tests for Ddu64Core - platform-independent encoder/decoder.
 */

import { describe, it, expect } from "vitest";
import { Ddu64Core } from "../core/Ddu64Core.js";
import { NodeAdapter } from "../adapters/NodeAdapter.js";
import { BrowserAdapter } from "../adapters/BrowserAdapter.js";
import { DduSetSymbol } from "../core/types.js";
import {
  Ddu64AdapterError,
  Ddu64ChecksumError,
  Ddu64CharsetError,
  Ddu64DecryptionError,
  Ddu64EncodeError,
  Ddu64ErrorCode,
  isDdu64Error,
  wrapDdu64Error,
} from "../core/errors.js";

// Helper: create encoder with NodeAdapter for sync operations
function createEncoder(
  options?: Parameters<typeof Ddu64Core.prototype.encode>[1] & Record<string, unknown>,
) {
  return new Ddu64Core(undefined, undefined, {
    adapter: new NodeAdapter(),
    ...options,
  } as any);
}

function supportsCompressionFormat(format: string): boolean {
  if (typeof CompressionStream === "undefined" || typeof DecompressionStream === "undefined") {
    return false;
  }

  try {
    new CompressionStream(format as CompressionFormat);
    new DecompressionStream(format as CompressionFormat);
    return true;
  } catch {
    return false;
  }
}

describe("Ddu64Core", () => {
  describe("Basic encode/decode round-trip", () => {
    it("should round-trip with Uint8Array input", () => {
      const encoder = createEncoder();
      const input = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const encoded = encoder.encode(input);
      const decoded = encoder.decodeToUint8Array(encoded);
      expect(decoded).toEqual(input);
    });

    it("should round-trip with string input", () => {
      const encoder = createEncoder();
      const input = "Hello, World! 안녕하세요";
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("should handle empty input", () => {
      const encoder = createEncoder();
      const encoded = encoder.encode(new Uint8Array(0));
      expect(encoded).toBe("");
      const decoded = encoder.decodeToUint8Array(encoded);
      expect(decoded).toEqual(new Uint8Array(0));
    });

    it("should handle single byte", () => {
      const encoder = createEncoder();
      const input = new Uint8Array([0x42]);
      const encoded = encoder.encode(input);
      const decoded = encoder.decodeToUint8Array(encoded);
      expect(decoded).toEqual(input);
    });

    it("should handle binary data with all byte values", () => {
      const encoder = createEncoder();
      const input = new Uint8Array(256);
      for (let i = 0; i < 256; i++) input[i] = i;
      const encoded = encoder.encode(input);
      const decoded = encoder.decodeToUint8Array(encoded);
      expect(decoded).toEqual(input);
    });
  });

  describe("decodeToUint8Array", () => {
    it("rejects unpadded payloads that do not end on a byte boundary", () => {
      const encoder = new Ddu64Core(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
        "=",
        { adapter: new NodeAdapter() },
      );

      for (const truncated of ["A", "AA", "AAA"]) {
        expect(() => encoder.decodeToUint8Array(truncated)).toThrow(Ddu64CharsetError);
        expect(() => encoder.decodeToUint8Array(truncated)).toThrow("Invalid encoded bit length");
      }
    });

    it("accepts byte-aligned no-footer payloads and repeated Base64 padding", () => {
      const encoder = new Ddu64Core(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
        "=",
        { adapter: new NodeAdapter() },
      );

      expect(Array.from(encoder.decodeToUint8Array("AAAA"))).toEqual([0, 0, 0]);
      expect(Array.from(encoder.decodeToUint8Array("AA=="))).toEqual([0]);
    });

    it("should return Uint8Array instance", () => {
      const encoder = createEncoder();
      const encoded = encoder.encode("test");
      const decoded = encoder.decodeToUint8Array(encoded);
      expect(decoded).toBeInstanceOf(Uint8Array);
    });

    it("should return correct bytes for UTF-8 string", () => {
      const encoder = createEncoder();
      const input = "ABC";
      const encoded = encoder.encode(input);
      const decoded = encoder.decodeToUint8Array(encoded);
      expect(decoded).toEqual(new Uint8Array([65, 66, 67]));
    });
  });

  describe("Constructor with adapter option", () => {
    it("should accept explicit adapter", () => {
      const adapter = new NodeAdapter();
      const encoder = new Ddu64Core(undefined, undefined, { adapter });
      const encoded = encoder.encode("test");
      expect(encoded.length).toBeGreaterThan(0);
    });

    it("should throw on sync operations without adapter", () => {
      // Create encoder without adapter (simulating browser)
      const encoder = new Ddu64Core(undefined, undefined, {
        encryptionKey: "secret",
      });
      // Sync encode with encryption should throw since no adapter
      expect(() => encoder.encode("test")).toThrow(Ddu64AdapterError);
    });
  });

  describe("Presets", () => {
    it("DDU preset produces correct round-trip", () => {
      const encoder = createEncoder({ dduSetSymbol: DduSetSymbol.DDU });
      const input = "뜌뜌뜌 테스트";
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("DDU_V1 preset produces correct round-trip", () => {
      const encoder = createEncoder({ dduSetSymbol: DduSetSymbol.DDU_V1 });
      const input = "Hello V1";
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("ONECHARSET preset produces correct round-trip", () => {
      const encoder = createEncoder({ dduSetSymbol: DduSetSymbol.ONECHARSET });
      const input = "OneCharSet test 123";
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("DDU preset uses Hangul characters", () => {
      const encoder = createEncoder({ dduSetSymbol: DduSetSymbol.DDU });
      const encoded = encoder.encode("A");
      // DDU charset uses Hangul characters
      expect(encoded.length).toBeGreaterThan(0);
      const info = encoder.getCharSetInfo();
      expect(info.charSet.length).toBe(64);
      expect(info.paddingChar).toBe("뭐");
    });
  });

  describe("Compression through adapter", () => {
    it("should compress and decompress with deflate (sync)", () => {
      const encoder = createEncoder({ compress: true });
      const input = "A".repeat(1000); // Highly compressible
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("should compress and decompress with brotli (sync)", () => {
      const encoder = createEncoder({
        compress: true,
        compressionAlgorithm: "brotli",
      });
      const input = "B".repeat(1000);
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("should skip compression when compressed is larger", () => {
      const encoder = createEncoder({ compress: true });
      const input = new Uint8Array([1, 2, 3]); // Too small to benefit from compression
      const encoded = encoder.encode(input);
      const decoded = encoder.decodeToUint8Array(encoded);
      expect(decoded).toEqual(input);
    });
  });

  describe("Encryption through adapter", () => {
    it("should encrypt and decrypt (sync)", () => {
      const encoder = createEncoder({ encryptionKey: "my-secret-key" });
      const input = "Secret message 비밀 메시지";
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("should produce different encoded output each time (random IV)", () => {
      const encoder = createEncoder({ encryptionKey: "key123" });
      const input = "Same input";
      const encoded1 = encoder.encode(input);
      const encoded2 = encoder.encode(input);
      // Due to random IV, encoded outputs should differ
      expect(encoded1).not.toBe(encoded2);
      // But both should decode to the same value
      expect(encoder.decode(encoded1)).toBe(input);
      expect(encoder.decode(encoded2)).toBe(input);
    });

    it("should throw when decoding encrypted data without key", () => {
      const encoder = createEncoder({ encryptionKey: "key" });
      const encoded = encoder.encode("secret");
      const decoderNoKey = createEncoder();
      expect(() => decoderNoKey.decode(encoded)).toThrow("encryptionKey");
    });
  });

  describe("Checksum", () => {
    it("should add and verify checksum", () => {
      const encoder = createEncoder({ checksum: true });
      const input = "Checksum test data";
      const encoded = encoder.encode(input);
      expect(encoded).toMatch(/CK[PO][0-9a-f]{8}/); // V5 marker + scope + 8 hex
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("should detect checksum mismatch", () => {
      const encoder = createEncoder({ checksum: true });
      const encoded = encoder.encode("original");
      // 마지막 hex 한 글자를 뒤집어 체크섬 불일치 유발 (마커/scope는 유지)
      const tampered = encoded.replace(/.$/, (last) => (last === "0" ? "1" : "0"));
      expect(() => encoder.decode(tampered)).toThrow(Ddu64ChecksumError);
      try {
        encoder.decode(tampered);
      } catch (err) {
        expect(isDdu64Error(err)).toBe(true);
        expect((err as Ddu64ChecksumError).code).toBe(Ddu64ErrorCode.ChecksumMismatch);
      }
    });

    it("should reject missing checksum when checksum verification is requested", () => {
      const plainEncoder = createEncoder();
      const checksumEncoder = createEncoder({ checksum: true });
      const encodedWithoutChecksum = plainEncoder.encode("no checksum marker");

      expect(() => checksumEncoder.decode(encodedWithoutChecksum)).toThrow(Ddu64ChecksumError);
    });
  });

  describe("Custom errors", () => {
    it("wraps browser sync capability failures as typed adapter errors", () => {
      const encoder = new Ddu64Core(undefined, undefined, {
        adapter: new BrowserAdapter(),
        encryptionKey: "secret",
      });

      expect(() => encoder.encode("test")).toThrow(Ddu64AdapterError);

      try {
        encoder.encode("test");
      } catch (err) {
        expect(isDdu64Error(err)).toBe(true);
        expect((err as Ddu64AdapterError).code).toBe(Ddu64ErrorCode.AdapterUnavailable);
        expect(err).toBeInstanceOf(Ddu64AdapterError);
      }
    });

    it("does not classify arbitrary sync/provider wording as an adapter error", () => {
      const err = wrapDdu64Error(
        new Error("[Ddu64 encode] Provider metadata sync marker failed"),
        "encode",
      );

      expect(err).toBeInstanceOf(Ddu64EncodeError);
      expect(err.code).toBe(Ddu64ErrorCode.EncodeFailed);
    });

    it("wraps invalid decode input as a typed charset error", () => {
      const encoder = createEncoder();

      expect(() => encoder.decodeToUint8Array("!!!")).toThrow(Ddu64CharsetError);

      try {
        encoder.decodeToUint8Array("!!!");
      } catch (err) {
        expect(isDdu64Error(err)).toBe(true);
        expect((err as Ddu64CharsetError).code).toBe(Ddu64ErrorCode.InvalidCharset);
        expect(err).toBeInstanceOf(Ddu64CharsetError);
      }
    });

    it("rejects characters whose code point exceeds the lookup table length", () => {
      // ONECHARSET is ASCII (max code 122), so its lookup table is small.
      // A high-code-point char (e.g. Hangul) must still be rejected via the
      // out-of-range guard rather than silently decoding. The 4-char length
      // keeps the payload bit-length aligned so decoding reaches char lookup.
      const encoder = createEncoder({ dduSetSymbol: DduSetSymbol.ONECHARSET });

      expect(() => encoder.decodeToUint8Array("가가가가")).toThrow(Ddu64CharsetError);
      expect(() => encoder.decodeToUint8Array("가가가가")).toThrow(/Invalid character/);
    });

    it("wraps async decryption failure as a typed decryption error", async () => {
      const encoder = createEncoder({ encryptionKey: "key-one" });
      const decoder = createEncoder({ encryptionKey: "key-two" });
      const encoded = await encoder.encodeAsync("secret");

      await expect(decoder.decodeAsync(encoded)).rejects.toThrow(Ddu64DecryptionError);

      try {
        await decoder.decodeAsync(encoded);
      } catch (err) {
        expect(isDdu64Error(err)).toBe(true);
        expect((err as Ddu64DecryptionError).code).toBe(Ddu64ErrorCode.DecryptionFailed);
        expect(err).toBeInstanceOf(Ddu64DecryptionError);
      }
    });
  });

  describe("URL-Safe", () => {
    it("silently disables URL-safe for ONECHARSET conflict when throwOnError is false", () => {
      // ONECHARSET은 "-","_"를 포함해 URL-Safe와 충돌. 5.0 기본(throwOnError:true)에선 생성자가 throw하므로
      // 레거시 "조용히 비활성화" 동작은 throwOnError:false로 명시할 때만 적용됨.
      const encoder = createEncoder({
        dduSetSymbol: DduSetSymbol.ONECHARSET,
        urlSafe: true,
        throwOnError: false,
      });
      const input = "URL safe test";
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("throws on URL-safe/charset conflict by default (5.0 throwOnError:true)", () => {
      expect(() => createEncoder({ dduSetSymbol: DduSetSymbol.ONECHARSET, urlSafe: true })).toThrow(
        /URL-Safe/i,
      );
    });
  });

  describe("Chunking", () => {
    it("should split output into chunks", () => {
      const encoder = createEncoder({ chunkSize: 10 });
      const input = "A".repeat(50);
      const encoded = encoder.encode(input);
      const lines = encoded.split("\n");
      // All lines except possibly the last should be <= 10 chars
      for (let i = 0; i < lines.length - 1; i++) {
        expect(lines[i].length).toBeLessThanOrEqual(10);
      }
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("should support custom separator", () => {
      const encoder = createEncoder({ chunkSize: 8, chunkSeparator: "|" });
      const input = "chunk test";
      const encoded = encoder.encode(input);
      expect(encoded).toContain("|");
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("should reject chunk separators that can appear in encoded output", () => {
      const encoder = createEncoder({
        dduSetSymbol: DduSetSymbol.ONECHARSET,
        chunkSize: 4,
        chunkSeparator: "b",
      });

      expect(() => encoder.encode("hello world")).toThrow("Unsafe chunkSeparator");
    });
  });

  describe("Canonical padding", () => {
    it("should reject non-zero padding bits in the final symbol", () => {
      const encoder = createEncoder({ dduSetSymbol: DduSetSymbol.ONECHARSET });
      const encoded = encoder.encode(new Uint8Array([0x41]));
      const info = encoder.getCharSetInfo();
      const footerStart = encoded.lastIndexOf(info.paddingChar);
      const payload = encoded.slice(0, footerStart);
      const footer = encoded.slice(footerStart);
      const lastValue = info.charSet.indexOf(payload[payload.length - 1]);
      const tampered = payload.slice(0, -1) + info.charSet[lastValue + 1] + footer;

      expect(() => encoder.decodeToUint8Array(tampered)).toThrow("padding bits");
    });
  });

  describe("Async methods", () => {
    it("encodeAsync should produce same result as encode for plain data", async () => {
      const encoder = createEncoder();
      const input = "Async test 비동기 테스트";
      const syncResult = encoder.encode(input);
      const asyncResult = await encoder.encodeAsync(input);
      expect(asyncResult).toBe(syncResult);
    });

    it("decodeAsync should produce same result as decode", async () => {
      const encoder = createEncoder();
      const input = "Async decode test";
      const encoded = encoder.encode(input);
      const asyncDecoded = await encoder.decodeAsync(encoded);
      expect(asyncDecoded).toBe(input);
    });

    it("encodeAsync/decodeAsync round-trip with compression", async () => {
      const encoder = createEncoder({ compress: true });
      const input = "X".repeat(500);
      const encoded = await encoder.encodeAsync(input);
      const decoded = await encoder.decodeAsync(encoded);
      expect(decoded).toBe(input);
    });

    it("encodeAsync/decodeAsync round-trip with encryption", async () => {
      const encoder = createEncoder({ encryptionKey: "async-key" });
      const input = "Encrypted async data";
      const encoded = await encoder.encodeAsync(input);
      const decoded = await encoder.decodeAsync(encoded);
      expect(decoded).toBe(input);
    });

    it("decodeToUint8ArrayAsync returns Uint8Array", async () => {
      const encoder = createEncoder();
      const input = new Uint8Array([1, 2, 3, 4, 5]);
      const encoded = encoder.encode(input);
      const decoded = await encoder.decodeToUint8ArrayAsync(encoded);
      expect(decoded).toBeInstanceOf(Uint8Array);
      expect(decoded).toEqual(input);
    });
  });

  describe("getCharSetInfo", () => {
    it("returns correct info for default DDU charset", () => {
      const encoder = createEncoder();
      const info = encoder.getCharSetInfo();
      expect(info.charSet.length).toBe(64);
      expect(info.paddingChar).toBe("뭐");
      expect(info.bitLength).toBe(6);
      expect(info.usePowerOfTwo).toBe(true);
      expect(info.encoding).toBe("utf-8");
      expect(info.defaultCompress).toBe(false);
      expect(info.urlSafe).toBe(false);
      expect(info.hasEncryptionKey).toBe(false);
      // 5.0 신규 introspection 필드
      expect(info.defaultChecksumScope).toBe("output");
      expect(info.defaultObfuscate).toBe(false);
      expect(info.wasmThreshold).toBe(16384);
    });

    it("returns correct info for ONECHARSET", () => {
      const encoder = createEncoder({ dduSetSymbol: DduSetSymbol.ONECHARSET });
      const info = encoder.getCharSetInfo();
      expect(info.charSet.length).toBe(64);
      expect(info.paddingChar).toBe("=");
      expect(info.bitLength).toBe(6);
      expect(info.usePowerOfTwo).toBe(true);
    });

    it("reflects encryption key presence", () => {
      const encoder = createEncoder({ encryptionKey: "key" });
      const info = encoder.getCharSetInfo();
      expect(info.hasEncryptionKey).toBe(true);
    });
  });

  describe("getStats", () => {
    it("returns correct stats for plain encoding", () => {
      const encoder = createEncoder();
      const input = "Hello, World!";
      const stats = encoder.getStats(input);
      expect(stats.originalSize).toBe(13); // "Hello, World!" is 13 bytes in UTF-8
      expect(stats.encodedSize).toBeGreaterThan(0);
      expect(stats.charsetSize).toBe(64);
      expect(stats.bitLength).toBe(6);
      expect(stats.expansionRatio).toBeGreaterThan(0);
      expect(stats.compressedSize).toBeUndefined();
      expect(stats.compressionRatio).toBeUndefined();
    });

    it("returns compression stats when compress is enabled", () => {
      const encoder = createEncoder({ compress: true });
      const input = "A".repeat(1000);
      const stats = encoder.getStats(input);
      expect(stats.compressedSize).toBeDefined();
      expect(stats.compressionRatio).toBeDefined();
      expect(stats.compressionRatio!).toBeLessThan(1); // Should compress well
    });

    it("omits compression stats when compression is attempted but not applied", () => {
      const encoder = createEncoder({ compress: true });
      const input = new Uint8Array(64);
      for (let i = 0; i < input.length; i++) input[i] = (i * 31 + 17) & 0xff;

      const stats = encoder.getStats(input);
      expect(stats.compressedSize).toBeUndefined();
      expect(stats.compressionRatio).toBeUndefined();
    });

    it("returns stats for Uint8Array input", () => {
      const encoder = createEncoder();
      const input = new Uint8Array([1, 2, 3, 4, 5]);
      const stats = encoder.getStats(input);
      expect(stats.originalSize).toBe(5);
      expect(stats.encodedSize).toBeGreaterThan(0);
    });

    it("getStatsAsync matches getStats with a sync-capable adapter", async () => {
      const encoder = createEncoder({ compress: true, encryptionKey: "stats-async-key" });
      const input = "A".repeat(1000);

      await expect(encoder.getStatsAsync(input)).resolves.toEqual(encoder.getStats(input));
    });

    it("getStatsAsync supports async-only compression adapters", async () => {
      if (!supportsCompressionFormat("deflate-raw")) return;

      const encoder = new Ddu64Core(undefined, undefined, {
        adapter: new BrowserAdapter(),
        compress: true,
      });
      const input = "A".repeat(1000);

      expect(() => encoder.getStats(input)).toThrow();
      const stats = await encoder.getStatsAsync(input);
      expect(stats.originalSize).toBe(1000);
      expect(stats.compressedSize).toBeDefined();
      expect(stats.compressionRatio).toBeDefined();
      expect(stats.encodedSize).toBeGreaterThan(0);
    });
  });

  describe("Combined features", () => {
    it("compression + encryption round-trip", () => {
      const encoder = createEncoder({
        compress: true,
        encryptionKey: "combined-key",
      });
      const input = "Combined features test ".repeat(20);
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("compresses before encryption so compression still helps", () => {
      const input = "A".repeat(1000);
      const encryptedOnly = createEncoder({ encryptionKey: "combined-key" });
      const compressedEncrypted = createEncoder({
        compress: true,
        encryptionKey: "combined-key",
      });

      const encryptedStats = encryptedOnly.getStats(input);
      const compressedStats = compressedEncrypted.getStats(input);

      expect(compressedStats.compressedSize).toBeDefined();
      expect(compressedStats.compressedSize!).toBeLessThan(1000);
      expect(compressedStats.encodedSize).toBeLessThan(encryptedStats.encodedSize);
    });

    it("compression + encryption + checksum round-trip", () => {
      const encoder = createEncoder({
        compress: true,
        encryptionKey: "full-key",
        checksum: true,
      });
      const input = "Full pipeline test data 전체 파이프라인";
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("async compression + encryption + checksum round-trip", async () => {
      const encoder = createEncoder({
        compress: true,
        encryptionKey: "async-full",
        checksum: true,
      });
      const input = "Async full pipeline 비동기 전체";
      const encoded = await encoder.encodeAsync(input);
      const decoded = await encoder.decodeAsync(encoded);
      expect(decoded).toBe(input);
    });
  });

  describe("Obfuscation integration", () => {
    it("obfuscation + encryption round-trip (sync)", () => {
      const encoder = createEncoder({
        encryptionKey: "obfuscation-key",
        obfuscate: true,
      });
      const input = "Secret message 비밀 메시지";
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("obfuscation + encryption round-trip (async)", async () => {
      const encoder = createEncoder({
        encryptionKey: "async-obfuscation-key",
        obfuscate: true,
      });
      const input = "Async secret 비동기 비밀";
      const encoded = await encoder.encodeAsync(input);
      const decoded = await encoder.decodeAsync(encoded);
      expect(decoded).toBe(input);
    });

    it("should throw when obfuscation enabled without encryption key (constructor)", () => {
      expect(() => createEncoder({ obfuscate: true })).toThrow(
        "[Ddu64 obfuscation] Obfuscation requires encryption to be enabled.",
      );
    });

    it("should throw when per-call obfuscate: true without encryption key", () => {
      const encoder = createEncoder(); // no encryption key
      expect(() => encoder.encode("test", { obfuscate: true })).toThrow(
        "[Ddu64 obfuscation] Obfuscation requires encryption to be enabled.",
      );
    });

    it("should throw when obfuscation is requested with per-call encrypt: false", async () => {
      const encoder = createEncoder({ encryptionKey: "obfuscation-contract-key" });
      const options = { encrypt: false, obfuscate: true };

      expect(() => encoder.encode("test", options)).toThrow(
        "[Ddu64 obfuscation] Obfuscation requires encryption to be enabled.",
      );
      await expect(encoder.encodeAsync("test", options)).rejects.toThrow(
        "[Ddu64 obfuscation] Obfuscation requires encryption to be enabled.",
      );
      expect(() => encoder.getStats("test", options)).toThrow(
        "[Ddu64 obfuscation] Obfuscation requires encryption to be enabled.",
      );
      await expect(encoder.getStatsAsync("test", options)).rejects.toThrow(
        "[Ddu64 obfuscation] Obfuscation requires encryption to be enabled.",
      );
    });

    it("should throw when default obfuscation is active and per-call encrypt is disabled", () => {
      const encoder = createEncoder({
        encryptionKey: "default-obfuscation-contract-key",
        obfuscate: true,
      });

      expect(() => encoder.encode("test", { encrypt: false })).toThrow(
        "[Ddu64 obfuscation] Obfuscation requires encryption to be enabled.",
      );
    });

    it("per-call obfuscate option overrides constructor default (enable)", () => {
      const encoder = createEncoder({
        encryptionKey: "per-call-key",
        obfuscate: false, // constructor default: off
      });
      const input = "Per-call enable test";
      // Encode with per-call obfuscate: true
      const encoded = encoder.encode(input, { obfuscate: true });
      // Decode with per-call obfuscate: true
      const decoded = encoder.decode(encoded, { obfuscate: true });
      expect(decoded).toBe(input);
    });

    it("per-call obfuscate option overrides constructor default (disable)", () => {
      const encoder = createEncoder({
        encryptionKey: "per-call-key-2",
        obfuscate: true, // constructor default: on
      });
      const input = "Per-call disable test";
      // Encode with per-call obfuscate: false
      const encoded = encoder.encode(input, { obfuscate: false });
      // Decode with per-call obfuscate: false
      const decoded = encoder.decode(encoded, { obfuscate: false });
      expect(decoded).toBe(input);
    });

    it("obfuscated output contains only Hangul syllables (U+AC00–U+D7A3)", () => {
      const encoder = createEncoder({
        encryptionKey: "hangul-check-key",
        obfuscate: true,
      });
      const input = "Check Hangul output 한글 확인";
      const encoded = encoder.encode(input);
      // The encoded output should consist entirely of Hangul syllables
      // (the checksum/footer markers are part of the pre-obfuscation string,
      // so the obfuscated output is all Hangul)
      for (const char of encoded) {
        const code = char.charCodeAt(0);
        expect(code).toBeGreaterThanOrEqual(0xac00);
        expect(code).toBeLessThanOrEqual(0xd7a3);
      }
    });

    it("deobfuscation recovers original encoded string", () => {
      // Encode without obfuscation, then manually obfuscate/deobfuscate
      const encoder = createEncoder({
        encryptionKey: "deobfuscate-test-key",
        obfuscate: false,
      });
      const input = "Deobfuscation test";
      const encodedPlain = encoder.encode(input);

      // Now encode with obfuscation
      const encoderObf = createEncoder({
        encryptionKey: "deobfuscate-test-key",
        obfuscate: true,
      });
      const encodedObf = encoderObf.encode(input);

      // The obfuscated output should be different from plain
      expect(encodedObf).not.toBe(encodedPlain);

      // But decoding should recover the same original input
      const decoded = encoderObf.decode(encodedObf);
      expect(decoded).toBe(input);
    });

    it("obfuscation + compression + encryption round-trip", () => {
      const encoder = createEncoder({
        encryptionKey: "full-obf-key",
        obfuscate: true,
        compress: true,
      });
      const input = "Full pipeline with obfuscation ".repeat(10);
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });
  });

  describe("Security and progress options", () => {
    it("supports PBKDF2 key derivation with stable salt", () => {
      const options = {
        encryptionKey: "pbkdf2-password",
        keyDerivation: {
          algorithm: "pbkdf2" as const,
          salt: "project-specific-salt",
          iterations: 10_000,
        },
      };
      const encoder = createEncoder(options);
      const decoder = createEncoder(options);
      const encoded = encoder.encode("PBKDF2 message");

      expect(decoder.decode(encoded)).toBe("PBKDF2 message");
    });

    it("fails PBKDF2 decode with a different salt", () => {
      const encoder = createEncoder({
        encryptionKey: "pbkdf2-password",
        keyDerivation: {
          algorithm: "pbkdf2" as const,
          salt: "salt-a",
          iterations: 10_000,
        },
      });
      const decoder = createEncoder({
        encryptionKey: "pbkdf2-password",
        keyDerivation: {
          algorithm: "pbkdf2" as const,
          salt: "salt-b",
          iterations: 10_000,
        },
      });
      const encoded = encoder.encode("PBKDF2 message");

      expect(() => decoder.decode(encoded)).toThrow();
    });

    it("calls progress callbacks for encode and decode", () => {
      const encoderStages: Array<string | undefined> = [];
      const decoderStages: Array<string | undefined> = [];
      const encoded = createEncoder({ compress: true }).encode("progress ".repeat(20), {
        onProgress: (info) => encoderStages.push(info.stage),
        compress: true,
      });

      createEncoder({ compress: true }).decode(encoded, {
        onProgress: (info) => decoderStages.push(info.stage),
      });

      expect(encoderStages).toContain("start");
      expect(encoderStages).toContain("done");
      expect(decoderStages).toContain("decode");
      expect(decoderStages).toContain("done");
    });
  });
});
