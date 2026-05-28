import { describe, it, expect } from "vitest";
import {
  calculateCRC32,
  toUrlSafe,
  fromUrlSafe,
  splitIntoChunks,
  removeChunks,
  combineCoda,
  buildCodaCharset,
  constantTimeEquals,
  normalizeCompressionLevel,
  stringToBytes,
  bytesToString,
  URL_SAFE_CONFLICT_CHARS,
} from "../core/codecUtils";
import { extractChecksum, CHECKSUM_MARKER } from "../core/wireFormat";

describe("core/codecUtils", () => {
  describe("calculateCRC32", () => {
    it("should compute CRC32 for empty input", () => {
      const result = calculateCRC32(new Uint8Array(0));
      expect(result).toBe("00000000");
    });

    it("should compute CRC32 for known input", () => {
      // CRC32 of "123456789" is 0xCBF43926
      const input = new TextEncoder().encode("123456789");
      const result = calculateCRC32(input);
      expect(result).toBe("cbf43926");
    });

    it("should compute CRC32 for single byte", () => {
      const input = new Uint8Array([0x00]);
      const result = calculateCRC32(input);
      expect(result).toBe("d202ef8d");
    });

    it("should accept Uint8Array (not Buffer)", () => {
      const input = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const result = calculateCRC32(input);
      expect(result).toHaveLength(8);
      expect(result).toMatch(/^[0-9a-f]{8}$/);
    });

    it("should produce consistent results for same input", () => {
      const input = new Uint8Array([1, 2, 3, 4, 5]);
      expect(calculateCRC32(input)).toBe(calculateCRC32(input));
    });
  });

  describe("constantTimeEquals", () => {
    it("should return true for identical strings", () => {
      expect(constantTimeEquals("cbf43926", "cbf43926")).toBe(true);
    });

    it("should return false for different strings", () => {
      expect(constantTimeEquals("cbf43926", "00000000")).toBe(false);
    });

    it("should return false for different lengths", () => {
      expect(constantTimeEquals("abc", "abcd")).toBe(false);
    });
  });

  describe("toUrlSafe / fromUrlSafe", () => {
    it("should handle empty string", () => {
      expect(toUrlSafe("")).toBe("");
      expect(fromUrlSafe("")).toBe("");
    });

    it("should replace + / = with - _ .", () => {
      expect(toUrlSafe("a+b/c=d")).toBe("a-b_c.d");
    });

    it("should reverse URL-safe transformation", () => {
      expect(fromUrlSafe("a-b_c.d")).toBe("a+b/c=d");
    });

    it("should round-trip correctly", () => {
      const original = "abc+def/ghi=jkl==";
      expect(fromUrlSafe(toUrlSafe(original))).toBe(original);
    });

    it("should not modify strings without special chars", () => {
      const input = "HelloWorld123";
      expect(toUrlSafe(input)).toBe(input);
      expect(fromUrlSafe(input)).toBe(input);
    });
  });

  describe("splitIntoChunks", () => {
    it("should return input unchanged if chunkSize <= 0", () => {
      expect(splitIntoChunks("abcdef", 0, "\n")).toBe("abcdef");
      expect(splitIntoChunks("abcdef", -1, "\n")).toBe("abcdef");
    });

    it("should return input unchanged if shorter than chunkSize", () => {
      expect(splitIntoChunks("abc", 10, "\n")).toBe("abc");
    });

    it("should split into chunks with separator", () => {
      expect(splitIntoChunks("abcdef", 2, "-")).toBe("ab-cd-ef");
    });

    it("should handle uneven splits", () => {
      expect(splitIntoChunks("abcde", 2, "\n")).toBe("ab\ncd\ne");
    });
  });

  describe("removeChunks", () => {
    it("should handle empty string", () => {
      expect(removeChunks("", "\n")).toBe("");
    });

    it("should remove line breaks", () => {
      expect(removeChunks("ab\ncd\nef", "\n")).toBe("abcdef");
    });

    it("should remove \\r\\n", () => {
      expect(removeChunks("ab\r\ncd\r\nef", "\r\n")).toBe("abcdef");
    });

    it("should remove custom separator", () => {
      expect(removeChunks("ab--cd--ef", "--")).toBe("abcdef");
    });

    it("should always remove line breaks even with custom separator", () => {
      expect(removeChunks("ab\n--cd\n--ef", "--")).toBe("abcdef");
    });
  });

  describe("combineCoda", () => {
    it("should return char unchanged if not in Hangul syllable range", () => {
      expect(combineCoda("A", "ㄱ")).toBe("A");
    });

    it("should combine Hangul character with coda", () => {
      // 뜌 (U+B72C) + ㄱ → 뜍 (U+B72C + 1 = U+B72D)
      const base = "뜌"; // base without jongseong
      const result = combineCoda(base, "ㄱ");
      expect(result).not.toBe(base);
      expect(result.charCodeAt(0)).toBe(base.charCodeAt(0) + 1);
    });

    it("should return base char when coda is empty string", () => {
      const base = "뜌";
      // Remove any existing jongseong first
      const baseCode = base.charCodeAt(0);
      const baseOrd = baseCode - ((baseCode - 0xac00) % 28);
      const cleanBase = String.fromCharCode(baseOrd);
      expect(combineCoda(cleanBase, "")).toBe(cleanBase);
    });
  });

  describe("buildCodaCharset", () => {
    it("should produce dduChar.length × codaChar.length characters", () => {
      const dduChar = ["뜌", "땨"];
      const codaChar = ["", "ㄱ", "ㄲ"];
      const result = buildCodaCharset(dduChar, codaChar);
      expect(result).toHaveLength(6);
    });

    it("should produce unique characters", () => {
      const dduChar = ["뜌", "땨", "이", "우"];
      const codaChar = ["", "ㄱ", "ㄲ", "ㄷ"];
      const result = buildCodaCharset(dduChar, codaChar);
      const unique = new Set(result);
      expect(unique.size).toBe(result.length);
    });

    it("should produce the DDU default charset of 64 characters", () => {
      const dduChar = ["뜌", "땨", "이", "우", "야", "듀", "댜", "뎨"];
      const codaChar = ["", "ㄱ", "ㄲ", "ㄷ", "ㅈ", "ㅇ", "ㅅ", "ㅆ"];
      const result = buildCodaCharset(dduChar, codaChar);
      expect(result).toHaveLength(64);
    });
  });

  describe("normalizeCompressionLevel", () => {
    it("should return 6 for undefined", () => {
      expect(normalizeCompressionLevel(undefined, "deflate")).toBe(6);
      expect(normalizeCompressionLevel(undefined, "brotli")).toBe(6);
    });

    it("should clamp deflate to 0-9", () => {
      expect(normalizeCompressionLevel(-1, "deflate")).toBe(0);
      expect(normalizeCompressionLevel(10, "deflate")).toBe(9);
      expect(normalizeCompressionLevel(5, "deflate")).toBe(5);
    });

    it("should clamp brotli to 0-11", () => {
      expect(normalizeCompressionLevel(-1, "brotli")).toBe(0);
      expect(normalizeCompressionLevel(12, "brotli")).toBe(11);
      expect(normalizeCompressionLevel(11, "brotli")).toBe(11);
    });

    it("should floor fractional values", () => {
      expect(normalizeCompressionLevel(3.7, "deflate")).toBe(3);
    });

    it("should handle NaN and Infinity", () => {
      expect(normalizeCompressionLevel(NaN, "deflate")).toBe(6);
      expect(normalizeCompressionLevel(Infinity, "deflate")).toBe(6);
    });
  });

  describe("extractChecksum", () => {
    it("should return null checksum when no marker present", () => {
      const result = extractChecksum("hello world");
      expect(result.data).toBe("hello world");
      expect(result.checksum).toBeNull();
    });

    it("should extract valid checksum", () => {
      const result = extractChecksum("payloadCHKabcdef01");
      expect(result.data).toBe("payload");
      expect(result.checksum).toBe("abcdef01");
    });

    it("should return null for invalid checksum length", () => {
      const result = extractChecksum("payloadCHKabc");
      expect(result.data).toBe("payloadCHKabc");
      expect(result.checksum).toBeNull();
    });

    it("should return null for non-hex checksum", () => {
      const result = extractChecksum("payloadCHKghijklmn");
      expect(result.data).toBe("payloadCHKghijklmn");
      expect(result.checksum).toBeNull();
    });

    it("should lowercase the checksum", () => {
      const result = extractChecksum("dataCHKABCDEF01");
      expect(result.checksum).toBe("abcdef01");
    });
  });

  describe("stringToBytes / bytesToString", () => {
    it("should encode and decode ASCII", () => {
      const str = "Hello, World!";
      const bytes = stringToBytes(str);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytesToString(bytes)).toBe(str);
    });

    it("should handle UTF-8 multi-byte characters", () => {
      const str = "한글 테스트 🎉";
      const bytes = stringToBytes(str);
      expect(bytesToString(bytes)).toBe(str);
    });

    it("should handle empty string", () => {
      const bytes = stringToBytes("");
      expect(bytes).toHaveLength(0);
      expect(bytesToString(bytes)).toBe("");
    });

    it("should produce Uint8Array (not Buffer)", () => {
      const bytes = stringToBytes("test");
      expect(bytes).toBeInstanceOf(Uint8Array);
      // Ensure it's not specifically a Buffer subclass in this context
      expect(bytes.constructor.name).toBe("Uint8Array");
    });
  });

  describe("constants", () => {
    it("should export CHECKSUM_MARKER as CHK", () => {
      expect(CHECKSUM_MARKER).toBe("CHK");
    });

    it("should export URL_SAFE_CONFLICT_CHARS", () => {
      expect(URL_SAFE_CONFLICT_CHARS).toEqual(["-", "_", "."]);
    });
  });
});
