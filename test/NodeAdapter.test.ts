import { describe, it, expect } from "vitest";
import { NodeAdapter } from "../src/adapters/NodeAdapter.js";

function expectOwnedBytes(value: Uint8Array): void {
  expect(value.byteOffset).toBe(0);
  expect(value.buffer.byteLength).toBe(value.byteLength);
}

describe("NodeAdapter", () => {
  const adapter = new NodeAdapter();

  it.each(["buffer", "byteOffset", "byteLength"])(
    "uses actual subview bytes when %s metadata is shadowed",
    async (field) => {
      for (const backing of [
        new Uint8Array(256),
        Buffer.alloc(256),
        new Uint8Array(new SharedArrayBuffer(256)),
        Buffer.from(new SharedArrayBuffer(256)),
      ]) {
        backing.fill(65, 32, 160);
        const input = backing.subarray(32, 160);
        const expected = new Uint8Array(input);
        Object.defineProperty(input, field, {
          get() {
            throw new Error(`shadowed ${field} must not be read`);
          },
        });

        for (const algorithm of ["deflate", "brotli"] as const) {
          const syncCompressed =
            algorithm === "deflate"
              ? adapter.deflateSync(input)
              : adapter.brotliCompressSync(input);
          expect(
            algorithm === "deflate"
              ? adapter.inflateSync(syncCompressed)
              : adapter.brotliDecompressSync(syncCompressed),
          ).toEqual(expected);
          const compressed =
            algorithm === "deflate"
              ? await adapter.deflate(input)
              : await adapter.brotliCompress(input);
          const compressedBacking =
            backing instanceof Buffer
              ? Buffer.alloc(compressed.length + 32)
              : new Uint8Array(compressed.length + 32);
          compressedBacking.set(compressed, 16);
          const compressedInput = compressedBacking.subarray(16, 16 + compressed.length);
          Object.defineProperty(compressedInput, field, {
            get() {
              throw new Error(`shadowed compressed ${field} must not be read`);
            },
          });
          expect(
            algorithm === "deflate"
              ? adapter.inflateSync(compressedInput)
              : adapter.brotliDecompressSync(compressedInput),
          ).toEqual(expected);
          expect(
            algorithm === "deflate"
              ? await adapter.inflate(compressedInput)
              : await adapter.brotliDecompress(compressedInput),
          ).toEqual(expected);
        }
      }
    },
  );

  describe("capability flags", () => {
    it("reports correct runtime", () => {
      expect(adapter.runtime).toBe("node");
    });
  });

  describe("key derivation", () => {
    it("preserves the default PBKDF2 parameters", () => {
      // PBKDF2-SHA256 / 210,000 iterations / ddunigma:pbkdf2:v1 / 32 bytes.
      expect(Buffer.from(adapter.deriveKeySync("default-kdf-contract")).toString("hex")).toBe(
        "0c879ccbefb2cfc90525d58c44f82765c710ade6d7b9dc00cc600f22467af251",
      );
    });

    it("produces consistent 32-byte output", () => {
      const key1 = adapter.deriveKeySync("test-key");
      const key2 = adapter.deriveKeySync("test-key");
      expect(key1).toEqual(key2);
      expect(key1.length).toBe(32);
      expect(key1).toBeInstanceOf(Uint8Array);
    });

    it("async produces same result as sync", async () => {
      const syncResult = adapter.deriveKeySync("hello-world");
      const asyncResult = await adapter.deriveKey("hello-world");
      expect(asyncResult).toEqual(syncResult);
    });

    it("different keys produce different hashes", () => {
      const key1 = adapter.deriveKeySync("key-a");
      const key2 = adapter.deriveKeySync("key-b");
      expect(key1).not.toEqual(key2);
    });
  });

  describe("encrypt/decrypt", () => {
    const keyHash = adapter.deriveKeySync("encryption-key");

    it.each([0, 1, 15, 16, 17, 8192, 1024 * 1024])(
      "owns AES output and authenticates %i input bytes",
      async (length) => {
        const input = new Uint8Array(length).fill(42);
        const aad = new Uint8Array([1, 2, 3]);
        const encrypted = adapter.encryptSync(input, keyHash, aad);
        expectOwnedBytes(encrypted);
        const decoded = await adapter.decrypt(encrypted, keyHash, aad);
        expectOwnedBytes(decoded);
        expect(Buffer.compare(decoded, input)).toBe(0);
        encrypted[12] ^= 1;
        expect(() => adapter.decryptSync(encrypted, keyHash, aad)).toThrow();
        await expect(adapter.decrypt(encrypted, keyHash, aad)).rejects.toThrow();
        expect(Buffer.compare(decoded, input)).toBe(0);
      },
    );

    it("round-trip works for sync", () => {
      const plaintext = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const encrypted = adapter.encryptSync(plaintext, keyHash);
      const decrypted = adapter.decryptSync(encrypted, keyHash);
      expect(decrypted).toEqual(plaintext);
    });

    it("round-trip works for async", async () => {
      const plaintext = new Uint8Array([10, 20, 30, 40, 50]);
      const encrypted = await adapter.encrypt(plaintext, keyHash);
      const decrypted = await adapter.decrypt(encrypted, keyHash);
      expect(decrypted).toEqual(plaintext);
    });

    it("authenticates optional AES-GCM AAD", () => {
      const plaintext = new TextEncoder().encode("authenticated metadata");
      const aad = new TextEncoder().encode("wire:v4;compress=deflate");
      const encrypted = adapter.encryptSync(plaintext, keyHash, aad);

      expect(adapter.decryptSync(encrypted, keyHash, aad)).toEqual(plaintext);
      expect(() =>
        adapter.decryptSync(encrypted, keyHash, new TextEncoder().encode("wire:v3")),
      ).toThrow();
    });

    it("encrypted payload format is IV(12) + authTag(16) + ciphertext", () => {
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);
      const encrypted = adapter.encryptSync(plaintext, keyHash);
      // Minimum size: 12 (IV) + 16 (authTag) + plaintext.length (ciphertext)
      expect(encrypted.length).toBe(12 + 16 + plaintext.length);
      // Total must be >= 28
      expect(encrypted.length).toBeGreaterThanOrEqual(28);
    });

    it("each encryption produces different ciphertext (random IV)", () => {
      const plaintext = new Uint8Array([1, 2, 3]);
      const enc1 = adapter.encryptSync(plaintext, keyHash);
      const enc2 = adapter.encryptSync(plaintext, keyHash);
      // IVs should differ
      expect(enc1.subarray(0, 12)).not.toEqual(enc2.subarray(0, 12));
    });

    it("throws on too-short encrypted data", () => {
      const shortData = new Uint8Array(27);
      expect(() => adapter.decryptSync(shortData, keyHash)).toThrow("too short");
    });

    it("throws on tampered data", () => {
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);
      const encrypted = adapter.encryptSync(plaintext, keyHash);
      // Tamper with ciphertext
      encrypted[30] ^= 0xff;
      expect(() => adapter.decryptSync(encrypted, keyHash)).toThrow();
    });

    it("works with empty plaintext", () => {
      const plaintext = new Uint8Array(0);
      const encrypted = adapter.encryptSync(plaintext, keyHash);
      expect(encrypted.length).toBe(28); // IV + authTag + 0 bytes ciphertext
      const decrypted = adapter.decryptSync(encrypted, keyHash);
      expect(decrypted).toEqual(plaintext);
    });

    it("sync and async produce identical decrypted results", async () => {
      const plaintext = new Uint8Array([100, 200, 50, 75]);
      const encrypted = adapter.encryptSync(plaintext, keyHash);
      const syncDecrypted = adapter.decryptSync(encrypted, keyHash);
      const asyncDecrypted = await adapter.decrypt(encrypted, keyHash);
      expect(syncDecrypted).toEqual(asyncDecrypted);
    });

    it("returns decrypted bytes in an exact-size owned buffer", () => {
      const plaintext = new TextEncoder().encode("owned secret");
      const encrypted = adapter.encryptSync(plaintext, keyHash);

      expectOwnedBytes(adapter.decryptSync(encrypted, keyHash));
    });
  });

  describe("randomBytes", () => {
    it("returns Uint8Array of requested length", () => {
      const bytes = adapter.randomBytes(32);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(32);
    });

    it("produces different values on each call", () => {
      const a = adapter.randomBytes(16);
      const b = adapter.randomBytes(16);
      expect(a).not.toEqual(b);
    });

    it("returns random bytes in an exact-size owned buffer", () => {
      expectOwnedBytes(adapter.randomBytes(16));
    });
  });

  describe("deflate/inflate", () => {
    it("sync round-trip works", () => {
      const data = new TextEncoder().encode("Hello, World! This is a test of deflate compression.");
      const compressed = adapter.deflateSync(data);
      const decompressed = adapter.inflateSync(compressed);
      expect(decompressed).toEqual(data);
    });

    it("async round-trip works", async () => {
      const data = new TextEncoder().encode("Async deflate/inflate round-trip test data.");
      const compressed = await adapter.deflate(data);
      const decompressed = await adapter.inflate(compressed);
      expect(decompressed).toEqual(data);
    });

    it("sync and async produce identical results", async () => {
      const data = new TextEncoder().encode("Consistency check between sync and async.");
      const syncCompressed = adapter.deflateSync(data);
      const asyncCompressed = await adapter.deflate(data);
      // Compressed output should be identical for same input and default level
      expect(syncCompressed).toEqual(asyncCompressed);
    });

    it("respects compression level", () => {
      const data = new Uint8Array(1000).fill(65); // repetitive data
      const noCompression = adapter.deflateSync(data, 0);
      const maxCompression = adapter.deflateSync(data, 9);
      // Max compression should produce smaller output for repetitive data
      expect(maxCompression.length).toBeLessThan(noCompression.length);
    });

    it("inflate enforces size limit (sync)", () => {
      const data = new Uint8Array(10000).fill(0); // highly compressible
      const compressed = adapter.deflateSync(data);
      expect(() => adapter.inflateSync(compressed, 100)).toThrow("exceeds limit");
    });

    it("inflate enforces size limit (async)", async () => {
      const data = new Uint8Array(10000).fill(0);
      const compressed = await adapter.deflate(data);
      await expect(adapter.inflate(compressed, 100)).rejects.toThrow("exceeds limit");
    });

    it("works with empty input", () => {
      const data = new Uint8Array(0);
      const compressed = adapter.deflateSync(data);
      const decompressed = adapter.inflateSync(compressed);
      expect(decompressed).toEqual(data);
    });

    it("returns compressed and decompressed bytes in exact-size owned buffers", () => {
      const data = new TextEncoder().encode("owned deflate output");
      const compressed = adapter.deflateSync(data);
      const decompressed = adapter.inflateSync(compressed);

      expectOwnedBytes(compressed);
      expectOwnedBytes(decompressed);
    });
  });

  describe("brotli compress/decompress", () => {
    it("sync round-trip works", () => {
      const data = new TextEncoder().encode("Hello, Brotli! Testing compression round-trip.");
      const compressed = adapter.brotliCompressSync(data);
      const decompressed = adapter.brotliDecompressSync(compressed);
      expect(decompressed).toEqual(data);
    });

    it("async round-trip works", async () => {
      const data = new TextEncoder().encode("Async brotli round-trip test.");
      const compressed = await adapter.brotliCompress(data);
      const decompressed = await adapter.brotliDecompress(compressed);
      expect(decompressed).toEqual(data);
    });

    it("sync and async produce identical results", async () => {
      const data = new TextEncoder().encode("Brotli sync/async consistency.");
      const syncCompressed = adapter.brotliCompressSync(data);
      const asyncCompressed = await adapter.brotliCompress(data);
      expect(syncCompressed).toEqual(asyncCompressed);
    });

    it("respects compression level", () => {
      const data = new Uint8Array(1000).fill(66); // repetitive data
      const lowLevel = adapter.brotliCompressSync(data, 1);
      const highLevel = adapter.brotliCompressSync(data, 11);
      // Higher level should produce smaller or equal output
      expect(highLevel.length).toBeLessThanOrEqual(lowLevel.length);
    });

    it("brotliDecompress enforces size limit (sync)", () => {
      const data = new Uint8Array(10000).fill(0);
      const compressed = adapter.brotliCompressSync(data);
      expect(() => adapter.brotliDecompressSync(compressed, 100)).toThrow("exceeds limit");
    });

    it("brotliDecompress enforces size limit (async)", async () => {
      const data = new Uint8Array(10000).fill(0);
      const compressed = await adapter.brotliCompress(data);
      await expect(adapter.brotliDecompress(compressed, 100)).rejects.toThrow("exceeds limit");
    });

    it("works with empty input", () => {
      const data = new Uint8Array(0);
      const compressed = adapter.brotliCompressSync(data);
      const decompressed = adapter.brotliDecompressSync(compressed);
      expect(decompressed).toEqual(data);
    });

    it("returns Brotli bytes in exact-size owned buffers", () => {
      const data = new TextEncoder().encode("owned brotli output");
      const compressed = adapter.brotliCompressSync(data);
      const decompressed = adapter.brotliDecompressSync(compressed);

      expectOwnedBytes(compressed);
      expectOwnedBytes(decompressed);
    });
  });
});
