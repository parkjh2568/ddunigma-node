/**
 * vNext 개선 항목 회귀 테스트.
 *
 * - sync/async 출력 동치(비암호화)
 * - encode/decode 옵션 일치 계약
 * - 대형 입력 typed-index 경로(JS fallback)
 * - 종성(coda) 검증
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
// 6.0: 압축/체크섬/암호화 동등성 테스트는 secure 진입점의 Ddu64Secure로 검증.
import { Ddu64Secure as Ddu64Node } from "../Ddu64Secure.js";
import { createEncoderObfuscationLayer } from "../obfuscation/ObfuscationLayer.js";

describe("vNext improvements", () => {
  describe("sync/async output equivalence (non-encrypted)", () => {
    it("plain encode is byte-identical between sync and async", async () => {
      const enc = new Ddu64Node();
      await fc.assert(
        fc.asyncProperty(fc.uint8Array({ minLength: 0, maxLength: 1000 }), async (data) => {
          const sync = enc.encode(data);
          const async = await enc.encodeAsync(data);
          expect(async).toBe(sync);
        }),
        { numRuns: 50 },
      );
    });

    it("compressed+checksum encode is byte-identical between sync and async", async () => {
      const enc = new Ddu64Node(undefined, undefined, { compress: true, checksum: true });
      await fc.assert(
        fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 1000 }), async (data) => {
          const sync = enc.encode(data);
          const async = await enc.encodeAsync(data);
          expect(async).toBe(sync);
        }),
        { numRuns: 50 },
      );
    });
  });

  describe("option contract: decode options must match encode", () => {
    it("decoding checksum output without checksum option fails (DDU charset)", () => {
      const enc = new Ddu64Node(undefined, undefined, { checksum: true });
      const encoded = enc.encode("hello world");
      const dec = new Ddu64Node();
      // CHK + 8 hex 접미사는 DDU charset에 없는 ASCII라 invalid character로 거부됩니다.
      expect(() => dec.decode(encoded)).toThrow();
    });
  });

  describe("large input typed-index path", () => {
    it("round-trips a buffer larger than the typed-index threshold", () => {
      const enc = new Ddu64Node();
      const data = new Uint8Array(20000);
      for (let i = 0; i < data.length; i++) data[i] = (i * 31) & 0xff;
      const encoded = enc.encode(data);
      const decoded = enc.decodeToUint8Array(encoded);
      expect(decoded).toEqual(data);
    });
  });

  describe("coda validation under throwOnError", () => {
    it("throws a clear error on unknown coda characters", () => {
      expect(
        () =>
          new Ddu64Node(["가", "나", "다", "라"], "뭐", {
            codaChar: ["", "ㅏ"], // ㅏ는 종성 자모가 아님
            throwOnError: true,
          }),
      ).toThrow(/coda/i);
    });

    it("accepts valid jongseong coda characters", () => {
      expect(
        () =>
          new Ddu64Node(["가", "나", "다", "라"], "뭐", {
            codaChar: ["", "ㄱ", "ㄲ", "ㄷ"],
            throwOnError: true,
          }),
      ).not.toThrow();
    });
  });

  describe("checksumScope opt-in (non-breaking)", () => {
    it("output scope round-trips for plain/compress/encrypt", () => {
      const configs = [
        { checksum: true, checksumScope: "output" as const },
        { checksum: true, checksumScope: "output" as const, compress: true },
        { checksum: true, checksumScope: "output" as const, encryptionKey: "scope-key" },
      ];
      for (const cfg of configs) {
        const enc = new Ddu64Node(undefined, undefined, cfg);
        const message = "checksumScope round-trip payload ".repeat(8);
        expect(enc.decode(enc.encode(message))).toBe(message);
      }
    });

    it("auto-detected scope (V5) makes encode/decode scope-option mismatch a non-issue", () => {
      const outputEnc = new Ddu64Node(undefined, undefined, {
        checksum: true,
        checksumScope: "output",
        encryptionKey: "k",
      });
      const dec = new Ddu64Node(undefined, undefined, { encryptionKey: "k" });
      const msg = "scope auto-detect via CK marker";
      const encoded = outputEnc.encode(msg);
      // 디코더가 명시적으로 다른 scope(plaintext)를 줘도 CK 마커의 output scope가 우선 적용됨
      expect(dec.decode(encoded, { checksum: true, checksumScope: "plaintext" })).toBe(msg);
    });

    it("default checksumScope is 'output' (5.0) and round-trips", () => {
      const enc = new Ddu64Node(undefined, undefined, { checksum: true });
      const encoded = enc.encode("default scope");
      expect(encoded).toMatch(/CKO[0-9a-f]{8}/); // 기본 output scope → CK O 마커
      expect(enc.decode(encoded)).toBe("default scope");
    });
  });

  describe("createEncoderObfuscationLayer (encoder-compatible alphabet)", () => {
    it("round-trips strings containing footer markers and digits", () => {
      const layer = createEncoderObfuscationLayer(["A", "B", "C", "D"], "X");
      const input = "ABCDENC123V4"; // 마커(ENC, V4) + 숫자 포함
      expect(layer.deobfuscate(layer.obfuscate(input))).toBe(input);
    });
  });
});
