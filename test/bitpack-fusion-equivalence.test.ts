/**
 * Equivalence oracle: fused bit-pack/charset-map hot paths vs. the reference
 * `bitPackEncode`/`bitPackDecode` implementation.
 *
 * The production encode/decode paths use the fused functions in
 * `IndexStringMapper` (no intermediate index array). `bitPackEncode`/
 * `bitPackDecode` remain as the simple, independently-tested reference.
 * These property tests pin the invariant that the fused functions produce
 * byte-identical output to "reference + index→charCode mapping", closing the
 * gap where the fused implementations were otherwise unverified against the
 * reference.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { bitPackEncode, bitPackDecode, type BitPackConfig } from "../src/core/BitPack.js";
import {
  packPow2ToString,
  unpackPow2FromString,
  packNonPow2ToString,
  unpackNonPow2FromString,
} from "../src/core/internal/IndexStringMapper.js";
import { buildCharsetLookupTables } from "../src/core/internal/CharsetLookup.js";

const NUM_RUNS = 200;

/** Build a single-code-unit charset of the requested size starting at U+AC00. */
function makeCharset(size: number): string[] {
  const set = new Array<string>(size);
  for (let i = 0; i < size; i++) {
    set[i] = String.fromCharCode(0xac00 + i);
  }
  return set;
}

/** Reference: map BitPack indices through charCodes into a string (former indicesToString). */
function indicesToReferenceString(indices: ArrayLike<number>, charCodes: Uint16Array): string {
  let out = "";
  for (let i = 0; i < indices.length; i++) {
    out += String.fromCharCode(charCodes[indices[i]]);
  }
  return out;
}

const bytesArb = fc.uint8Array({ minLength: 0, maxLength: 4096 });

describe("BitPack fused ↔ reference equivalence", () => {
  describe("power-of-two charset (64 chars, 6-bit)", () => {
    const config: BitPackConfig = { bitLength: 6, usePowerOfTwo: true, charsetSize: 64 };
    const charset = makeCharset(64);
    const { charCodes, charCodeLookup, lookupOffset } = buildCharsetLookupTables(charset);

    it("packPow2ToString matches reference encode (payload + paddingBits)", () => {
      fc.assert(
        fc.property(bytesArb, (data) => {
          const ref = bitPackEncode(data, config);
          const fused = packPow2ToString(data, config.bitLength, charCodes);
          expect(fused.paddingBits).toBe(ref.paddingBits);
          expect(fused.payload).toBe(indicesToReferenceString(ref.indices, charCodes));
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("unpackPow2FromString matches reference decode (bytes)", () => {
      fc.assert(
        fc.property(bytesArb, (data) => {
          const { payload, paddingBits } = packPow2ToString(data, config.bitLength, charCodes);
          // reference: payload chars → indices → bitPackDecode
          const indices = new Array<number>(payload.length);
          for (let i = 0; i < payload.length; i++) {
            indices[i] = charCodeLookup[payload.charCodeAt(i) - lookupOffset];
          }
          const ref = bitPackDecode(indices, paddingBits, config);
          const fused = unpackPow2FromString(
            payload,
            paddingBits,
            config.bitLength,
            charCodeLookup,
            lookupOffset,
          );
          expect(Array.from(fused)).toEqual(Array.from(ref));
          expect(Array.from(fused)).toEqual(Array.from(data));
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe("power-of-two charset (256 chars, 8-bit)", () => {
    const config: BitPackConfig = { bitLength: 8, usePowerOfTwo: true, charsetSize: 256 };
    const charset = makeCharset(256);
    const { charCodes, charCodeLookup, lookupOffset } = buildCharsetLookupTables(charset);

    it("packPow2ToString matches reference encode (payload + paddingBits)", () => {
      fc.assert(
        fc.property(bytesArb, (data) => {
          const ref = bitPackEncode(data, config);
          const fused = packPow2ToString(data, config.bitLength, charCodes);
          expect(fused.paddingBits).toBe(ref.paddingBits);
          expect(fused.payload).toBe(indicesToReferenceString(ref.indices, charCodes));
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("unpackPow2FromString matches reference decode (bytes)", () => {
      fc.assert(
        fc.property(bytesArb, (data) => {
          const { payload, paddingBits } = packPow2ToString(data, config.bitLength, charCodes);
          const indices = new Array<number>(payload.length);
          for (let i = 0; i < payload.length; i++) {
            indices[i] = charCodeLookup[payload.charCodeAt(i) - lookupOffset];
          }
          const ref = bitPackDecode(indices, paddingBits, config);
          const fused = unpackPow2FromString(
            payload,
            paddingBits,
            config.bitLength,
            charCodeLookup,
            lookupOffset,
          );
          expect(Array.from(fused)).toEqual(Array.from(ref));
          expect(Array.from(fused)).toEqual(Array.from(data));
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe("power-of-two charset (16 chars, 4-bit, generic branch)", () => {
    const config: BitPackConfig = { bitLength: 4, usePowerOfTwo: true, charsetSize: 16 };
    const charset = makeCharset(16);
    const { charCodes, charCodeLookup, lookupOffset } = buildCharsetLookupTables(charset);

    it("packPow2ToString matches reference encode (payload + paddingBits)", () => {
      fc.assert(
        fc.property(bytesArb, (data) => {
          const ref = bitPackEncode(data, config);
          const fused = packPow2ToString(data, config.bitLength, charCodes);
          expect(fused.paddingBits).toBe(ref.paddingBits);
          expect(fused.payload).toBe(indicesToReferenceString(ref.indices, charCodes));
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("unpackPow2FromString matches reference decode (bytes)", () => {
      fc.assert(
        fc.property(bytesArb, (data) => {
          const { payload, paddingBits } = packPow2ToString(data, config.bitLength, charCodes);
          const indices = new Array<number>(payload.length);
          for (let i = 0; i < payload.length; i++) {
            indices[i] = charCodeLookup[payload.charCodeAt(i) - lookupOffset];
          }
          const ref = bitPackDecode(indices, paddingBits, config);
          const fused = unpackPow2FromString(
            payload,
            paddingBits,
            config.bitLength,
            charCodeLookup,
            lookupOffset,
          );
          expect(Array.from(fused)).toEqual(Array.from(ref));
          expect(Array.from(fused)).toEqual(Array.from(data));
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe("non-power-of-two charset (50 chars, 6-bit)", () => {
    const config: BitPackConfig = { bitLength: 6, usePowerOfTwo: false, charsetSize: 50 };
    const charset = makeCharset(50);
    const { charCodes, charCodeLookup, lookupOffset } = buildCharsetLookupTables(charset);

    it("packNonPow2ToString matches reference encode (payload + paddingBits)", () => {
      fc.assert(
        fc.property(bytesArb, (data) => {
          const ref = bitPackEncode(data, config);
          const fused = packNonPow2ToString(data, config.bitLength, config.charsetSize, charCodes);
          expect(fused.paddingBits).toBe(ref.paddingBits);
          expect(fused.payload).toBe(indicesToReferenceString(ref.indices, charCodes));
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("unpackNonPow2FromString matches reference decode (bytes)", () => {
      fc.assert(
        fc.property(bytesArb, (data) => {
          const { payload, paddingBits } = packNonPow2ToString(
            data,
            config.bitLength,
            config.charsetSize,
            charCodes,
          );
          const indices = new Array<number>(payload.length);
          for (let i = 0; i < payload.length; i++) {
            indices[i] = charCodeLookup[payload.charCodeAt(i) - lookupOffset];
          }
          const ref = bitPackDecode(indices, paddingBits, config);
          const fused = unpackNonPow2FromString(
            payload,
            paddingBits,
            config.bitLength,
            config.charsetSize,
            charCodeLookup,
            lookupOffset,
          );
          expect(Array.from(fused)).toEqual(Array.from(ref));
          expect(Array.from(fused)).toEqual(Array.from(data));
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  describe("non-power-of-two charset (100 chars, 7-bit)", () => {
    const config: BitPackConfig = { bitLength: 7, usePowerOfTwo: false, charsetSize: 100 };
    const charset = makeCharset(100);
    const { charCodes, charCodeLookup, lookupOffset } = buildCharsetLookupTables(charset);

    it("round-trips and matches reference both directions", () => {
      fc.assert(
        fc.property(bytesArb, (data) => {
          const ref = bitPackEncode(data, config);
          const fused = packNonPow2ToString(data, config.bitLength, config.charsetSize, charCodes);
          expect(fused.paddingBits).toBe(ref.paddingBits);
          expect(fused.payload).toBe(indicesToReferenceString(ref.indices, charCodes));

          const decoded = unpackNonPow2FromString(
            fused.payload,
            fused.paddingBits,
            config.bitLength,
            config.charsetSize,
            charCodeLookup,
            lookupOffset,
          );
          expect(Array.from(decoded)).toEqual(Array.from(data));
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // Property runs cover the space statistically; these cases pin every padding boundary.
  describe("deterministic edge lengths (padding boundaries)", () => {
    const matrix: Array<{ label: string; config: BitPackConfig }> = [
      { label: "64/6-bit pow2", config: { bitLength: 6, usePowerOfTwo: true, charsetSize: 64 } },
      { label: "256/8-bit pow2", config: { bitLength: 8, usePowerOfTwo: true, charsetSize: 256 } },
      { label: "16/4-bit pow2", config: { bitLength: 4, usePowerOfTwo: true, charsetSize: 16 } },
      {
        label: "50/6-bit non-pow2",
        config: { bitLength: 6, usePowerOfTwo: false, charsetSize: 50 },
      },
      {
        label: "100/7-bit non-pow2",
        config: { bitLength: 7, usePowerOfTwo: false, charsetSize: 100 },
      },
    ];
    const lengths = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 16, 17];

    for (const { label, config } of matrix) {
      const charset = makeCharset(config.charsetSize);
      const { charCodes, charCodeLookup, lookupOffset } = buildCharsetLookupTables(charset);

      for (const len of lengths) {
        it(`${label}: ${len}-byte input is byte-identical to reference both directions`, () => {
          const data = new Uint8Array(len);
          for (let i = 0; i < len; i++) data[i] = (i * 37 + 11) & 0xff;

          const ref = bitPackEncode(data, config);
          const fused = config.usePowerOfTwo
            ? packPow2ToString(data, config.bitLength, charCodes)
            : packNonPow2ToString(data, config.bitLength, config.charsetSize, charCodes);

          expect(fused.paddingBits).toBe(ref.paddingBits);
          expect(fused.payload).toBe(indicesToReferenceString(ref.indices, charCodes));

          const decoded = config.usePowerOfTwo
            ? unpackPow2FromString(
                fused.payload,
                fused.paddingBits,
                config.bitLength,
                charCodeLookup,
                lookupOffset,
              )
            : unpackNonPow2FromString(
                fused.payload,
                fused.paddingBits,
                config.bitLength,
                config.charsetSize,
                charCodeLookup,
                lookupOffset,
              );
          expect(Array.from(decoded)).toEqual(Array.from(data));
        });
      }
    }
  });

  // The 6/8-bit direct mappings must stay byte-identical to the generic reference path.
  describe("L2 unroll branch ↔ raw bitPackEncode6/8 + bitPackDecode (explicit)", () => {
    const config6: BitPackConfig = { bitLength: 6, usePowerOfTwo: true, charsetSize: 64 };
    const charset6 = makeCharset(64);
    const tbl6 = buildCharsetLookupTables(charset6);

    const config8: BitPackConfig = { bitLength: 8, usePowerOfTwo: true, charsetSize: 256 };
    const charset8 = makeCharset(256);
    const tbl8 = buildCharsetLookupTables(charset8);

    function bytes(len: number): Uint8Array {
      const data = new Uint8Array(len);
      for (let i = 0; i < len; i++) data[i] = (i * 37 + 11) & 0xff;
      return data;
    }

    function assertUnrollEquivalence(
      data: Uint8Array,
      config: BitPackConfig,
      tbl: ReturnType<typeof buildCharsetLookupTables>,
      expectedPaddingBits: number,
    ): void {
      const { charCodes, charCodeLookup, lookupOffset } = tbl;

      const ref = bitPackEncode(data, config);
      const fused = packPow2ToString(data, config.bitLength, charCodes);
      expect(ref.paddingBits).toBe(expectedPaddingBits);
      expect(fused.paddingBits).toBe(expectedPaddingBits);
      expect(fused.payload).toBe(indicesToReferenceString(ref.indices, charCodes));

      const refIndices = new Array<number>(fused.payload.length);
      for (let i = 0; i < fused.payload.length; i++) {
        refIndices[i] = charCodeLookup[fused.payload.charCodeAt(i) - lookupOffset];
      }
      const refBytes = bitPackDecode(refIndices, fused.paddingBits, config);
      const fusedBytes = unpackPow2FromString(
        fused.payload,
        fused.paddingBits,
        config.bitLength,
        charCodeLookup,
        lookupOffset,
      );
      expect(Array.from(fusedBytes)).toEqual(Array.from(refBytes));
      expect(Array.from(fusedBytes)).toEqual(Array.from(data));
    }

    describe("6-bit unroll padding boundaries (3-byte → 4-symbol groups)", () => {
      it("remainder 0 (full groups) → paddingBits 0", () => {
        for (const len of [3, 6, 9, 30, 300]) {
          assertUnrollEquivalence(bytes(len), config6, tbl6, 0);
        }
      });

      it("remainder 1 (trailing 1 byte → 2 symbols) → paddingBits 4", () => {
        for (const len of [1, 4, 7, 31, 301]) {
          assertUnrollEquivalence(bytes(len), config6, tbl6, 4);
        }
      });

      it("remainder 2 (trailing 2 bytes → 3 symbols) → paddingBits 2", () => {
        for (const len of [2, 5, 8, 32, 302]) {
          assertUnrollEquivalence(bytes(len), config6, tbl6, 2);
        }
      });

      it("empty input → empty payload, paddingBits 0", () => {
        assertUnrollEquivalence(bytes(0), config6, tbl6, 0);
      });

      it("crosses the STRING_CHUNK_SIZE flush boundary (each remainder class)", () => {
        // 8192 code units = 6144 bytes (3 bytes → 4 symbols). Exercise lengths
        // straddling that flush so the chunked fromCharCode path stays identical.
        assertUnrollEquivalence(bytes(6144), config6, tbl6, 0); // exact multiple
        assertUnrollEquivalence(bytes(6145), config6, tbl6, 4); // +1 byte
        assertUnrollEquivalence(bytes(6146), config6, tbl6, 2); // +2 bytes
      });
    });

    describe("8-bit unroll (1-byte → 1-symbol, never padded)", () => {
      it("paddingBits is always 0 across lengths", () => {
        for (const len of [0, 1, 2, 3, 8, 9, 255, 256, 257]) {
          assertUnrollEquivalence(bytes(len), config8, tbl8, 0);
        }
      });

      it("covers all 256 byte values in order", () => {
        const data = new Uint8Array(256);
        for (let i = 0; i < 256; i++) data[i] = i;
        assertUnrollEquivalence(data, config8, tbl8, 0);
      });

      it("crosses the STRING_CHUNK_SIZE flush boundary", () => {
        // 8192 symbols = 8192 bytes for 8-bit; straddle the chunk flush.
        assertUnrollEquivalence(bytes(8192), config8, tbl8, 0);
        assertUnrollEquivalence(bytes(8193), config8, tbl8, 0);
      });
    });
  });
});

// Direct paths preserve the documented decode error messages and character positions.
describe("decode error-signal preservation (fused paths)", () => {
  const FOREIGN_CHAR = "A"; // U+0041, far below the U+AC00 lookup offset

  function corruptAt(s: string, pos: number, ch: string): string {
    return s.slice(0, pos) + ch + s.slice(pos + 1);
  }

  describe("non-power-of-two charset (50 chars, 6-bit)", () => {
    const config: BitPackConfig = { bitLength: 6, usePowerOfTwo: false, charsetSize: 50 };
    const charset = makeCharset(50);
    const { charCodes, charCodeLookup, lookupOffset } = buildCharsetLookupTables(charset);

    function validPayload(): { payload: string; paddingBits: number } {
      const data = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a]);
      return packNonPow2ToString(data, config.bitLength, config.charsetSize, charCodes);
    }

    function decode(payload: string, paddingBits: number): Uint8Array {
      return unpackNonPow2FromString(
        payload,
        paddingBits,
        config.bitLength,
        config.charsetSize,
        charCodeLookup,
        lookupOffset,
      );
    }

    it("charset-foreign character at even position (v1) throws at that index", () => {
      const { payload, paddingBits } = validPayload();
      const bad = corruptAt(payload, 0, FOREIGN_CHAR);
      expect(() => decode(bad, paddingBits)).toThrowError(
        `[Ddu64 decode] Invalid character "${FOREIGN_CHAR}" at 0`,
      );
    });

    it("charset-foreign character at odd position (v2) throws at that index", () => {
      const { payload, paddingBits } = validPayload();
      const bad = corruptAt(payload, 1, FOREIGN_CHAR);
      expect(() => decode(bad, paddingBits)).toThrowError(
        `[Ddu64 decode] Invalid character "${FOREIGN_CHAR}" at 1`,
      );
    });

    it("truncated symbol pair (odd-length input) throws at i+1", () => {
      // Single valid leading symbol → second of the pair is missing.
      const single = String.fromCharCode(charCodes[0]);
      expect(() => decode(single, 0)).toThrowError("[Ddu64 decode] Truncated symbol pair at 1");
    });

    it("out-of-range value (v1*charsetSize + v2 >= 2^bitLength) throws at position i", () => {
      // bitLength 6 → max value 64. charsetSize 50. indices [1,14] → 1*50+14 = 64 >= 64.
      const value = 1 * config.charsetSize + 14;
      expect(value).toBe(64); // == maxValueForBitLength(6), the first out-of-range value
      const bad = String.fromCharCode(charCodes[1]) + String.fromCharCode(charCodes[14]);
      expect(() => decode(bad, 0)).toThrowError(
        `[Ddu64 decode] Value ${value} exceeds range at position 0`,
      );
    });

    it("matches raw bitPackDecode behavior for out-of-range value (same suffix/position)", () => {
      const value = 1 * config.charsetSize + 14; // 64
      const bad = String.fromCharCode(charCodes[1]) + String.fromCharCode(charCodes[14]);

      let fusedMsg = "";
      try {
        decode(bad, 0);
      } catch (e) {
        fusedMsg = (e as Error).message;
      }

      let rawMsg = "";
      try {
        // Raw reference: same logical indices [1, 14] fed as index pairs.
        bitPackDecode([1, 14], 0, config);
      } catch (e) {
        rawMsg = (e as Error).message;
      }

      const suffix = `Value ${value} exceeds range at position 0`;
      expect(fusedMsg).toBe(`[Ddu64 decode] ${suffix}`);
      expect(rawMsg).toBe(`[BitPack decode] ${suffix}`);
      // Behavioral parity: both reject the same condition at the same position.
      expect(fusedMsg.endsWith(suffix)).toBe(true);
      expect(rawMsg.endsWith(suffix)).toBe(true);
    });

    it("matches raw bitPackDecode behavior for truncated pair (both reject odd length)", () => {
      const single = String.fromCharCode(charCodes[0]);
      expect(() => decode(single, 0)).toThrow();
      // Raw reference: a lone index has no pair partner → also rejected.
      expect(() => bitPackDecode([0], 0, config)).toThrow();
    });
  });

  describe("power-of-two charset (64 chars, 6-bit)", () => {
    const config: BitPackConfig = { bitLength: 6, usePowerOfTwo: true, charsetSize: 64 };
    const charset = makeCharset(64);
    const { charCodes, charCodeLookup, lookupOffset } = buildCharsetLookupTables(charset);

    function decode(payload: string, paddingBits: number): Uint8Array {
      return unpackPow2FromString(
        payload,
        paddingBits,
        config.bitLength,
        charCodeLookup,
        lookupOffset,
      );
    }

    it("charset-foreign character in a full 4-symbol group throws at that index", () => {
      // 3-byte input → 4-symbol payload, paddingBits 0 (full unroll group fast-path).
      const data = new Uint8Array([0x12, 0x34, 0x56]);
      const { payload, paddingBits } = packPow2ToString(data, config.bitLength, charCodes);
      expect(paddingBits).toBe(0);
      const bad = corruptAt(payload, 2, FOREIGN_CHAR);
      expect(() => decode(bad, paddingBits)).toThrowError(
        `[Ddu64 decode] Invalid character "${FOREIGN_CHAR}" at 2`,
      );
    });

    it("charset-foreign character in the padded last group throws at that index", () => {
      // 1-byte input → 2-symbol payload, paddingBits 4 (generic last-group branch).
      const data = new Uint8Array([0x9a]);
      const { payload, paddingBits } = packPow2ToString(data, config.bitLength, charCodes);
      expect(paddingBits).toBe(4);
      const bad = corruptAt(payload, 1, FOREIGN_CHAR);
      expect(() => decode(bad, paddingBits)).toThrowError(
        `[Ddu64 decode] Invalid character "${FOREIGN_CHAR}" at 1`,
      );
    });
  });

  describe("power-of-two charset (256 chars, 8-bit)", () => {
    const config: BitPackConfig = { bitLength: 8, usePowerOfTwo: true, charsetSize: 256 };
    const charset = makeCharset(256);
    const { charCodes, charCodeLookup, lookupOffset } = buildCharsetLookupTables(charset);

    it("charset-foreign character throws at that index (direct 1-byte→1-symbol path)", () => {
      const data = new Uint8Array([0x00, 0x7f, 0xff]);
      const { payload, paddingBits } = packPow2ToString(data, config.bitLength, charCodes);
      expect(paddingBits).toBe(0);
      const bad = corruptAt(payload, 1, FOREIGN_CHAR);
      expect(() =>
        unpackPow2FromString(bad, paddingBits, config.bitLength, charCodeLookup, lookupOffset),
      ).toThrowError(`[Ddu64 decode] Invalid character "${FOREIGN_CHAR}" at 1`);
    });
  });
});
