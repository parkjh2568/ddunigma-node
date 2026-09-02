/** 스코프 자기기술 체크섬(CK) 와이어 포맷 벡터 테스트. */

import { describe, it, expect } from "vitest";
import { Ddu64Secure } from "../src/Ddu64Secure.js";
import scopedData from "./fixtures/scoped-checksum-vectors.json";

// 프로덕션의 테이블 기반 구현과 독립적인 bit-by-bit CRC32로 벡터를 교차 검증합니다.
function crc32Hex(data: Uint8Array): string {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

function fromHex(hex: string): Uint8Array {
  if (hex === "") return new Uint8Array(0);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

interface ScopedVector {
  id: string;
  input: { raw: string; encoding: string };
  options: { compress?: boolean; encryptionKey?: string; checksumScope: "plaintext" | "output" };
  checksumSource: "plaintext" | "output";
  expected: {
    encoded: string | null;
    checksumMarker: string;
    scopeChar: string;
    checksumHex: string | null;
  };
  tags: string[];
}

const file = scopedData as {
  version: string;
  markerSpec: { suffixPattern: string };
  vectors: ScopedVector[];
};
const vectors = file.vectors;
const suffixRe = new RegExp(file.markerSpec.suffixPattern);

describe("scoped checksum wire-format vectors", () => {
  it("fixture has both deterministic and round-trip-only vectors", () => {
    expect(vectors.some((v) => v.tags.includes("deterministic"))).toBe(true);
    expect(vectors.some((v) => v.tags.includes("round-trip-only"))).toBe(true);
  });

  const deterministic = vectors.filter((v) => v.tags.includes("deterministic"));

  for (const v of deterministic) {
    describe(v.id, () => {
      const encoded = v.expected.encoded!;
      const scopeChar = v.expected.scopeChar;
      const checksumHex = v.expected.checksumHex!;
      const suffix = "CK" + scopeChar + checksumHex;
      const input = fromHex(v.input.raw);
      const compress = v.options.compress ?? false;

      it("suffix matches CK[P|O][8 hex] and vector fields", () => {
        expect(suffixRe.test(suffix)).toBe(true);
        expect(scopeChar).toBe(v.checksumSource === "plaintext" ? "P" : "O");
        expect(encoded.endsWith(suffix)).toBe(true);
      });

      it("checksumHex equals CRC32 of the documented source bytes", () => {
        const payloadFooter = encoded.slice(0, encoded.length - suffix.length);
        const enc = new Ddu64Secure({ compress });
        const sourceBytes =
          v.checksumSource === "plaintext"
            ? input
            : enc.decodeToUint8Array(payloadFooter, { compress: false, checksum: false });
        expect(crc32Hex(sourceBytes)).toBe(checksumHex);
      });

      it("payload+footer (CK suffix stripped) round-trips through the current payload decoder", () => {
        const payloadFooter = encoded.slice(0, encoded.length - suffix.length);
        const enc = new Ddu64Secure({ compress });
        const decoded = enc.decodeToUint8Array(payloadFooter, { compress, checksum: false });
        expect(decoded).toEqual(input);
      });
    });
  }

  it("round-trip-only vectors are encrypted and have no deterministic expected output", () => {
    for (const v of vectors.filter((x) => x.tags.includes("round-trip-only"))) {
      expect(v.options.encryptionKey).toBeTruthy();
      expect(v.expected.encoded).toBeNull();
    }
  });
});

describe("scoped checksum decode self-description", () => {
  const deterministic = vectors.filter((v) => v.tags.includes("deterministic"));

  for (const v of deterministic) {
    it(`${v.id}: decoder auto-detects scope from CK marker and round-trips`, () => {
      const dec = new Ddu64Secure();
      const decoded = dec.decodeToUint8Array(v.expected.encoded!, { checksum: true });
      expect(decoded).toEqual(fromHex(v.input.raw));
    });
  }

  it("auto-detected scope overrides an explicitly wrong checksumScope option", () => {
    const outputVec = deterministic.find(
      (v) => v.checksumSource === "output" && v.id.includes("compressible-deflate"),
    )!;
    const dec = new Ddu64Secure();
    const decoded = dec.decodeToUint8Array(outputVec.expected.encoded!, {
      checksum: true,
      checksumScope: "plaintext",
    });
    expect(decoded).toEqual(fromHex(outputVec.input.raw));
  });

  it("decoding scoped-checksum data without checksum:true fails (CK suffix not in DDU charset)", () => {
    const vec = deterministic[0];
    const dec = new Ddu64Secure();
    expect(() => dec.decodeToUint8Array(vec.expected.encoded!)).toThrow();
  });
});

describe("scoped checksum encoder golden output", () => {
  const deterministic = vectors.filter((v) => v.tags.includes("deterministic"));
  for (const v of deterministic) {
    it(`${v.id}: real scoped checksum encoder produces the locked vector`, () => {
      const enc = new Ddu64Secure({
        compress: v.options.compress ?? false,
        checksum: true,
        checksumScope: v.checksumSource,
      });
      expect(enc.encode(fromHex(v.input.raw))).toBe(v.expected.encoded);
    });
  }

  it("기본 scope는 output이며 plain/compress/encrypt 구성에서 라운드트립한다", () => {
    const configurations = [{}, { compress: true }, { encryptionKey: "scope-key" }];

    for (const configuration of configurations) {
      const encoder = new Ddu64Secure({ checksum: true, ...configuration });
      const input = "checksum scope round-trip ".repeat(8);
      const encoded = encoder.encode(input);
      expect(encoded).toMatch(/CKO[0-9a-f]{8}$/);
      expect(encoder.decode(encoded)).toBe(input);
    }
  });
});
