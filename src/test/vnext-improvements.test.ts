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
import { Ddu64Node } from "../Ddu64Node.js";
import {
  createEncoderObfuscationLayer,
  createObfuscationLayer,
} from "../obfuscation/ObfuscationLayer.js";

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

  describe("large input typed-index path (JS fallback, no preloadWasm)", () => {
    it("round-trips a buffer larger than the default WASM threshold", () => {
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

    it("output scope decode rejects data checksummed with the default plaintext scope", () => {
      const outputEnc = new Ddu64Node(undefined, undefined, {
        checksum: true,
        checksumScope: "output",
        encryptionKey: "k",
      });
      const plaintextDec = new Ddu64Node(undefined, undefined, {
        checksum: true, // default plaintext scope
        encryptionKey: "k",
      });
      const encoded = outputEnc.encode("scope mismatch should fail");
      expect(() => plaintextDec.decode(encoded)).toThrow();
    });

    it("default (plaintext) scope remains the default and round-trips", () => {
      const enc = new Ddu64Node(undefined, undefined, { checksum: true });
      expect(enc.decode(enc.encode("default scope"))).toBe("default scope");
    });
  });

  describe("createEncoderObfuscationLayer (encoder-compatible alphabet)", () => {
    it("round-trips strings containing footer markers and digits", () => {
      const layer = createEncoderObfuscationLayer(["A", "B", "C", "D"], "X");
      const input = "ABCDENC123V4"; // 마커(ENC, V4) + 숫자 포함
      expect(layer.deobfuscate(layer.obfuscate(input))).toBe(input);
    });

    it("plain createObfuscationLayer throws on marker/digit chars (documents the difference)", () => {
      const layer = createObfuscationLayer(["A", "B", "C", "D"], "X");
      expect(() => layer.obfuscate("ABCDENC123V4")).toThrow();
    });
  });
});
