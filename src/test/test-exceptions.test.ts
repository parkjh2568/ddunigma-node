import { describe, it, expect } from "vitest";
import { Ddu64 } from "../encoders/Ddu64";
import { DduPipeline, createEncodeStream, createDecodeStream } from "../utils";
import { inflateWithLimit } from "../utils/crypto";
import { deflateSync } from "zlib";
import { Readable } from "stream";

describe("Negative / Exception Test Suite for Coverage", () => {
  describe("Ddu64 Constructor Options & Normalization", () => {
    it("should throw on duplicate characters", () => {
      expect(() => new Ddu64(["A", "A", "B"], "X", { throwOnError: true })).toThrow(/duplicate/i);
    });

    it("should throw on insufficient unique characters (needs at least 2)", () => {
      expect(() => new Ddu64(["A"], "X", { throwOnError: true })).toThrow(/At least 2/i);
    });

    it("should throw if paddingChar is not provided alongside dduChar", () => {
      expect(() => new Ddu64(["A", "B"], undefined, { throwOnError: true })).toThrow(/paddingChar is required/i);
    });

    it("should throw if padding character is used inside charset", () => {
      expect(() => new Ddu64(["A", "B"], "A", { throwOnError: true })).toThrow(/conflicts/i);
    });

    it("should throw if charset contains reserved newline characters", () => {
      expect(() => new Ddu64(["A", "\n", "B"], "X", { throwOnError: true })).toThrow(/reserved/i);
      expect(() => new Ddu64(["A", "\r", "B"], "X", { throwOnError: true })).toThrow(/reserved/i);
    });

    it("should throw if padding contains reserved newline characters", () => {
      expect(() => new Ddu64(["A", "B", "C"], "\n", { throwOnError: true })).toThrow(/reserved/i);
      expect(() => new Ddu64(["A", "B", "C"], "\r", { throwOnError: true })).toThrow(/reserved/i);
    });
  });

  describe("Ddu64 Decoding Edges & Invalid Data", () => {
    const dduPow = new Ddu64(["A", "B", "C", "D"], "X", { throwOnError: true });
    const dduNonPow = new Ddu64(["A", "B", "C"], "X", { usePowerOfTwo: false, throwOnError: true });

    it("should throw if non-pow2 charset receives odd length encoded input", () => {
      expect(() => dduNonPow.decodeToBuffer("A")).toThrow(/Invalid encoded length/i);
    });

    it("should throw on unrecognized characters in decode string", () => {
      expect(() => dduPow.decodeToBuffer("Z")).toThrow(/Invalid character/i);
    });

    it("should throw on gracefully parsing invalid footer formats", () => {
      expect(() => dduPow.decodeToBuffer("AAX_wrong_format")).toThrow(/Invalid padding format/i);
      const dduMisaligned = new Ddu64(["AA", "BB", "CC", "DD"], "XX", { throwOnError: true });
      expect(() => dduMisaligned.decodeToBuffer("AABBAXX1")).toThrow(/Invalid character/i);
    });

    it("should cleanly reject async processing on invalid data", async () => {
      await expect(dduPow.decodeAsync("Z")).rejects.toThrow(/Invalid character/i);
      await expect(dduPow.decodeToBufferAsync("Z")).rejects.toThrow(/Invalid character/i);
    });

    it("should treat GRISEO + digits suffix as pure data (No false positive) if not properly padded", () => {
      // charset contains 32 characters (power of 2) including G, R, I, S, E, O, 1
      const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345".split('');
      const dduEdge = new Ddu64(charset, "-", { throwOnError: true });
      
      // "GRISEO11" does not have the padding character '-' right before it,
      // so it should be treated as raw data symbols, NOT a brotli footer.
      // (Used length 8 string to align perfectly with charLength 1)
      const rawPayload = "BGRISEO1"; 
      const decodedBuf = dduEdge.decodeToBuffer(rawPayload);
      const encodedRe = dduEdge.encode(decodedBuf);
      
      // Decoded buffer shouldn't be empty (which would happen if it was stripped as a footer),
      // and re-encoding should yield the pure data (no footprint loss).
      expect(encodedRe).toBe(rawPayload);
    });

    it("should decode custom chunk separators when explicitly provided", () => {
      const base64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("");
      const encoder = new Ddu64(base64, "=", { throwOnError: true });
      const encoded = encoder.encode("hello world", {
        chunkSize: 4,
        chunkSeparator: "--",
      });
      expect(encoder.decode(encoded, { chunkSeparator: "--" })).toBe("hello world");
    });

    it("should throw when decoding encrypted payload without an encryption key", () => {
      const base64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("");
      const encodeEncoder = new Ddu64(base64, "=", {
        encryptionKey: "secret-key",
        throwOnError: true,
      });
      const decodeEncoder = new Ddu64(base64, "=", { throwOnError: true });
      const encoded = encodeEncoder.encode("secret payload");

      expect(() => decodeEncoder.decode(encoded)).toThrow(/encryptionKey/i);
    });
  });

  describe("Crypto Limits (Zip Bomb Defense)", () => {
    it("should throw Zip Bomb warning if deflated data expands past limits", () => {
      const zeroBuffer = Buffer.alloc(5000, 0); 
      const deflated = deflateSync(zeroBuffer);
      expect(() => inflateWithLimit(deflated, 1000, "Security")).toThrow(/exceeds limit/i);
    });

    it("should throw warning if brotli data expands past limits during decoding", () => {
      const zeroBuffer = Buffer.alloc(5000, 0);
      const dduBrotli = new Ddu64(["A", "B", "C", "D"], "X", { 
        compress: true, 
        compressionAlgorithm: "brotli" ,
        maxDecompressedBytes: 1000
      });
      const encoded = dduBrotli.encode(zeroBuffer);
      // Because decoding 5000 bytes > 1000 limit, it natively blocks execution
      expect(() => dduBrotli.decodeToBuffer(encoded)).toThrow(/Decompressed data exceeds limit/i);
    });
  });

  describe("DduPipeline Non-Reversibility", () => {
    it("should throw if trying to reverse a custom mapped function step", () => {
      const pipeline = new DduPipeline().transform(buf => buf);
      expect(() => pipeline.reverse()).toThrow(/Cannot reverse/i);
    });
    
    it("should throw if trying to reverse string transform step", () => {
      const pipeline = new DduPipeline().transformString(s => s);
      expect(() => pipeline.reverse()).toThrow(/Cannot reverse/i);
    });
  });
  
  describe("DduStream Exceptions", () => {
    it("should carry over destructive stream errors in pipeline", async () => {
      const ddu = new Ddu64(["A", "B"], "X", { throwOnError: true });
      const encodeStream = createEncodeStream(ddu) as any;
      
      const errorBubble = new Promise((_, reject) => {
        encodeStream.on("error", reject);
      });
      
      encodeStream.emit("error", new Error("Simulated Stream Destroyed"));
      await expect(errorBubble).rejects.toThrow(/Simulated Stream/i);
    });

    it("should preserve whitespace characters that belong to the charset during stream decode", async () => {
      const encoder = new Ddu64(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/ ",
        "=",
        { throwOnError: true, usePowerOfTwo: false }
      );
      const original = "Whitespace charset payload";
      const encoded = encoder.encode(original);

      const decodeStream = createDecodeStream(encoder);
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        Readable.from([Buffer.from(encoded)])
          .pipe(decodeStream)
          .on("data", (chunk: Buffer) => chunks.push(chunk))
          .on("end", resolve)
          .on("error", reject);
      });

      expect(Buffer.concat(chunks).toString("utf-8")).toBe(original);
    });
  });

  describe("DduPipeline Algorithm Support", () => {
    it("should support brotli compress/decompress steps", () => {
      const pipeline = new DduPipeline().compress(6, "brotli").decompress(undefined, "brotli");
      const data = Buffer.from("brotli pipeline test ".repeat(200));
      const output = pipeline.processToBuffer(data);
      expect(output.equals(data)).toBe(true);
    });
  });

  describe("URL-safe Transport Safety", () => {
    it("should round-trip urlSafe output independently from payload encoding", () => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("");
      const encoder = new Ddu64(chars, "=", {
        encoding: "hex",
        urlSafe: true,
        throwOnError: true,
      });
      const original = Buffer.from("48656c6c6f2b2f3d", "hex");

      const encoded = encoder.encode(original);
      const decoded = encoder.decodeToBuffer(encoded);

      expect(encoder.getCharSetInfo().urlSafe).toBe(true);
      expect(encoded).toContain(".");
      expect(encoded.includes("=")).toBe(false);
      expect(decoded.equals(original)).toBe(true);
    });
  });
});
