/**
 * Unit tests for the Hangul syllable obfuscation layer.
 *
 * Verifies:
 * - All output characters are in U+AC00–U+D7A3 range
 * - Round-trip: obfuscate then deobfuscate recovers original
 * - Output length <= 1.5× input length
 * - Frequency distribution check (no char > 3× expected)
 * - Works with DDU charset encoded strings
 * - Works with ONECHARSET encoded strings
 */

import { describe, it, expect } from "vitest";
import { HangulObfuscationLayer } from "../obfuscation/ObfuscationLayer.js";
import {
  HANGUL_SYLLABLE_START,
  HANGUL_SYLLABLE_END,
  HANGUL_SYLLABLE_COUNT,
  buildSyllableMap,
} from "../obfuscation/syllableMap.js";

/**
 * charset + padding 알파벳으로 난독화 레이어를 만드는 테스트 로컬 헬퍼.
 * (이전 공개 `createObfuscationLayer` 헬퍼가 6.0.0에서 제거되어 동작만 재현)
 */
function createObfuscationLayer(charSet: string[], paddingChar: string): HangulObfuscationLayer {
  return new HangulObfuscationLayer([...new Set([...charSet, paddingChar])]);
}

// ─── Test Data ───────────────────────────────────────────────────────────────

// DDU charset (8 base × 8 coda = 64 characters)
const DDU_BASE_CHARS = ["뜌", "땨", "이", "우", "야", "듀", "댜", "뎨"];
const DDU_CODA_CHARS = ["", "ㄱ", "ㄲ", "ㄷ", "ㅈ", "ㅇ", "ㅅ", "ㅆ"];
const DDU_PADDING = "뭐";

// Build DDU charset (simplified - just use base chars for testing since
// the actual combined charset would need the combineCoda function)
import { buildCodaCharset } from "../core/codecUtils.js";

const DDU_CHARSET = buildCodaCharset(DDU_BASE_CHARS, DDU_CODA_CHARS);

// ONECHARSET (64 ASCII characters)
const ONECHARSET = [
  "A",
  "s",
  "q",
  "r",
  "0",
  "z",
  "3",
  "t",
  "y",
  "1",
  "5",
  "2",
  "4",
  "E",
  "B",
  "C",
  "Q",
  "F",
  "R",
  "T",
  "U",
  "W",
  "V",
  "X",
  "Y",
  "Z",
  "b",
  "a",
  "c",
  "d",
  "D",
  "G",
  "L",
  "H",
  "I",
  "-",
  "J",
  "K",
  "M",
  "O",
  "N",
  "f",
  "e",
  "h",
  "g",
  "P",
  "i",
  "S",
  "k",
  "l",
  "m",
  "u",
  "j",
  "v",
  "n",
  "o",
  "p",
  "9",
  "w",
  "6",
  "7",
  "8",
  "x",
  "_",
];
const ONECHARSET_PADDING = "=";

// ─── Helper Functions ────────────────────────────────────────────────────────

function isInHangulRange(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= HANGUL_SYLLABLE_START && code <= HANGUL_SYLLABLE_END;
}

function generateSampleInput(charset: string[], paddingChar: string, length: number): string {
  const allChars = [...charset, paddingChar];
  const result: string[] = [];
  for (let i = 0; i < length; i++) {
    result.push(allChars[i % allChars.length]);
  }
  return result.join("");
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ObfuscationLayer", () => {
  describe("syllableMap constants", () => {
    it("should have correct Hangul syllable range", () => {
      expect(HANGUL_SYLLABLE_START).toBe(0xac00);
      expect(HANGUL_SYLLABLE_END).toBe(0xd7a3);
      expect(HANGUL_SYLLABLE_COUNT).toBe(11172);
    });

    it("Hangul syllable range constants cover U+AC00–U+D7A3", () => {
      const inRange = (cp: number) => cp >= HANGUL_SYLLABLE_START && cp <= HANGUL_SYLLABLE_END;
      expect(inRange(0xac00)).toBe(true); // 가
      expect(inRange(0xd7a3)).toBe(true); // 힣
      expect(inRange(0xac00 + 5000)).toBe(true);
      expect(inRange(0xabff)).toBe(false); // before range
      expect(inRange(0xd7a4)).toBe(false); // after range
      expect(inRange(0x0041)).toBe(false); // 'A'
    });
  });

  describe("buildSyllableMap", () => {
    it("should throw on empty alphabet", () => {
      expect(() => buildSyllableMap([])).toThrow("Alphabet must not be empty");
    });

    it("should throw on alphabet larger than syllable count", () => {
      const hugeAlphabet = Array.from({ length: 12000 }, (_, i) => String.fromCharCode(i + 0x100));
      expect(() => buildSyllableMap(hugeAlphabet)).toThrow("exceeds available Hangul syllables");
    });

    it("should create valid config for DDU charset", () => {
      const alphabet = [...DDU_CHARSET, DDU_PADDING];
      const config = buildSyllableMap(alphabet);
      expect(config.alphabet.length).toBe(65); // 64 charset + 1 padding
      expect(config.syllablesPerChar).toBe(Math.floor(11172 / 65));
      expect(config.charToIndex.size).toBe(65);
    });

    it("should create valid config for ONECHARSET", () => {
      const alphabet = [...ONECHARSET, ONECHARSET_PADDING];
      const config = buildSyllableMap(alphabet);
      expect(config.alphabet.length).toBe(65);
      expect(config.syllablesPerChar).toBe(Math.floor(11172 / 65));
    });
  });

  describe("HangulObfuscationLayer - DDU charset", () => {
    const layer = createObfuscationLayer(DDU_CHARSET, DDU_PADDING);

    it("should handle empty input", () => {
      expect(layer.obfuscate("")).toBe("");
      expect(layer.deobfuscate("")).toBe("");
    });

    it("should produce all valid Hangul syllables", () => {
      const input = generateSampleInput(DDU_CHARSET, DDU_PADDING, 200);
      const obfuscated = layer.obfuscate(input);

      for (let i = 0; i < obfuscated.length; i++) {
        expect(isInHangulRange(obfuscated[i])).toBe(true);
      }
    });

    it("should round-trip correctly", () => {
      const input = generateSampleInput(DDU_CHARSET, DDU_PADDING, 100);
      const obfuscated = layer.obfuscate(input);
      const deobfuscated = layer.deobfuscate(obfuscated);
      expect(deobfuscated).toBe(input);
    });

    it("should maintain output length <= 1.5× input length", () => {
      const input = generateSampleInput(DDU_CHARSET, DDU_PADDING, 500);
      const obfuscated = layer.obfuscate(input);
      expect(obfuscated.length).toBeLessThanOrEqual(input.length * 1.5);
      // Actually it should be exactly 1:1
      expect(obfuscated.length).toBe(input.length);
    });

    it("should have uniform frequency distribution (no char > 3× expected)", () => {
      // Generate a long input with all characters represented
      const input = generateSampleInput(DDU_CHARSET, DDU_PADDING, 1000);
      const obfuscated = layer.obfuscate(input);

      // Count frequencies
      const freq = new Map<string, number>();
      for (const char of obfuscated) {
        freq.set(char, (freq.get(char) || 0) + 1);
      }

      // Expected uniform frequency: total chars / number of unique output chars
      // Since each input char maps to different syllables based on position,
      // the distribution should be very uniform
      const expectedFreq = obfuscated.length / freq.size;
      const maxAllowed = expectedFreq * 3;

      for (const [, count] of freq) {
        expect(count).toBeLessThanOrEqual(maxAllowed);
      }
    });

    it("should throw on unknown character", () => {
      expect(() => layer.obfuscate("X")).toThrow("not found in obfuscation alphabet");
    });

    it("should throw on invalid syllable during deobfuscation", () => {
      expect(() => layer.deobfuscate("A")).toThrow("not in the mapped range");
    });
  });

  describe("HangulObfuscationLayer - ONECHARSET", () => {
    const layer = createObfuscationLayer(ONECHARSET, ONECHARSET_PADDING);

    it("should produce all valid Hangul syllables", () => {
      const input = generateSampleInput(ONECHARSET, ONECHARSET_PADDING, 200);
      const obfuscated = layer.obfuscate(input);

      for (let i = 0; i < obfuscated.length; i++) {
        expect(isInHangulRange(obfuscated[i])).toBe(true);
      }
    });

    it("should round-trip correctly", () => {
      const input = generateSampleInput(ONECHARSET, ONECHARSET_PADDING, 100);
      const obfuscated = layer.obfuscate(input);
      const deobfuscated = layer.deobfuscate(obfuscated);
      expect(deobfuscated).toBe(input);
    });

    it("should maintain output length <= 1.5× input length", () => {
      const input = generateSampleInput(ONECHARSET, ONECHARSET_PADDING, 500);
      const obfuscated = layer.obfuscate(input);
      expect(obfuscated.length).toBeLessThanOrEqual(input.length * 1.5);
    });

    it("should have uniform frequency distribution (no char > 3× expected)", () => {
      const input = generateSampleInput(ONECHARSET, ONECHARSET_PADDING, 1000);
      const obfuscated = layer.obfuscate(input);

      const freq = new Map<string, number>();
      for (const char of obfuscated) {
        freq.set(char, (freq.get(char) || 0) + 1);
      }

      const expectedFreq = obfuscated.length / freq.size;
      const maxAllowed = expectedFreq * 3;

      for (const [, count] of freq) {
        expect(count).toBeLessThanOrEqual(maxAllowed);
      }
    });

    it("should round-trip with mixed characters including padding", () => {
      // Input that includes padding characters
      const input = "AsqrAsqr====";
      const obfuscated = layer.obfuscate(input);
      const deobfuscated = layer.deobfuscate(obfuscated);
      expect(deobfuscated).toBe(input);
    });
  });

  describe("createObfuscationLayer", () => {
    it("should include padding char in alphabet even if not in charset", () => {
      const charset = ["A", "B", "C"];
      const padding = "X";
      const layer = createObfuscationLayer(charset, padding);

      // Should be able to obfuscate padding char
      const obfuscated = layer.obfuscate("ABCX");
      expect(obfuscated.length).toBe(4);
      const deobfuscated = layer.deobfuscate(obfuscated);
      expect(deobfuscated).toBe("ABCX");
    });

    it("should not duplicate padding char if already in charset", () => {
      const charset = ["A", "B", "C", "X"];
      const padding = "X";
      const layer = createObfuscationLayer(charset, padding);

      const obfuscated = layer.obfuscate("ABCX");
      expect(obfuscated.length).toBe(4);
      const deobfuscated = layer.deobfuscate(obfuscated);
      expect(deobfuscated).toBe("ABCX");
    });
  });

  describe("Deterministic mapping", () => {
    const layer = createObfuscationLayer(DDU_CHARSET, DDU_PADDING);

    it("should produce same output for same input", () => {
      const input = generateSampleInput(DDU_CHARSET, DDU_PADDING, 50);
      const result1 = layer.obfuscate(input);
      const result2 = layer.obfuscate(input);
      expect(result1).toBe(result2);
    });

    it("should produce different syllables for same char at different positions", () => {
      // Same character repeated should map to different syllables
      const char = DDU_CHARSET[0];
      const input = char.repeat(10);
      const obfuscated = layer.obfuscate(input);

      // With syllablesPerChar > 10, each position should get a different syllable
      const syllables = new Set(obfuscated.split(""));
      expect(syllables.size).toBeGreaterThan(1);
    });
  });
});
