/**
 * 5.0 기본-세팅 호환성 가드.
 *
 * 5.0의 파괴적 변경(체크섬 V5 마커, checksumScope 기본 output, 기본값 전환 등)이
 * **옵션을 쓰지 않는 기본 3종**의 와이어 출력/동작을 바꾸지 않음을 고정한다:
 *   1. new Ddu64()                              (DDU 프리셋)
 *   2. new Ddu64({ dduSetSymbol: DDU_V1 })      (V1 프리셋)
 *   3. new Ddu64("<base64>", "=")               (위치 인자 생성자 — U1 보존)
 */

import { describe, it, expect } from "vitest";
import { Ddu64Node } from "../Ddu64Node.js";
import { DduSetSymbol } from "../core/types.js";

const STRINGS = ["", "Hello", "안녕하세요", "URL safe text 123", "🌍 emoji 한글 mix"];
const BINARIES = [
  new Uint8Array([]),
  new Uint8Array([0, 1, 127, 128, 255]),
  new Uint8Array(300).fill(7),
];
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** 기본(옵션 미사용) 출력에는 어떤 옵션 마커도 없어야 한다 */
function expectNoOptionMarkers(encoded: string): void {
  expect(encoded).not.toMatch(/CK[PO][0-9a-f]{8}/); // V5 체크섬
  expect(encoded).not.toContain("CHK"); // 레거시 체크섬
  expect(encoded).not.toContain("ELYSIA"); // deflate
  expect(encoded).not.toContain("GRISEO"); // brotli
  expect(encoded).not.toContain("ENC"); // 암호화
}

describe("5.0 basic-settings compatibility guard", () => {
  describe("new Ddu64() — DDU preset", () => {
    const enc = new Ddu64Node();
    it("round-trips strings/binaries and emits no option markers", () => {
      for (const s of STRINGS) {
        const e = enc.encode(s);
        expect(enc.decode(e)).toBe(s);
        expectNoOptionMarkers(e);
      }
      for (const b of BINARIES) {
        expect(enc.decodeToUint8Array(enc.encode(b))).toEqual(b);
      }
    });
  });

  describe("new Ddu64({ dduSetSymbol: DDU_V1 }) — V1 preset", () => {
    const enc = new Ddu64Node(undefined, undefined, { dduSetSymbol: DduSetSymbol.DDU_V1 });
    it("round-trips and emits no option markers", () => {
      for (const s of STRINGS) {
        const e = enc.encode(s);
        expect(enc.decode(e)).toBe(s);
        expectNoOptionMarkers(e);
      }
      for (const b of BINARIES) {
        expect(enc.decodeToUint8Array(enc.encode(b))).toEqual(b);
      }
    });
  });

  describe('new Ddu64("<base64>", "=") — positional constructor (U1 preserved)', () => {
    it("constructs via positional args and round-trips", () => {
      const enc = new Ddu64Node(BASE64, "=");
      for (const s of STRINGS) {
        expect(enc.decode(enc.encode(s))).toBe(s);
      }
      for (const b of BINARIES) {
        expect(enc.decodeToUint8Array(enc.encode(b))).toEqual(b);
      }
    });

    it("produces standard Base64 wire output", () => {
      const enc = new Ddu64Node(BASE64, "=");
      // "Hello" → base64 "SGVsbG8=" (페이로드 SGVsbG8 + 패딩 footer)
      expect(enc.encode("Hello")).toContain("SGVsbG8");
      expectNoOptionMarkers(enc.encode("Hello"));
    });

    it("positional constructor still accepts a third options argument", () => {
      const enc = new Ddu64Node(BASE64, "=", { urlSafe: true });
      expect(enc.decode(enc.encode("URL safe + base64"))).toBe("URL safe + base64");
    });
  });
});
