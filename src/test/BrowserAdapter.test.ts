/**
 * Unit tests for BrowserAdapter.
 *
 * These tests run in Node.js 18+ which provides:
 * - crypto.subtle (Web Crypto API)
 * - CompressionStream / DecompressionStream
 * - crypto.getRandomValues
 *
 * So we can test the BrowserAdapter's Web API implementations directly.
 */

import { describe, it, expect } from "vitest";
import { BrowserAdapter } from "../adapters/BrowserAdapter.js";

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

describe("BrowserAdapter", () => {
  const adapter = new BrowserAdapter();

  describe("capability flags", () => {
    it("reports supportsSyncCrypto as false", () => {
      expect(adapter.supportsSyncCrypto).toBe(false);
    });

    it("reports supportsSyncCompression as false", () => {
      expect(adapter.supportsSyncCompression).toBe(false);
    });

    it("reports supportsBrotli from CompressionStream feature detection", () => {
      expect(adapter.supportsBrotli).toBe(supportsCompressionFormat("brotli"));
    });

    it('reports runtime as "browser"', () => {
      expect(adapter.runtime).toBe("browser");
    });

    it("can be tagged with a Web API runtime id", () => {
      expect(new BrowserAdapter("edge").runtime).toBe("edge");
      expect(new BrowserAdapter("deno").runtime).toBe("deno");
      expect(new BrowserAdapter("bun").runtime).toBe("bun");
    });
  });

  describe("sync methods are undefined", () => {
    it("deriveKeySync is undefined", () => {
      expect(adapter.deriveKeySync).toBeUndefined();
    });

    it("encryptSync is undefined", () => {
      expect(adapter.encryptSync).toBeUndefined();
    });

    it("decryptSync is undefined", () => {
      expect(adapter.decryptSync).toBeUndefined();
    });

    it("deflateSync is undefined", () => {
      expect(adapter.deflateSync).toBeUndefined();
    });

    it("inflateSync is undefined", () => {
      expect(adapter.inflateSync).toBeUndefined();
    });

    it("brotliCompress is async when present", () => {
      expect(adapter.brotliCompress).toBeTypeOf("function");
    });

    it("brotliCompressSync is undefined", () => {
      expect(adapter.brotliCompressSync).toBeUndefined();
    });

    it("brotliDecompress is async when present", () => {
      expect(adapter.brotliDecompress).toBeTypeOf("function");
    });

    it("brotliDecompressSync is undefined", () => {
      expect(adapter.brotliDecompressSync).toBeUndefined();
    });
  });

  describe("deriveKey", () => {
    it("produces a 32-byte Uint8Array", async () => {
      const result = await adapter.deriveKey("test-key");
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(32);
    });

    it("produces consistent output for the same key", async () => {
      const result1 = await adapter.deriveKey("my-secret-key");
      const result2 = await adapter.deriveKey("my-secret-key");
      expect(result1).toEqual(result2);
    });

    it("produces different output for different keys", async () => {
      const result1 = await adapter.deriveKey("key-a");
      const result2 = await adapter.deriveKey("key-b");
      expect(result1).not.toEqual(result2);
    });

    it("produces known SHA-256 hash for empty string (explicit sha256)", async () => {
      // SHA-256 of empty string is well-known. 5.0 기본은 pbkdf2이므로 sha256을 명시.
      const result = await adapter.deriveKey("", { algorithm: "sha256" });
      // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
      const expected = new Uint8Array([
        0xe3, 0xb0, 0xc4, 0x42, 0x98, 0xfc, 0x1c, 0x14, 0x9a, 0xfb, 0xf4, 0xc8, 0x99, 0x6f, 0xb9,
        0x24, 0x27, 0xae, 0x41, 0xe4, 0x64, 0x9b, 0x93, 0x4c, 0xa4, 0x95, 0x99, 0x1b, 0x78, 0x52,
        0xb8, 0x55,
      ]);
      expect(result).toEqual(expected);
    });
  });

  describe("randomBytes", () => {
    it("produces output of the requested length", () => {
      expect(adapter.randomBytes(16).length).toBe(16);
      expect(adapter.randomBytes(32).length).toBe(32);
      expect(adapter.randomBytes(1).length).toBe(1);
      expect(adapter.randomBytes(0).length).toBe(0);
    });

    it("returns a Uint8Array", () => {
      const result = adapter.randomBytes(12);
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it("produces different output on successive calls (probabilistic)", () => {
      const a = adapter.randomBytes(32);
      const b = adapter.randomBytes(32);
      // Extremely unlikely to be equal for 32 random bytes
      expect(a).not.toEqual(b);
    });
  });

  describe("encrypt / decrypt", () => {
    it("round-trips data correctly", async () => {
      const key = await adapter.deriveKey("test-encryption-key");
      const plaintext = new TextEncoder().encode("Hello, World!");

      const encrypted = await adapter.encrypt(plaintext, key);
      const decrypted = await adapter.decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });

    it("round-trips empty data", async () => {
      const key = await adapter.deriveKey("key");
      const plaintext = new Uint8Array(0);

      const encrypted = await adapter.encrypt(plaintext, key);
      const decrypted = await adapter.decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });

    it("authenticates optional AES-GCM AAD", async () => {
      const key = await adapter.deriveKey("aad-key");
      const plaintext = new TextEncoder().encode("authenticated browser metadata");
      const aad = new TextEncoder().encode("wire:v4;compress=deflate");
      const encrypted = await adapter.encrypt(plaintext, key, aad);

      await expect(adapter.decrypt(encrypted, key, aad)).resolves.toEqual(plaintext);
      await expect(
        adapter.decrypt(encrypted, key, new TextEncoder().encode("wire:v3")),
      ).rejects.toThrow("data tampering or incorrect key");
    });

    it("round-trips large data", async () => {
      const key = await adapter.deriveKey("large-data-key");
      const plaintext = new Uint8Array(10000);
      for (let i = 0; i < plaintext.length; i++) {
        plaintext[i] = i % 256;
      }

      const encrypted = await adapter.encrypt(plaintext, key);
      const decrypted = await adapter.decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });

    it("produces encrypted payload in wire format: IV(12) + authTag(16) + ciphertext", async () => {
      const key = await adapter.deriveKey("format-test-key");
      const plaintext = new TextEncoder().encode("test data");

      const encrypted = await adapter.encrypt(plaintext, key);

      // Minimum size: 12 (IV) + 16 (authTag) + plaintext.length (ciphertext)
      expect(encrypted.length).toBe(12 + 16 + plaintext.length);
      // Total must be at least 28 bytes
      expect(encrypted.length).toBeGreaterThanOrEqual(28);
    });

    it("produces different ciphertext for same plaintext (due to random IV)", async () => {
      const key = await adapter.deriveKey("iv-test-key");
      const plaintext = new TextEncoder().encode("same input");

      const encrypted1 = await adapter.encrypt(plaintext, key);
      const encrypted2 = await adapter.encrypt(plaintext, key);

      // IVs should differ
      const iv1 = encrypted1.slice(0, 12);
      const iv2 = encrypted2.slice(0, 12);
      expect(iv1).not.toEqual(iv2);

      // Full ciphertext should differ
      expect(encrypted1).not.toEqual(encrypted2);
    });

    it("throws on payload shorter than 28 bytes during decrypt", async () => {
      const key = await adapter.deriveKey("short-payload-key");
      const shortPayload = new Uint8Array(27);

      await expect(adapter.decrypt(shortPayload, key)).rejects.toThrow("Encrypted data is invalid");
    });

    it("throws on tampered data during decrypt", async () => {
      const key = await adapter.deriveKey("tamper-test-key");
      const plaintext = new TextEncoder().encode("original data");

      const encrypted = await adapter.encrypt(plaintext, key);
      // Tamper with the ciphertext portion
      encrypted[30] ^= 0xff;

      await expect(adapter.decrypt(encrypted, key)).rejects.toThrow(
        "data tampering or incorrect key",
      );
    });

    it("throws on wrong key during decrypt", async () => {
      const key1 = await adapter.deriveKey("correct-key");
      const key2 = await adapter.deriveKey("wrong-key");
      const plaintext = new TextEncoder().encode("secret");

      const encrypted = await adapter.encrypt(plaintext, key1);

      await expect(adapter.decrypt(encrypted, key2)).rejects.toThrow(
        "data tampering or incorrect key",
      );
    });
  });

  describe("deflate / inflate", () => {
    it("round-trips data correctly", async () => {
      const original = new TextEncoder().encode("Hello, World! This is a test of compression.");

      const compressed = await adapter.deflate(original);
      const decompressed = await adapter.inflate(compressed);

      expect(decompressed).toEqual(original);
    });

    it("round-trips empty data", async () => {
      const original = new Uint8Array(0);

      const compressed = await adapter.deflate(original);
      const decompressed = await adapter.inflate(compressed);

      expect(decompressed).toEqual(original);
    });

    it("round-trips binary data", async () => {
      const original = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        original[i] = i;
      }

      const compressed = await adapter.deflate(original);
      const decompressed = await adapter.inflate(compressed);

      expect(decompressed).toEqual(original);
    });

    it("compresses repetitive data to smaller size", async () => {
      // Highly repetitive data should compress well
      const original = new Uint8Array(1000).fill(42);

      const compressed = await adapter.deflate(original);

      expect(compressed.length).toBeLessThan(original.length);
    });

    it("enforces maxBytes limit during inflate", async () => {
      // Create data that decompresses to more than the limit
      const original = new Uint8Array(1000).fill(65); // 1000 bytes of 'A'
      const compressed = await adapter.deflate(original);

      await expect(adapter.inflate(compressed, 100)).rejects.toThrow(
        "Decompressed size exceeds limit",
      );
    });

    it("allows inflate when within maxBytes limit", async () => {
      const original = new TextEncoder().encode("small data");
      const compressed = await adapter.deflate(original);

      const decompressed = await adapter.inflate(compressed, 10000);
      expect(decompressed).toEqual(original);
    });
  });

  describe("brotliCompress / brotliDecompress", () => {
    it("round-trips when runtime supports browser Brotli", async () => {
      const original = new TextEncoder().encode("Hello Brotli ".repeat(100));

      if (!adapter.supportsBrotli) {
        await expect(adapter.brotliCompress(original)).rejects.toThrow(
          "Brotli compression is unsupported",
        );
        return;
      }

      const compressed = await adapter.brotliCompress(original);
      const decompressed = await adapter.brotliDecompress(compressed);

      expect(decompressed).toEqual(original);
    });
  });
});
