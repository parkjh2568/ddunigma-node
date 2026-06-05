/**
 * V5 와이어 포맷 테스트 벡터 "락(lock)" 테스트.
 *
 * V5 구현 이전 단계의 회귀 기준을 고정합니다. 검증 내용:
 * 1. 결정론적 벡터의 expected.encoded가 `...CK[P|O][8 hex]` 접미사로 끝난다.
 * 2. 접미사의 scope/hex가 벡터 필드와 일치한다.
 * 3. checksumHex가 문서화된 소스 바이트의 CRC32와 일치한다(독립 CRC32 구현으로 교차검증).
 * 4. 접미사를 제거한 payload+footer가 **현재 4.x 디코더**로 원본을 복원한다
 *    → CK 접미사가 순수 가산(additive)이며 payload는 4.x와 동일함을 증명.
 *
 * 이 테스트는 V5 코덱이 없어도 통과해야 한다(스펙 고정용). V5 구현 후에는
 * 실제 V5 encode/decode 동치 테스트가 추가된다.
 */

import { describe, it, expect } from "vitest";
import { Ddu64Node } from "../Ddu64Node.js";
import v5data from "./fixtures/v5-vectors.json";

// 독립 CRC32 (bit-by-bit) — codecUtils의 테이블 구현과 다른 방식으로 교차검증
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

interface V5Vector {
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

const file = v5data as {
  version: string;
  markerSpec: { suffixPattern: string };
  vectors: V5Vector[];
};
const vectors = file.vectors;
const suffixRe = new RegExp(file.markerSpec.suffixPattern);

describe("V5 wire-format vectors (spec lock, pre-implementation)", () => {
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
        const enc = new Ddu64Node(undefined, undefined, { compress });
        const sourceBytes =
          v.checksumSource === "plaintext"
            ? input
            : enc.decodeToUint8Array(payloadFooter, { compress: false, checksum: false });
        expect(crc32Hex(sourceBytes)).toBe(checksumHex);
      });

      it("payload+footer (CK suffix stripped) round-trips through the current 4.x decoder", () => {
        const payloadFooter = encoded.slice(0, encoded.length - suffix.length);
        const enc = new Ddu64Node(undefined, undefined, { compress });
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

describe("V5 decode self-description (Step 2)", () => {
  const deterministic = vectors.filter((v) => v.tags.includes("deterministic"));

  for (const v of deterministic) {
    it(`${v.id}: decoder auto-detects scope from CK marker and round-trips`, () => {
      const dec = new Ddu64Node();
      // checksumScope를 전달하지 않아도 CK 마커에서 scope가 자동 감지되어야 함
      const decoded = dec.decodeToUint8Array(v.expected.encoded!, { checksum: true });
      expect(decoded).toEqual(fromHex(v.input.raw));
    });
  }

  it("auto-detected scope overrides an explicitly wrong checksumScope option", () => {
    const outputVec = deterministic.find(
      (v) => v.checksumSource === "output" && v.id.includes("compressible-deflate"),
    )!;
    const dec = new Ddu64Node();
    // 잘못된 옵션(plaintext)을 주어도 마커의 output scope가 우선 적용되어 round-trip 성공
    const decoded = dec.decodeToUint8Array(outputVec.expected.encoded!, {
      checksum: true,
      checksumScope: "plaintext",
    });
    expect(decoded).toEqual(fromHex(outputVec.input.raw));
  });

  it("decoding V5 data without checksum:true fails (CK suffix not in DDU charset)", () => {
    const vec = deterministic[0];
    const dec = new Ddu64Node();
    expect(() => dec.decodeToUint8Array(vec.expected.encoded!)).toThrow();
  });
});
