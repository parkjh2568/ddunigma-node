/**
 * Unit tests for Ddu64Node - Node.js-specific wrapper.
 */

import { describe, it, expect } from "vitest";
import { Ddu64Node } from "../Ddu64Node.js";
import { DduSetSymbol } from "../core/types.js";

describe("Ddu64Node", () => {
  describe("Constructor auto-injects NodeAdapter", () => {
    it("should create instance without explicit adapter", () => {
      const encoder = new Ddu64Node();
      const encoded = encoder.encode("test");
      expect(encoded.length).toBeGreaterThan(0);
    });

    it("should work with encryption without explicit adapter", () => {
      const encoder = new Ddu64Node(undefined, undefined, {
        encryptionKey: "my-key",
      });
      const input = "secret message";
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("should work with compression without explicit adapter", () => {
      const encoder = new Ddu64Node(undefined, undefined, { compress: true });
      const input = "A".repeat(500);
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });
  });

  describe("decodeToBuffer", () => {
    it("should return a Buffer instance", () => {
      const encoder = new Ddu64Node();
      const encoded = encoder.encode("Hello");
      const decoded = encoder.decodeToBuffer(encoded);
      expect(decoded).toBeInstanceOf(Buffer);
    });

    it("should return correct content", () => {
      const encoder = new Ddu64Node();
      const input = "Hello, World!";
      const encoded = encoder.encode(input);
      const decoded = encoder.decodeToBuffer(encoded);
      expect(decoded.toString("utf-8")).toBe(input);
    });

    it("should produce byte-identical content to decodeToUint8Array", () => {
      const encoder = new Ddu64Node();
      const input = "Test data 테스트 데이터 🎉";
      const encoded = encoder.encode(input);
      const bufResult = encoder.decodeToBuffer(encoded);
      const uint8Result = encoder.decodeToUint8Array(encoded);

      expect(bufResult.length).toBe(uint8Result.length);
      for (let i = 0; i < bufResult.length; i++) {
        expect(bufResult[i]).toBe(uint8Result[i]);
      }
    });

    it("should handle empty input", () => {
      const encoder = new Ddu64Node();
      const encoded = encoder.encode("");
      const decoded = encoder.decodeToBuffer(encoded);
      expect(decoded).toBeInstanceOf(Buffer);
      expect(decoded.length).toBe(0);
    });

    it("should handle binary data", () => {
      const encoder = new Ddu64Node();
      const input = new Uint8Array([0, 1, 127, 128, 255]);
      const encoded = encoder.encode(input);
      const decoded = encoder.decodeToBuffer(encoded);
      expect(decoded).toBeInstanceOf(Buffer);
      expect(new Uint8Array(decoded)).toEqual(input);
    });
  });

  describe("decodeToBufferAsync", () => {
    it("should return a Buffer instance", async () => {
      const encoder = new Ddu64Node();
      const encoded = encoder.encode("Async test");
      const decoded = await encoder.decodeToBufferAsync(encoded);
      expect(decoded).toBeInstanceOf(Buffer);
    });

    it("should return correct content", async () => {
      const encoder = new Ddu64Node();
      const input = "Async decode 비동기 디코딩";
      const encoded = encoder.encode(input);
      const decoded = await encoder.decodeToBufferAsync(encoded);
      expect(decoded.toString("utf-8")).toBe(input);
    });

    it("should produce byte-identical content to decodeToUint8Array", async () => {
      const encoder = new Ddu64Node();
      const input = "Async equivalence test";
      const encoded = encoder.encode(input);
      const bufResult = await encoder.decodeToBufferAsync(encoded);
      const uint8Result = await encoder.decodeToUint8ArrayAsync(encoded);

      expect(bufResult.length).toBe(uint8Result.length);
      for (let i = 0; i < bufResult.length; i++) {
        expect(bufResult[i]).toBe(uint8Result[i]);
      }
    });

    it("should work with encryption", async () => {
      const encoder = new Ddu64Node(undefined, undefined, {
        encryptionKey: "async-key",
      });
      const input = "Encrypted async data";
      const encoded = await encoder.encodeAsync(input);
      const decoded = await encoder.decodeToBufferAsync(encoded);
      expect(decoded.toString("utf-8")).toBe(input);
    });

    it("should work with compression", async () => {
      const encoder = new Ddu64Node(undefined, undefined, { compress: true });
      const input = "Z".repeat(300);
      const encoded = await encoder.encodeAsync(input);
      const decoded = await encoder.decodeToBufferAsync(encoded);
      expect(decoded.toString("utf-8")).toBe(input);
    });
  });

  describe("Buffer input produces same output as Uint8Array", () => {
    it("should produce identical encoded output for same bytes", () => {
      const encoder = new Ddu64Node();
      const data = [72, 101, 108, 108, 111]; // "Hello"
      const bufInput = Buffer.from(data);
      const uint8Input = new Uint8Array(data);

      const encodedFromBuffer = encoder.encode(bufInput);
      const encodedFromUint8 = encoder.encode(uint8Input);

      expect(encodedFromBuffer).toBe(encodedFromUint8);
    });

    it("should produce identical output for binary data", () => {
      const encoder = new Ddu64Node();
      const data = Array.from({ length: 256 }, (_, i) => i);
      const bufInput = Buffer.from(data);
      const uint8Input = new Uint8Array(data);

      const encodedFromBuffer = encoder.encode(bufInput);
      const encodedFromUint8 = encoder.encode(uint8Input);

      expect(encodedFromBuffer).toBe(encodedFromUint8);
    });

    it("should produce identical output with compression", () => {
      const encoder = new Ddu64Node(undefined, undefined, { compress: true });
      const data = Buffer.from("A".repeat(200), "utf-8");
      const uint8Data = new Uint8Array(data);

      const encodedFromBuffer = encoder.encode(data);
      const encodedFromUint8 = encoder.encode(uint8Data);

      expect(encodedFromBuffer).toBe(encodedFromUint8);
    });
  });

  describe("All Ddu64 features work through Ddu64Node", () => {
    it("compression round-trip (deflate)", () => {
      const encoder = new Ddu64Node(undefined, undefined, { compress: true });
      const input = "Compressible ".repeat(50);
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("compression round-trip (brotli)", () => {
      const encoder = new Ddu64Node(undefined, undefined, {
        compress: true,
        compressionAlgorithm: "brotli",
      });
      const input = "Brotli test ".repeat(50);
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("encryption round-trip", () => {
      const encoder = new Ddu64Node(undefined, undefined, {
        encryptionKey: "node-key",
      });
      const input = "Encrypted node data 암호화";
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("checksum round-trip", () => {
      const encoder = new Ddu64Node(undefined, undefined, { checksum: true });
      const input = "Checksum test";
      const encoded = encoder.encode(input);
      expect(encoded).toMatch(/CK[PO][0-9a-f]{8}/);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("compression + encryption + checksum round-trip", () => {
      const encoder = new Ddu64Node(undefined, undefined, {
        compress: true,
        encryptionKey: "full-pipeline",
        checksum: true,
      });
      const input = "Full pipeline test 전체 파이프라인 테스트";
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("chunking round-trip", () => {
      const encoder = new Ddu64Node(undefined, undefined, { chunkSize: 20 });
      const input = "Chunked data test";
      const encoded = encoder.encode(input);
      expect(encoded).toContain("\n");
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("DDU preset works", () => {
      const encoder = new Ddu64Node(undefined, undefined, {
        dduSetSymbol: DduSetSymbol.DDU,
      });
      const input = "DDU preset test";
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("ONECHARSET preset works", () => {
      const encoder = new Ddu64Node(undefined, undefined, {
        dduSetSymbol: DduSetSymbol.ONECHARSET,
      });
      const input = "ONECHARSET test";
      const encoded = encoder.encode(input);
      const decoded = encoder.decode(encoded);
      expect(decoded).toBe(input);
    });

    it("getCharSetInfo works", () => {
      const encoder = new Ddu64Node();
      const info = encoder.getCharSetInfo();
      expect(info.charSet.length).toBe(64);
      expect(info.paddingChar).toBe("뭐");
      expect(info.bitLength).toBe(6);
    });

    it("getStats works", () => {
      const encoder = new Ddu64Node();
      const stats = encoder.getStats("Hello");
      expect(stats.originalSize).toBe(5);
      expect(stats.encodedSize).toBeGreaterThan(0);
      expect(stats.charsetSize).toBe(64);
    });
  });
});
