/**
 * Test vector verification suite.
 *
 * Loads test vectors from the JSON fixture and verifies each one
 * against the Ddu64Node encoder. Vectors tagged "round-trip-only"
 * verify encode→decode round-trip instead of exact encoded output.
 *
 * Validates: Requirements 6.4, 6.5, 12.1, 12.3
 */
import { describe, it, expect } from "vitest";
// 6.0: 압축/암호화/체크섬 벡터는 secure 진입점의 Ddu64Secure로 검증.
import { Ddu64Secure as Ddu64Node } from "../Ddu64Secure.js";
import { DduSetSymbol } from "../core/types.js";
import type { DduConstructorOptions } from "../core/types.js";
import testVectorsData from "./fixtures/test-vectors.json";

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("");

// ─── Types ───────────────────────────────────────────────────────────────────

interface TestVectorInput {
  raw: string;
  encoding: "utf-8" | "binary";
}

interface TestVectorCharset {
  preset?: string;
  dduChar?: string | string[];
  codaChar?: string[];
  paddingChar: string;
}

interface TestVectorOptions {
  compress?: boolean;
  compressionAlgorithm?: "deflate" | "brotli";
  encrypt?: boolean;
  encryptionKey?: string;
  checksum?: boolean;
  urlSafe?: boolean;
  chunkSize?: number;
  useRepeatPadding?: boolean;
}

interface TestVector {
  id: string;
  description: string;
  input: TestVectorInput;
  charset: TestVectorCharset;
  options: TestVectorOptions;
  expected: { encoded: string; encodedHex?: string };
  tags: string[];
}

interface TestVectorsFile {
  version: string;
  description: string;
  vectors: TestVector[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveCharset(charset: TestVectorCharset): {
  dduChar?: string[] | string;
  paddingChar: string;
  dduSetSymbol?: DduSetSymbol;
} {
  if (charset.preset) {
    const symbolMap: Record<string, DduSetSymbol> = {
      ddu: DduSetSymbol.DDU,
      ddu_v1: DduSetSymbol.DDU_V1,
      oneCharSet: DduSetSymbol.ONECHARSET,
    };
    return {
      paddingChar: charset.paddingChar,
      dduSetSymbol: symbolMap[charset.preset],
    };
  }

  // Handle "base64" shorthand
  if (charset.dduChar === "base64") {
    return {
      dduChar: BASE64_CHARS,
      paddingChar: charset.paddingChar,
    };
  }

  // Handle string charset (split into array)
  if (typeof charset.dduChar === "string") {
    return {
      dduChar: [...charset.dduChar],
      paddingChar: charset.paddingChar,
    };
  }

  return {
    dduChar: charset.dduChar,
    paddingChar: charset.paddingChar,
  };
}

function createEncoder(vector: TestVector): Ddu64Node {
  const { dduChar, paddingChar, dduSetSymbol } = resolveCharset(vector.charset);

  const constructorOptions: DduConstructorOptions = {};

  if (dduSetSymbol) {
    constructorOptions.dduSetSymbol = dduSetSymbol;
  }

  if (vector.options.compress !== undefined) {
    constructorOptions.compress = vector.options.compress;
  }
  if (vector.options.compressionAlgorithm) {
    constructorOptions.compressionAlgorithm = vector.options.compressionAlgorithm;
  }
  if (vector.options.encrypt !== undefined || vector.options.encryptionKey) {
    constructorOptions.encryptionKey = vector.options.encryptionKey;
  }
  if (vector.options.checksum !== undefined) {
    constructorOptions.checksum = vector.options.checksum;
  }
  if (vector.options.urlSafe !== undefined) {
    constructorOptions.urlSafe = vector.options.urlSafe;
  }
  if (vector.options.chunkSize !== undefined) {
    constructorOptions.chunkSize = vector.options.chunkSize;
  }
  if (vector.options.useRepeatPadding !== undefined) {
    constructorOptions.useRepeatPadding = vector.options.useRepeatPadding;
  }

  if (dduSetSymbol) {
    return new Ddu64Node(undefined, undefined, constructorOptions);
  }

  return new Ddu64Node(dduChar, paddingChar, constructorOptions);
}

function getInputBytes(input: TestVectorInput): Uint8Array {
  if (input.raw === "") return new Uint8Array(0);
  return new Uint8Array(Buffer.from(input.raw, "hex"));
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

const testVectors = (testVectorsData as TestVectorsFile).vectors;

describe("Test Vectors", () => {
  describe("Fixture metadata", () => {
    it("should have at least 10 vectors", () => {
      expect(testVectors.length).toBeGreaterThanOrEqual(10);
    });

    it("should have at most 30 vectors", () => {
      expect(testVectors.length).toBeLessThanOrEqual(30);
    });

    it("should have at least 5 cross-language vectors", () => {
      const crossLang = testVectors.filter((v) => v.tags.includes("cross-language"));
      expect(crossLang.length).toBeGreaterThanOrEqual(5);
    });

    it("should cover all required modes", () => {
      const tags = new Set(testVectors.flatMap((v) => v.tags));
      expect(tags.has("plain")).toBe(true);
      expect(tags.has("deflate") || tags.has("compression")).toBe(true);
      expect(tags.has("brotli")).toBe(true);
      expect(tags.has("encryption")).toBe(true);
      expect(tags.has("checksum")).toBe(true);
      expect(tags.has("url-safe")).toBe(true);
      expect(tags.has("chunking")).toBe(true);
    });
  });

  describe("Deterministic vectors (exact output match)", () => {
    const deterministicVectors = testVectors.filter((v) => !v.tags.includes("round-trip-only"));

    for (const vector of deterministicVectors) {
      it(`[${vector.id}] ${vector.description}`, () => {
        const encoder = createEncoder(vector);
        const inputBytes = getInputBytes(vector.input);

        if (inputBytes.length === 0 && vector.expected.encoded === "") {
          // Empty input should produce empty output
          const encoded = encoder.encode(inputBytes);
          expect(encoded).toBe("");
          return;
        }

        const encoded = encoder.encode(inputBytes);
        expect(encoded).toBe(vector.expected.encoded);

        // Also verify decode round-trip
        const decoded = encoder.decodeToUint8Array(encoded);
        expect(Buffer.from(decoded).toString("hex")).toBe(vector.input.raw);
      });
    }
  });

  describe("Round-trip only vectors (encryption with random IV)", () => {
    const roundTripVectors = testVectors.filter((v) => v.tags.includes("round-trip-only"));

    for (const vector of roundTripVectors) {
      it(`[${vector.id}] ${vector.description}`, () => {
        const encoder = createEncoder(vector);
        const inputBytes = getInputBytes(vector.input);

        // Encode
        const encoded = encoder.encode(inputBytes);

        // Verify it's not empty (encryption produces output)
        expect(encoded.length).toBeGreaterThan(0);

        // Verify round-trip: decode should recover original bytes
        const decoded = encoder.decodeToUint8Array(encoded);
        expect(Buffer.from(decoded).toString("hex")).toBe(vector.input.raw);

        // Verify non-determinism: encoding again should produce different output (random IV)
        const encoded2 = encoder.encode(inputBytes);
        expect(encoded2).not.toBe(encoded);

        // But both should decode to the same original
        const decoded2 = encoder.decodeToUint8Array(encoded2);
        expect(Buffer.from(decoded2).toString("hex")).toBe(vector.input.raw);
      });
    }
  });

  describe("Cross-language vectors (Origin compatibility)", () => {
    const crossLangVectors = testVectors.filter((v) => v.tags.includes("cross-language"));

    for (const vector of crossLangVectors) {
      it(`[${vector.id}] ${vector.description}`, () => {
        const encoder = createEncoder(vector);
        const inputBytes = getInputBytes(vector.input);

        if (inputBytes.length === 0) {
          expect(encoder.encode(inputBytes)).toBe("");
          return;
        }

        const encoded = encoder.encode(inputBytes);
        expect(encoded).toBe(vector.expected.encoded);

        // Verify decode
        const decoded = encoder.decodeToUint8Array(encoded);
        expect(Buffer.from(decoded).toString("hex")).toBe(vector.input.raw);
      });
    }
  });
});
