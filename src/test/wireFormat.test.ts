import { describe, it, expect } from "vitest";
import {
  WIRE_FORMAT_VERSION,
  COMPRESS_MARKER,
  BROTLI_MARKER,
  ENCRYPT_MARKER,
  PIPELINE_V3_MARKER,
  PIPELINE_V4_MARKER,
  CHECKSUM_MARKER,
  parseFooter,
  extractChecksum,
  buildStreamHeader,
  parseStreamHeader,
  getStreamHeaderLength,
  buildFooter,
  buildEncryptionAAD,
} from "../core/wireFormat";

describe("wireFormat constants", () => {
  it("exports correct marker values", () => {
    expect(COMPRESS_MARKER).toBe("ELYSIA");
    expect(BROTLI_MARKER).toBe("GRISEO");
    expect(ENCRYPT_MARKER).toBe("ENC");
    expect(PIPELINE_V3_MARKER).toBe("V3");
    expect(PIPELINE_V4_MARKER).toBe("V4");
    expect(CHECKSUM_MARKER).toBe("CHK");
    expect(WIRE_FORMAT_VERSION).toBe("DDS1");
  });
});

describe("parseFooter", () => {
  const pad = "뭐";
  const bitLength = 6;

  it("returns no-footer result for empty input", () => {
    const result = parseFooter("", pad, bitLength);
    expect(result).toEqual({
      cleanedInput: "",
      paddingBits: 0,
      isEncrypted: false,
      pipelineVersion: 2,
    });
  });

  it("parses simple padding footer (no markers)", () => {
    // payload + padChar + "4"
    const input = "ABCDEF" + pad + "4";
    const result = parseFooter(input, pad, bitLength);
    expect(result.cleanedInput).toBe("ABCDEF");
    expect(result.paddingBits).toBe(4);
    expect(result.compressionAlgorithm).toBeUndefined();
    expect(result.isEncrypted).toBe(false);
  });

  it("parses footer with deflate compression marker", () => {
    const input = "ABCDEF" + pad + COMPRESS_MARKER + "2";
    const result = parseFooter(input, pad, bitLength);
    expect(result.cleanedInput).toBe("ABCDEF");
    expect(result.paddingBits).toBe(2);
    expect(result.compressionAlgorithm).toBe("deflate");
    expect(result.isEncrypted).toBe(false);
  });

  it("parses footer with brotli compression marker", () => {
    const input = "ABCDEF" + pad + BROTLI_MARKER + "3";
    const result = parseFooter(input, pad, bitLength);
    expect(result.cleanedInput).toBe("ABCDEF");
    expect(result.paddingBits).toBe(3);
    expect(result.compressionAlgorithm).toBe("brotli");
    expect(result.isEncrypted).toBe(false);
  });

  it("parses footer with encryption marker", () => {
    const input = "ABCDEF" + pad + ENCRYPT_MARKER + "2";
    const result = parseFooter(input, pad, bitLength);
    expect(result.cleanedInput).toBe("ABCDEF");
    expect(result.paddingBits).toBe(2);
    expect(result.compressionAlgorithm).toBeUndefined();
    expect(result.isEncrypted).toBe(true);
  });

  it("parses footer with both compression and encryption markers", () => {
    const input = "ABCDEF" + pad + COMPRESS_MARKER + ENCRYPT_MARKER + "4";
    const result = parseFooter(input, pad, bitLength);
    expect(result.cleanedInput).toBe("ABCDEF");
    expect(result.paddingBits).toBe(4);
    expect(result.compressionAlgorithm).toBe("deflate");
    expect(result.isEncrypted).toBe(true);
    expect(result.pipelineVersion).toBe(2);
  });

  it("parses footer with v3 pipeline marker", () => {
    const input = "ABCDEF" + pad + COMPRESS_MARKER + ENCRYPT_MARKER + PIPELINE_V3_MARKER + "4";
    const result = parseFooter(input, pad, bitLength);
    expect(result.cleanedInput).toBe("ABCDEF");
    expect(result.paddingBits).toBe(4);
    expect(result.compressionAlgorithm).toBe("deflate");
    expect(result.isEncrypted).toBe(true);
    expect(result.pipelineVersion).toBe(3);
  });

  it("parses footer with v4 pipeline marker", () => {
    const input = "ABCDEF" + pad + BROTLI_MARKER + ENCRYPT_MARKER + PIPELINE_V4_MARKER + "1";
    const result = parseFooter(input, pad, bitLength);
    expect(result.cleanedInput).toBe("ABCDEF");
    expect(result.paddingBits).toBe(1);
    expect(result.compressionAlgorithm).toBe("brotli");
    expect(result.isEncrypted).toBe(true);
    expect(result.pipelineVersion).toBe(4);
  });

  it("parses footer with brotli and encryption markers", () => {
    const input = "ABCDEF" + pad + BROTLI_MARKER + ENCRYPT_MARKER + "1";
    const result = parseFooter(input, pad, bitLength);
    expect(result.cleanedInput).toBe("ABCDEF");
    expect(result.paddingBits).toBe(1);
    expect(result.compressionAlgorithm).toBe("brotli");
    expect(result.isEncrypted).toBe(true);
  });

  it("parses zero padding bits with markers", () => {
    const input = "ABCDEF" + pad + COMPRESS_MARKER + "0";
    const result = parseFooter(input, pad, bitLength);
    expect(result.cleanedInput).toBe("ABCDEF");
    expect(result.paddingBits).toBe(0);
    expect(result.compressionAlgorithm).toBe("deflate");
    expect(result.isEncrypted).toBe(false);
  });

  it("parses V2 repeat-padding (trailing pad chars)", () => {
    // 2 trailing pad chars = 4 padding bits
    const input = "ABCDEF" + pad + pad;
    const result = parseFooter(input, pad, bitLength);
    expect(result.cleanedInput).toBe("ABCDEF");
    expect(result.paddingBits).toBe(4);
    expect(result.compressionAlgorithm).toBeUndefined();
    expect(result.isEncrypted).toBe(false);
  });

  it("parses V2 repeat-padding with single pad char", () => {
    const input = "ABCDEF" + pad;
    const result = parseFooter(input, pad, bitLength);
    expect(result.cleanedInput).toBe("ABCDEF");
    expect(result.paddingBits).toBe(2);
    expect(result.isEncrypted).toBe(false);
  });

  it("returns no-footer when input is too short", () => {
    const result = parseFooter("A", "뭐뭐", 6); // padLen=2, input too short
    expect(result).toEqual({
      cleanedInput: "A",
      paddingBits: 0,
      isEncrypted: false,
      pipelineVersion: 2,
    });
  });

  it("rejects padding bits >= effectiveBitLength", () => {
    // bitLength=6, so paddingBits must be < 6. "6" should not match.
    const input = "ABCDEF" + pad + "6";
    const result = parseFooter(input, pad, bitLength);
    // Should fall through to V2 repeat-padding or no-footer
    // Since the last char is "6" (not pad), it won't match V2 either
    expect(result.cleanedInput).toBe(input);
    expect(result.paddingBits).toBe(0);
  });
});

describe("extractChecksum", () => {
  it("returns null checksum when no marker present", () => {
    const result = extractChecksum("ABCDEF");
    expect(result).toEqual({ data: "ABCDEF", checksum: null });
  });

  it("extracts valid 8-char hex checksum", () => {
    const result = extractChecksum("ABCDEFCHKabcdef01");
    expect(result.data).toBe("ABCDEF");
    expect(result.checksum).toBe("abcdef01");
  });

  it("normalizes checksum to lowercase", () => {
    const result = extractChecksum("ABCDEFCHKABCDEF01");
    expect(result.checksum).toBe("abcdef01");
  });

  it("returns null for invalid checksum length", () => {
    const result = extractChecksum("ABCDEFCHK12345"); // only 5 hex chars
    expect(result).toEqual({ data: "ABCDEFCHK12345", checksum: null });
  });

  it("returns null for non-hex checksum characters", () => {
    const result = extractChecksum("ABCDEFCHKzzzzzzzz");
    expect(result).toEqual({ data: "ABCDEFCHKzzzzzzzz", checksum: null });
  });
});

describe("stream header", () => {
  const pad = "뭐";

  describe("getStreamHeaderLength", () => {
    it("calculates correct length for single-char padding", () => {
      // pad(1) + DDS1(4) + compress(1) + encrypt(1) + pad(1) = 8
      expect(getStreamHeaderLength(pad)).toBe(8);
    });

    it("calculates correct length for multi-char padding", () => {
      expect(getStreamHeaderLength("AB")).toBe(10); // 2+4+2+2 = 10
    });
  });

  describe("buildStreamHeader", () => {
    it("builds header with deflate compression", () => {
      const header = buildStreamHeader(pad, { compressionAlgorithm: "deflate", encrypted: false });
      expect(header).toBe(`${pad}DDS1D0${pad}`);
    });

    it("builds header with brotli compression", () => {
      const header = buildStreamHeader(pad, { compressionAlgorithm: "brotli", encrypted: false });
      expect(header).toBe(`${pad}DDS1B0${pad}`);
    });

    it("builds header with no compression", () => {
      const header = buildStreamHeader(pad, { encrypted: false });
      expect(header).toBe(`${pad}DDS1N0${pad}`);
    });

    it("builds header with encryption", () => {
      const header = buildStreamHeader(pad, { compressionAlgorithm: "deflate", encrypted: true });
      expect(header).toBe(`${pad}DDS1D1${pad}`);
    });

    it("builds header with no compression and encryption", () => {
      const header = buildStreamHeader(pad, { encrypted: true });
      expect(header).toBe(`${pad}DDS1N1${pad}`);
    });
  });

  describe("parseStreamHeader", () => {
    it("parses a valid deflate+encrypted header", () => {
      const header = `${pad}DDS1D1${pad}`;
      const result = parseStreamHeader(header, pad);
      expect(result).toEqual({ compressionAlgorithm: "deflate", encrypted: true });
    });

    it("parses a valid brotli+unencrypted header", () => {
      const header = `${pad}DDS1B0${pad}`;
      const result = parseStreamHeader(header, pad);
      expect(result).toEqual({ compressionAlgorithm: "brotli", encrypted: false });
    });

    it("parses a valid no-compression+unencrypted header", () => {
      const header = `${pad}DDS1N0${pad}`;
      const result = parseStreamHeader(header, pad);
      expect(result).toEqual({ compressionAlgorithm: undefined, encrypted: false });
    });

    it("returns null for input too short", () => {
      const result = parseStreamHeader("ABC", pad);
      expect(result).toBeNull();
    });

    it("returns null for input not starting with padding char", () => {
      const result = parseStreamHeader("XDDS1D0X", pad);
      expect(result).toBeNull();
    });

    it("throws on invalid magic", () => {
      const header = `${pad}DDS2D0${pad}`;
      expect(() => parseStreamHeader(header, pad)).toThrow("Invalid stream header magic");
    });

    it("throws on invalid compression flag", () => {
      const header = `${pad}DDS1X0${pad}`;
      expect(() => parseStreamHeader(header, pad)).toThrow(
        "Invalid stream header compression flag",
      );
    });

    it("throws on invalid encryption flag", () => {
      const header = `${pad}DDS1D2${pad}`;
      expect(() => parseStreamHeader(header, pad)).toThrow("Invalid stream header encryption flag");
    });

    it("throws on invalid terminator", () => {
      const header = `${pad}DDS1D0X`;
      expect(() => parseStreamHeader(header, pad)).toThrow("Invalid stream header terminator");
    });
  });

  describe("buildStreamHeader/parseStreamHeader round-trip", () => {
    const configs: Array<{ compressionAlgorithm?: "deflate" | "brotli"; encrypted: boolean }> = [
      { compressionAlgorithm: "deflate", encrypted: false },
      { compressionAlgorithm: "deflate", encrypted: true },
      { compressionAlgorithm: "brotli", encrypted: false },
      { compressionAlgorithm: "brotli", encrypted: true },
      { encrypted: false },
      { encrypted: true },
    ];

    for (const config of configs) {
      it(`round-trips: compress=${config.compressionAlgorithm ?? "none"}, encrypt=${config.encrypted}`, () => {
        const header = buildStreamHeader(pad, config);
        const parsed = parseStreamHeader(header, pad);
        expect(parsed).toEqual(config);
      });
    }
  });
});

describe("buildFooter", () => {
  const pad = "뭐";

  it("returns empty string when no padding and no markers", () => {
    const result = buildFooter({
      paddingBits: 0,
      isEncrypted: false,
      paddingChar: pad,
    });
    expect(result).toBe("");
  });

  it("builds Node-style footer with padding bits only", () => {
    const result = buildFooter({
      paddingBits: 4,
      isEncrypted: false,
      paddingChar: pad,
    });
    expect(result).toBe(pad + "4");
  });

  it("builds Node-style footer with deflate marker", () => {
    const result = buildFooter({
      paddingBits: 2,
      compressionAlgorithm: "deflate",
      isEncrypted: false,
      paddingChar: pad,
    });
    expect(result).toBe(pad + COMPRESS_MARKER + "2");
  });

  it("builds Node-style footer with brotli and encryption", () => {
    const result = buildFooter({
      paddingBits: 3,
      compressionAlgorithm: "brotli",
      isEncrypted: true,
      paddingChar: pad,
    });
    expect(result).toBe(pad + BROTLI_MARKER + ENCRYPT_MARKER + "3");
  });

  it("builds v3 footer with encryption marker", () => {
    const result = buildFooter({
      paddingBits: 3,
      compressionAlgorithm: "brotli",
      isEncrypted: true,
      paddingChar: pad,
      pipelineVersion: 3,
    });
    expect(result).toBe(pad + BROTLI_MARKER + ENCRYPT_MARKER + PIPELINE_V3_MARKER + "3");
  });

  it("builds v4 footer with encryption marker", () => {
    const result = buildFooter({
      paddingBits: 3,
      compressionAlgorithm: "brotli",
      isEncrypted: true,
      paddingChar: pad,
      pipelineVersion: 4,
    });
    expect(result).toBe(pad + BROTLI_MARKER + ENCRYPT_MARKER + PIPELINE_V4_MARKER + "3");
  });

  it("builds V2 repeat-padding footer", () => {
    const result = buildFooter({
      paddingBits: 4,
      isEncrypted: false,
      paddingChar: pad,
      useRepeatPadding: true,
    });
    // 4 bits / bitsPerPadChar(2) = 2 pad chars
    expect(result).toBe(pad + pad);
  });

  it("falls back to Node-style when repeat-padding but has compression", () => {
    const result = buildFooter({
      paddingBits: 4,
      compressionAlgorithm: "deflate",
      isEncrypted: false,
      paddingChar: pad,
      useRepeatPadding: true,
    });
    expect(result).toBe(pad + COMPRESS_MARKER + "4");
  });

  it("builds footer with zero padding but markers present", () => {
    const result = buildFooter({
      paddingBits: 0,
      compressionAlgorithm: "deflate",
      isEncrypted: true,
      paddingChar: pad,
    });
    expect(result).toBe(pad + COMPRESS_MARKER + ENCRYPT_MARKER + "0");
  });
});

describe("buildEncryptionAAD", () => {
  it("binds v4 encryption to the selected compression marker", () => {
    const decoder = new TextDecoder();
    const none = decoder.decode(buildEncryptionAAD({ pipelineVersion: 4 }));
    const deflate = decoder.decode(
      buildEncryptionAAD({ compressionAlgorithm: "deflate", pipelineVersion: 4 }),
    );
    const brotli = decoder.decode(
      buildEncryptionAAD({ compressionAlgorithm: "brotli", pipelineVersion: 4 }),
    );

    expect(none).toBe("ddunigma:wire:v4;enc=1;compress=none");
    expect(deflate).toBe("ddunigma:wire:v4;enc=1;compress=deflate");
    expect(brotli).toBe("ddunigma:wire:v4;enc=1;compress=brotli");
  });
});

describe("parseFooter/buildFooter round-trip", () => {
  const pad = "뭐";
  const bitLength = 6;

  const cases = [
    { paddingBits: 2, compressionAlgorithm: undefined, isEncrypted: false },
    { paddingBits: 4, compressionAlgorithm: "deflate" as const, isEncrypted: false },
    { paddingBits: 3, compressionAlgorithm: "brotli" as const, isEncrypted: true },
    { paddingBits: 1, compressionAlgorithm: undefined, isEncrypted: true },
    { paddingBits: 0, compressionAlgorithm: "deflate" as const, isEncrypted: true },
  ];

  for (const { paddingBits, compressionAlgorithm, isEncrypted } of cases) {
    it(`round-trips: bits=${paddingBits}, compress=${compressionAlgorithm ?? "none"}, encrypt=${isEncrypted}`, () => {
      const payload = "TESTPAYLOAD";
      const footer = buildFooter({
        paddingBits,
        compressionAlgorithm,
        isEncrypted,
        paddingChar: pad,
      });
      const fullString = payload + footer;
      const parsed = parseFooter(fullString, pad, bitLength);
      expect(parsed.cleanedInput).toBe(payload);
      expect(parsed.paddingBits).toBe(paddingBits);
      expect(parsed.compressionAlgorithm).toBe(compressionAlgorithm);
      expect(parsed.isEncrypted).toBe(isEncrypted);
    });
  }
});
