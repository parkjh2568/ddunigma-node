/**
 * Origin Cross-Platform Compatibility Tests
 *
 * Verifies that the Node.js Ddu64 implementation produces output identical
 * to the Origin Ddu64 v2 class when using the DDU preset with useRepeatPadding.
 *
 * Cross-platform compatibility boundary:
 * - COMPATIBLE: Plain encoding with DDU preset (base chars + coda chars + padding)
 * - NOT COMPATIBLE: Compression (deflate/brotli), encryption (AES-256-GCM),
 *   and checksum (CRC32) features use footer markers not supported by the
 *   Origin implementation.
 *
 * Origin Ddu64 v2 algorithm:
 * 1. Convert input bytes to binary string (8 bits per byte)
 * 2. Split into 6-bit chunks
 * 3. Pad last chunk with zeros to reach 6 bits
 * 4. Map each 6-bit value to: base_char[value // 8] combined with coda_char[value % 8]
 *    using Korean jongseong (종성) combination
 * 5. Append padding chars: count = (6 - lastChunkBitLength) / 2
 */

import { describe, it, expect } from "vitest";
// 압축·암호화·체크섬 비호환 경계는 동기 adapter가 포함된 secure 진입점으로 검증합니다.
import { Ddu64Secure } from "../src/Ddu64Secure.js";
import { DduSetSymbol } from "../src/core/types.js";
import testVectorsData from "./fixtures/test-vectors.json";

// ─── Origin DDU v2 Constants ─────────────────────────────────────────────────

/** Origin Ddu64 v2 default base characters */
const ORIGIN_BASE_CHARS = ["뜌", "땨", "이", "우", "야", "듀", "댜", "뎨"];

/** Origin Ddu64 v2 default coda characters (jongseong) */
const ORIGIN_CODA_CHARS = ["", "ㄱ", "ㄲ", "ㄷ", "ㅈ", "ㅇ", "ㅅ", "ㅆ"];

/** Origin Ddu64 v2 default padding character */
const ORIGIN_PADDING_CHAR = "뭐";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a Ddu64Secure encoder configured to match Origin Ddu64 v2 defaults.
 */
function createOriginCompatEncoder(): Ddu64Secure {
  return new Ddu64Secure(undefined, undefined, {
    dduSetSymbol: DduSetSymbol.DDU,
    useRepeatPadding: true,
  });
}

/**
 * Reference implementation of the Origin padding calculation.
 *
 * In Origin Ddu64 v2:
 *   padding = 6 - len(last_chunk_bits)
 *   padding_char_count = padding // 2
 *
 * Which is equivalent to: (6 - lastChunkBitLength) / 2
 * where lastChunkBitLength is the number of actual data bits in the final 6-bit chunk.
 *
 * For N input bytes:
 *   totalBits = N * 8
 *   lastChunkBitLength = totalBits % 6 (or 6 if evenly divisible)
 *   paddingBits = 6 - lastChunkBitLength (or 0 if evenly divisible)
 *   paddingCharCount = paddingBits / 2
 */
function originPaddingCount(inputByteLength: number): number {
  if (inputByteLength === 0) return 0;
  const totalBits = inputByteLength * 8;
  const remainder = totalBits % 6;
  if (remainder === 0) return 0;
  const paddingBits = 6 - remainder;
  return paddingBits / 2;
}

/**
 * Reference implementation of the Origin Ddu64 v2 encode algorithm.
 * Used to verify our Node.js implementation matches.
 */
function originDdu64Encode(input: Uint8Array): string {
  if (input.length === 0) return "";

  // Step 1: Convert bytes to binary string
  let binaryStr = "";
  for (let i = 0; i < input.length; i++) {
    binaryStr += input[i].toString(2).padStart(8, "0");
  }

  // Step 2: Split into 6-bit chunks
  const chunks: string[] = [];
  for (let i = 0; i < binaryStr.length; i += 6) {
    chunks.push(binaryStr.slice(i, i + 6));
  }

  // Step 3: Pad last chunk to 6 bits
  const lastChunk = chunks[chunks.length - 1];
  const padding = 6 - lastChunk.length;
  chunks[chunks.length - 1] = lastChunk + "0".repeat(padding);

  // Step 4: Map each 6-bit value to combined Hangul character
  const resultChars: string[] = [];
  for (const chunk of chunks) {
    const value = parseInt(chunk, 2);
    const baseIdx = Math.floor(value / 8);
    const codaIdx = value % 8;
    const baseChar = ORIGIN_BASE_CHARS[baseIdx];
    const coda = ORIGIN_CODA_CHARS[codaIdx];
    resultChars.push(combineCoda(baseChar, coda));
  }

  // Step 5: Append padding characters
  const paddingCount = padding / 2;
  return resultChars.join("") + ORIGIN_PADDING_CHAR.repeat(paddingCount);
}

/**
 * Combine a Hangul base character with a coda (jongseong).
 * Mirrors the Origin combine_coda function.
 */
function combineCoda(baseChar: string, coda: string): string {
  if (coda === "") return baseChar;

  const CODA_MAP: Record<string, number> = {
    "": 0,
    ㄱ: 1,
    ㄲ: 2,
    ㄳ: 3,
    ㄴ: 4,
    ㄵ: 5,
    ㄶ: 6,
    ㄷ: 7,
    ㄹ: 8,
    ㄺ: 9,
    ㄻ: 10,
    ㄼ: 11,
    ㄽ: 12,
    ㄾ: 13,
    ㄿ: 14,
    ㅀ: 15,
    ㅁ: 16,
    ㅂ: 17,
    ㅄ: 18,
    ㅅ: 19,
    ㅆ: 20,
    ㅇ: 21,
    ㅈ: 22,
    ㅊ: 23,
    ㅋ: 24,
    ㅌ: 25,
    ㅍ: 26,
    ㅎ: 27,
  };

  const baseOrd = baseChar.charCodeAt(0);
  const currentCodaIdx = (baseOrd - 44032) % 28;
  const baseWithoutCoda = baseOrd - currentCodaIdx;
  const codaIdx = CODA_MAP[coda] ?? 0;

  return String.fromCharCode(baseWithoutCoda + codaIdx);
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("Origin Cross-Platform Compatibility", () => {
  describe("Cross-language test vectors from fixture", () => {
    const crossLangVectors = (
      testVectorsData as {
        vectors: Array<{
          id: string;
          description: string;
          input: { raw: string; encoding: string };
          charset: { preset?: string; paddingChar: string };
          options: { useRepeatPadding?: boolean };
          expected: { encoded: string };
          tags: string[];
        }>;
      }
    ).vectors.filter((v) => v.tags.includes("cross-language"));

    it("should have at least 5 cross-language vectors", () => {
      expect(crossLangVectors.length).toBeGreaterThanOrEqual(5);
    });

    for (const vector of crossLangVectors) {
      it(`[${vector.id}] ${vector.description}`, () => {
        const encoder = createOriginCompatEncoder();
        const inputBytes =
          vector.input.raw === ""
            ? new Uint8Array(0)
            : new Uint8Array(Buffer.from(vector.input.raw, "hex"));

        if (inputBytes.length === 0) {
          expect(encoder.encode(inputBytes)).toBe("");
          return;
        }

        const encoded = encoder.encode(inputBytes);
        expect(encoded).toBe(vector.expected.encoded);

        // Verify round-trip
        const decoded = encoder.decodeToUint8Array(encoded);
        expect(Buffer.from(decoded).toString("hex")).toBe(vector.input.raw);
      });
    }
  });

  describe("Padding calculation matches Origin formula", () => {
    // Origin formula: padding_char_count = (6 - lastChunkBitLength) / 2
    // where lastChunkBitLength = totalBits % 6 (or 6 if divisible)

    it("1 byte (8 bits): 1 chunk of 6 + 1 chunk of 2 → padding = (6-2)/2 = 2", () => {
      expect(originPaddingCount(1)).toBe(2);
    });

    it("2 bytes (16 bits): 2 chunks of 6 + 1 chunk of 4 → padding = (6-4)/2 = 1", () => {
      expect(originPaddingCount(2)).toBe(1);
    });

    it("3 bytes (24 bits): 4 chunks of 6, no remainder → padding = 0", () => {
      expect(originPaddingCount(3)).toBe(0);
    });

    it("4 bytes (32 bits): 5 chunks of 6 + 1 chunk of 2 → padding = (6-2)/2 = 2", () => {
      expect(originPaddingCount(4)).toBe(2);
    });

    it("5 bytes (40 bits): 6 chunks of 6 + 1 chunk of 4 → padding = (6-4)/2 = 1", () => {
      expect(originPaddingCount(5)).toBe(1);
    });

    it("6 bytes (48 bits): 8 chunks of 6, no remainder → padding = 0", () => {
      expect(originPaddingCount(6)).toBe(0);
    });

    it("Node.js encoder padding matches Origin formula for various input sizes", () => {
      const encoder = createOriginCompatEncoder();

      for (let size = 1; size <= 30; size++) {
        const input = new Uint8Array(size);
        // Fill with deterministic data
        for (let i = 0; i < size; i++) input[i] = (i * 37 + 13) & 0xff;

        const encoded = encoder.encode(input);
        const expectedPaddingCount = originPaddingCount(size);

        // Count trailing padding characters
        let actualPaddingCount = 0;
        for (let i = encoded.length - 1; i >= 0; i--) {
          if (encoded[i] === ORIGIN_PADDING_CHAR) {
            actualPaddingCount++;
          } else {
            break;
          }
        }

        expect(
          actualPaddingCount,
          `Size ${size}: expected ${expectedPaddingCount} padding chars, got ${actualPaddingCount}`,
        ).toBe(expectedPaddingCount);
      }
    });
  });

  describe("DDU preset encoding matches Origin Ddu64 v2 output", () => {
    it("'Hello' encodes identically to Origin", () => {
      const encoder = createOriginCompatEncoder();
      const input = new Uint8Array(Buffer.from("Hello", "utf-8"));

      const nodeEncoded = encoder.encode(input);
      const originEncoded = originDdu64Encode(input);

      expect(nodeEncoded).toBe(originEncoded);
    });

    it("'안녕하세요' (Korean) encodes identically to Origin", () => {
      const encoder = createOriginCompatEncoder();
      const input = new Uint8Array(Buffer.from("안녕하세요", "utf-8"));

      const nodeEncoded = encoder.encode(input);
      const originEncoded = originDdu64Encode(input);

      expect(nodeEncoded).toBe(originEncoded);
    });

    it("single byte 'A' encodes identically to Origin", () => {
      const encoder = createOriginCompatEncoder();
      const input = new Uint8Array([0x41]);

      const nodeEncoded = encoder.encode(input);
      const originEncoded = originDdu64Encode(input);

      expect(nodeEncoded).toBe(originEncoded);
      expect(nodeEncoded).toBe("이이뭐뭐"); // From test vector
    });

    it("binary data [0x00, 0xFF, 0xAA] encodes identically to Origin", () => {
      const encoder = createOriginCompatEncoder();
      const input = new Uint8Array([0x00, 0xff, 0xaa]);

      const nodeEncoded = encoder.encode(input);
      const originEncoded = originDdu64Encode(input);

      expect(nodeEncoded).toBe(originEncoded);
    });

    it("'ABC' (no padding needed) encodes identically to Origin", () => {
      const encoder = createOriginCompatEncoder();
      const input = new Uint8Array(Buffer.from("ABC", "utf-8"));

      const nodeEncoded = encoder.encode(input);
      const originEncoded = originDdu64Encode(input);

      expect(nodeEncoded).toBe(originEncoded);
      expect(nodeEncoded).toBe("이잊땩뜓"); // From test vector
    });

    it("'한글' (multi-byte UTF-8) encodes identically to Origin", () => {
      const encoder = createOriginCompatEncoder();
      const input = new Uint8Array(Buffer.from("한글", "utf-8"));

      const nodeEncoded = encoder.encode(input);
      const originEncoded = originDdu64Encode(input);

      expect(nodeEncoded).toBe(originEncoded);
    });

    it("all single-byte values (0x00-0xFF) encode identically to Origin", () => {
      const encoder = createOriginCompatEncoder();

      for (let byte = 0; byte <= 255; byte++) {
        const input = new Uint8Array([byte]);
        const nodeEncoded = encoder.encode(input);
        const originEncoded = originDdu64Encode(input);

        expect(
          nodeEncoded,
          `Byte 0x${byte.toString(16).padStart(2, "0")}: Node="${nodeEncoded}" vs Origin="${originEncoded}"`,
        ).toBe(originEncoded);
      }
    });
  });

  describe("Round-trip for UTF-8 sequences", () => {
    it("ASCII string round-trips correctly", () => {
      const encoder = createOriginCompatEncoder();
      const input = "The quick brown fox jumps over the lazy dog";
      const inputBytes = new Uint8Array(Buffer.from(input, "utf-8"));

      const encoded = encoder.encode(inputBytes);
      const decoded = encoder.decodeToUint8Array(encoded);

      expect(Buffer.from(decoded).toString("utf-8")).toBe(input);
    });

    it("Korean text round-trips correctly", () => {
      const encoder = createOriginCompatEncoder();
      const input = "가나다라마바사아자차카타파하";
      const inputBytes = new Uint8Array(Buffer.from(input, "utf-8"));

      const encoded = encoder.encode(inputBytes);
      const decoded = encoder.decodeToUint8Array(encoded);

      expect(Buffer.from(decoded).toString("utf-8")).toBe(input);
    });

    it("mixed multi-byte UTF-8 (emoji, CJK, Latin) round-trips correctly", () => {
      const encoder = createOriginCompatEncoder();
      const input = "Hello 世界 🌍 Ñoño café 한국어";
      const inputBytes = new Uint8Array(Buffer.from(input, "utf-8"));

      const encoded = encoder.encode(inputBytes);
      const decoded = encoder.decodeToUint8Array(encoded);

      expect(Buffer.from(decoded).toString("utf-8")).toBe(input);
    });

    it("4-byte UTF-8 sequences (emoji) round-trip correctly", () => {
      const encoder = createOriginCompatEncoder();
      const input = "🎉🎊🎈🎁🎄🎃🎅🤶";
      const inputBytes = new Uint8Array(Buffer.from(input, "utf-8"));

      const encoded = encoder.encode(inputBytes);
      const decoded = encoder.decodeToUint8Array(encoded);

      expect(Buffer.from(decoded).toString("utf-8")).toBe(input);
    });

    it("empty input round-trips correctly", () => {
      const encoder = createOriginCompatEncoder();
      const inputBytes = new Uint8Array(0);

      const encoded = encoder.encode(inputBytes);
      expect(encoded).toBe("");

      const decoded = encoder.decodeToUint8Array(encoded);
      expect(decoded.length).toBe(0);
    });

    it("large UTF-8 input (100 KB) round-trips correctly", { timeout: 30_000 }, () => {
      const encoder = createOriginCompatEncoder();
      // Generate 100 KB of mixed UTF-8 content
      const segment = "Hello 안녕 世界 🌍 ";
      const repeated = segment.repeat(Math.ceil(100_000 / Buffer.from(segment).length));
      const inputBytes = new Uint8Array(Buffer.from(repeated, "utf-8").subarray(0, 100_000));

      const encoded = encoder.encode(inputBytes);
      const decoded = encoder.decodeToUint8Array(encoded);

      expect(decoded).toEqual(inputBytes);
    });

    it("1 MB UTF-8 input round-trips correctly", { timeout: 30_000 }, () => {
      const encoder = createOriginCompatEncoder();
      // Generate 1 MB of data
      const segment = "뚜니그마 DDUnigma テスト 🔐 ";
      const segmentBytes = Buffer.from(segment, "utf-8");
      const targetSize = 1_000_000;
      const repeatCount = Math.ceil(targetSize / segmentBytes.length);
      const fullBuffer = Buffer.from(segment.repeat(repeatCount), "utf-8");
      const inputBytes = new Uint8Array(fullBuffer.subarray(0, targetSize));

      const encoded = encoder.encode(inputBytes);
      const decoded = encoder.decodeToUint8Array(encoded);

      expect(decoded).toEqual(inputBytes);
    });
  });

  describe("Compatibility boundary documentation", () => {
    /**
     * IMPORTANT: The following features are NOT cross-platform compatible
     * with the Origin Ddu64 implementation:
     *
     * 1. Compression (deflate/brotli): Uses footer markers (ELYSIA/GRISEO)
     *    that the Origin implementation does not recognize.
     *
     * 2. Encryption (AES-256-GCM): Uses footer marker (ENC) and wire format
     *    (IV + authTag + ciphertext) not supported by Origin.
     *
     * 3. Checksum (CRC32): Uses CHK marker appended after footer,
     *    not supported by Origin.
     *
     * Only plain encoding with the DDU preset and useRepeatPadding: true
     * produces output that is interoperable between Node.js and Origin.
     */

    it("compressed output is NOT decodable by Origin-compatible decoder", () => {
      const encoder = new Ddu64Secure(undefined, undefined, {
        dduSetSymbol: DduSetSymbol.DDU,
        useRepeatPadding: true,
        compress: true,
      });
      const input = "A".repeat(200);
      const encoded = encoder.encode(input);

      // Compressed output contains footer markers (ELYSIA/GRISEO + padding digit)
      // that Origin cannot parse
      expect(encoded).toMatch(/ELYSIA|뭐\d/);
    });

    it("encrypted output is NOT decodable by Origin-compatible decoder", () => {
      const encoder = new Ddu64Secure(undefined, undefined, {
        dduSetSymbol: DduSetSymbol.DDU,
        useRepeatPadding: true,
        encryptionKey: "test-key",
      });
      const input = "secret";
      const encoded = encoder.encode(input);

      // Encrypted output contains ENC marker in footer
      expect(encoded).toContain("ENC");
    });

    it("checksum output is NOT decodable by Origin-compatible decoder", () => {
      const encoder = new Ddu64Secure(undefined, undefined, {
        dduSetSymbol: DduSetSymbol.DDU,
        useRepeatPadding: true,
        checksum: true,
      });
      const input = "checksum test";
      const encoded = encoder.encode(input);

      // Checksum output contains the scoped CK marker (CK + scope + 8 hex)
      expect(encoded).toMatch(/CK[PO][0-9a-f]{8}/);
    });

    it("plain DDU encoding IS compatible with Origin (no markers in output)", () => {
      const encoder = createOriginCompatEncoder();
      const input = new Uint8Array(Buffer.from("compatible", "utf-8"));
      const encoded = encoder.encode(input);

      // Plain output should only contain Hangul syllables and padding char
      // No ELYSIA, GRISEO, ENC, CHK markers
      expect(encoded).not.toContain("ELYSIA");
      expect(encoded).not.toContain("GRISEO");
      expect(encoded).not.toContain("ENC");
      expect(encoded).not.toContain("CHK");

      // Every character should be either a Hangul syllable (U+AC00-U+D7A3) or padding char
      for (const char of encoded) {
        const code = char.charCodeAt(0);
        const isHangulSyllable = code >= 0xac00 && code <= 0xd7a3;
        const isPadding = char === ORIGIN_PADDING_CHAR;
        expect(isHangulSyllable || isPadding).toBe(true);
      }
    });
  });

  describe("Origin reference algorithm verification", () => {
    it("reference originDdu64Encode matches known test vectors", () => {
      // Verify our reference implementation against the fixture vectors
      const vectors = [
        { hex: "48656c6c6f", expected: "읶뜟잉듖욷뜟뎾뭐" }, // Hello
        { hex: "41", expected: "이이뭐뭐" }, // A
        { hex: "414243", expected: "이잊땩뜓" }, // ABC
        { hex: "58", expected: "잇뜌뭐뭐" }, // X
        { hex: "00ffaa", expected: "뜌땼뎻듂" }, // binary
      ];

      for (const { hex, expected } of vectors) {
        const input = new Uint8Array(Buffer.from(hex, "hex"));
        const result = originDdu64Encode(input);
        expect(result).toBe(expected);
      }
    });

    it("6-bit chunk mapping: value 0 → base[0]+coda[0] = 뜌", () => {
      // Value 0: base_char[0//8=0] + coda_char[0%8=0] = "뜌" + "" = "뜌"
      const input = new Uint8Array([0, 0, 0]); // 24 bits = 4 chunks of 000000
      const encoded = originDdu64Encode(input);
      expect(encoded).toBe("뜌뜌뜌뜌"); // All zeros, no padding (24 bits / 6 = 4 exact)
    });

    it("6-bit chunk mapping: value 63 → base[7]+coda[7] = 뎨+ㅆ = 뎾", () => {
      // Value 63 (111111): base_char[63//8=7] + coda_char[63%8=7] = "뎨" + "ㅆ"
      const input = new Uint8Array([0xff, 0xff, 0xff]); // 24 bits = 4 chunks of 111111
      const encoded = originDdu64Encode(input);
      // Each chunk is 63 → base[7] + coda[7]
      const expectedChar = combineCoda("뎨", "ㅆ");
      expect(encoded).toBe(expectedChar.repeat(4));
    });
  });
});
