import { describe, it, expect } from "vitest";
import {
  bitPackEncode,
  bitPackDecode,
  calculateBitLength,
  isPowerOfTwo,
  type BitPackConfig,
} from "../src/core/BitPack.js";

describe("BitPack - standalone bit-packing engine", () => {
  describe("isPowerOfTwo", () => {
    it("returns true for powers of two", () => {
      expect(isPowerOfTwo(2)).toBe(true);
      expect(isPowerOfTwo(4)).toBe(true);
      expect(isPowerOfTwo(8)).toBe(true);
      expect(isPowerOfTwo(16)).toBe(true);
      expect(isPowerOfTwo(32)).toBe(true);
      expect(isPowerOfTwo(64)).toBe(true);
      expect(isPowerOfTwo(128)).toBe(true);
      expect(isPowerOfTwo(256)).toBe(true);
    });

    it("returns false for non-powers of two", () => {
      expect(isPowerOfTwo(0)).toBe(false);
      expect(isPowerOfTwo(3)).toBe(false);
      expect(isPowerOfTwo(5)).toBe(false);
      expect(isPowerOfTwo(50)).toBe(false);
      expect(isPowerOfTwo(100)).toBe(false);
    });
  });

  describe("calculateBitLength", () => {
    it("returns floor(log2) for power-of-two charsets", () => {
      expect(calculateBitLength(64, true)).toBe(6);
      expect(calculateBitLength(128, true)).toBe(7);
      expect(calculateBitLength(256, true)).toBe(8);
    });

    it("returns ceil(log2) for non-power-of-two charsets", () => {
      expect(calculateBitLength(50, false)).toBe(6);
      expect(calculateBitLength(100, false)).toBe(7);
      expect(calculateBitLength(200, false)).toBe(8);
    });

    it("returns 0 for charset size <= 1", () => {
      expect(calculateBitLength(0, false)).toBe(0);
      expect(calculateBitLength(1, false)).toBe(0);
    });
  });

  describe("bitPackEncode / bitPackDecode round-trip", () => {
    describe("power-of-two charset (64 chars, 6-bit)", () => {
      const config: BitPackConfig = { bitLength: 6, usePowerOfTwo: true, charsetSize: 64 };

      it("round-trips empty input", () => {
        const input = new Uint8Array(0);
        const { indices, paddingBits } = bitPackEncode(input, config);
        expect(indices).toEqual([]);
        expect(paddingBits).toBe(0);

        const decoded = bitPackDecode(indices, paddingBits, config);
        expect(decoded).toEqual(input);
      });

      it("round-trips single byte", () => {
        const input = new Uint8Array([0x48]); // 'H'
        const { indices, paddingBits } = bitPackEncode(input, config);
        // 0x48 = 01001000 → 6 bits: 010010, remaining 2 bits: 00 padded to 6 → 000000
        // indices: [18, 0], paddingBits: 4
        expect(indices.length).toBe(2);
        expect(paddingBits).toBe(4);

        const decoded = bitPackDecode(indices, paddingBits, config);
        expect(decoded).toEqual(input);
      });

      it("round-trips 3 bytes (no padding needed)", () => {
        // 3 bytes = 24 bits, 24 / 6 = 4 symbols, no padding
        const input = new Uint8Array([0x41, 0x42, 0x43]); // "ABC"
        const { indices, paddingBits } = bitPackEncode(input, config);
        expect(indices.length).toBe(4);
        expect(paddingBits).toBe(0);

        const decoded = bitPackDecode(indices, paddingBits, config);
        expect(decoded).toEqual(input);
      });

      it("round-trips arbitrary bytes", () => {
        const input = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
        const { indices, paddingBits } = bitPackEncode(input, config);
        const decoded = bitPackDecode(indices, paddingBits, config);
        expect(decoded).toEqual(input);
      });

      it("round-trips large input", () => {
        const input = new Uint8Array(1024);
        for (let i = 0; i < input.length; i++) {
          input[i] = i & 0xff;
        }
        const { indices, paddingBits } = bitPackEncode(input, config);
        const decoded = bitPackDecode(indices, paddingBits, config);
        expect(decoded).toEqual(input);
      });

      it("produces indices within valid range", () => {
        const input = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
        const { indices } = bitPackEncode(input, config);
        for (const idx of indices) {
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(64);
        }
      });
    });

    describe("power-of-two charset (256 chars, 8-bit)", () => {
      const config: BitPackConfig = { bitLength: 8, usePowerOfTwo: true, charsetSize: 256 };

      it("round-trips with identity mapping (8-bit charset)", () => {
        const input = new Uint8Array([0, 42, 128, 200, 255]);
        const { indices, paddingBits } = bitPackEncode(input, config);
        // 8-bit charset: each byte maps to exactly one index
        expect(indices.length).toBe(5);
        expect(paddingBits).toBe(0);
        expect(Array.from(indices)).toEqual([0, 42, 128, 200, 255]);

        const decoded = bitPackDecode(indices, paddingBits, config);
        expect(decoded).toEqual(input);
      });
    });

    describe("non-power-of-two charset (50 chars, 6-bit)", () => {
      const config: BitPackConfig = { bitLength: 6, usePowerOfTwo: false, charsetSize: 50 };

      it("round-trips empty input", () => {
        const input = new Uint8Array(0);
        const { indices, paddingBits } = bitPackEncode(input, config);
        expect(indices).toEqual([]);
        expect(paddingBits).toBe(0);

        const decoded = bitPackDecode(indices, paddingBits, config);
        expect(decoded).toEqual(input);
      });

      it("round-trips single byte", () => {
        const input = new Uint8Array([0x48]);
        const { indices, paddingBits } = bitPackEncode(input, config);
        // Non-power-of-two produces pairs of indices
        expect(indices.length % 2).toBe(0);

        const decoded = bitPackDecode(indices, paddingBits, config);
        expect(decoded).toEqual(input);
      });

      it("round-trips arbitrary bytes", () => {
        const input = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
        const { indices, paddingBits } = bitPackEncode(input, config);
        const decoded = bitPackDecode(indices, paddingBits, config);
        expect(decoded).toEqual(input);
      });

      it("produces index pairs within valid range", () => {
        const input = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
        const { indices } = bitPackEncode(input, config);
        expect(indices.length % 2).toBe(0);
        for (const idx of indices) {
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(50);
        }
      });

      it("round-trips large input", () => {
        const input = new Uint8Array(512);
        for (let i = 0; i < input.length; i++) {
          input[i] = i & 0xff;
        }
        const { indices, paddingBits } = bitPackEncode(input, config);
        const decoded = bitPackDecode(indices, paddingBits, config);
        expect(decoded).toEqual(input);
      });
    });

    describe("non-power-of-two charset (100 chars, 7-bit)", () => {
      const config: BitPackConfig = { bitLength: 7, usePowerOfTwo: false, charsetSize: 100 };

      it("round-trips various inputs", () => {
        const inputs = [
          new Uint8Array([]),
          new Uint8Array([0]),
          new Uint8Array([255]),
          new Uint8Array([1, 2, 3, 4, 5]),
          new Uint8Array([0xff, 0x00, 0xab, 0xcd, 0xef]),
        ];

        for (const input of inputs) {
          const { indices, paddingBits } = bitPackEncode(input, config);
          const decoded = bitPackDecode(indices, paddingBits, config);
          expect(decoded).toEqual(input);
        }
      });
    });
  });

  describe("bitPackDecode error handling", () => {
    const config: BitPackConfig = { bitLength: 6, usePowerOfTwo: true, charsetSize: 64 };

    it("throws on negative index", () => {
      expect(() => bitPackDecode([-1, 0], 0, config)).toThrow("[BitPack decode]");
    });

    it("throws on index >= charsetSize", () => {
      expect(() => bitPackDecode([64, 0], 0, config)).toThrow("[BitPack decode]");
    });

    it("throws on out-of-range index for non-power-of-two", () => {
      const npot: BitPackConfig = { bitLength: 6, usePowerOfTwo: false, charsetSize: 50 };
      expect(() => bitPackDecode([50, 0], 0, npot)).toThrow("[BitPack decode]");
    });

    it("throws on undefined second index for non-power-of-two", () => {
      const npot: BitPackConfig = { bitLength: 6, usePowerOfTwo: false, charsetSize: 50 };
      // Only one index when pairs are expected
      expect(() => bitPackDecode([0], 0, npot)).toThrow("[BitPack decode]");
    });
  });

  describe("equivalence with Ddu64 encodeFast/decodeFast", () => {
    // This test verifies that BitPack produces the same indices as Ddu64's internal logic
    // by encoding known inputs and checking the index values match expected patterns.

    it("matches expected indices for 'Hello' with 64-char charset", () => {
      const config: BitPackConfig = { bitLength: 6, usePowerOfTwo: true, charsetSize: 64 };
      // "Hello" = [0x48, 0x65, 0x6C, 0x6C, 0x6F]
      const input = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
      const { indices, paddingBits } = bitPackEncode(input, config);

      // 5 bytes = 40 bits, 40 / 6 = 6 full symbols + 4 remaining bits → 7 symbols, 2 padding bits
      expect(indices.length).toBe(7);
      expect(paddingBits).toBe(2);

      // Verify manually:
      // 01001000 01100101 01101100 01101100 01101111
      // Split into 6-bit groups:
      // 010010 | 000110 | 010101 | 101100 | 011011 | 000110 | 1111xx (pad 2)
      // = 18, 6, 21, 44, 27, 6, 60
      expect(Array.from(indices)).toEqual([18, 6, 21, 44, 27, 6, 60]);
    });

    it("matches expected indices for single byte 0xFF with 64-char charset", () => {
      const config: BitPackConfig = { bitLength: 6, usePowerOfTwo: true, charsetSize: 64 };
      const input = new Uint8Array([0xff]);
      const { indices, paddingBits } = bitPackEncode(input, config);

      // 8 bits / 6 = 1 full + 2 remaining → 2 symbols, 4 padding bits
      // 11111111 → 111111 | 11xxxx (pad 4) → 63, 48
      expect(indices.length).toBe(2);
      expect(paddingBits).toBe(4);
      expect(Array.from(indices)).toEqual([63, 48]);
    });
  });

  describe("platform independence", () => {
    it("operates purely on Uint8Array without Buffer", () => {
      const config: BitPackConfig = { bitLength: 6, usePowerOfTwo: true, charsetSize: 64 };
      // Create a plain Uint8Array (not a Buffer)
      const input = new Uint8Array([72, 101, 108, 108, 111]);
      const { indices, paddingBits } = bitPackEncode(input, config);
      const decoded = bitPackDecode(indices, paddingBits, config);

      // Result should be a Uint8Array, not a Buffer
      expect(decoded).toBeInstanceOf(Uint8Array);
      expect(decoded).toEqual(input);
    });
  });
});
