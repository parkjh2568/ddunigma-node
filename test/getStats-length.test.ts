/**
 * getStats 길이 정확성 가드 (property-based).
 *
 * `getStats`는 성능을 위해 실제 AES-GCM 연산을 생략하고 길이만 정확한 더미 암호화를 사용한다.
 * 이 테스트는 검증 대상 옵션 조합에서 `getStats(...).encodedSize`가 실제 `encode(...).length`와
 * 출력 문자 수가 일치함을 고정하여, 통계 경량화 경로가 와이어 길이 산출 로직과 어긋나지 않도록 보장한다.
 *
 * 압축은 실제로 시도하고 이득이 있을 때만 적용한다. 암호화 시 그 단계의 바이트 길이에
 * AES-GCM의 고정 28바이트 overhead를 더한다.
 * 기본 난독화는 문자 수를 보존하므로 더미 암호문으로도 길이가 정확하다. 사용자 정의 난독화는
 * 실제로 실행하지만, 암호화와 함께 쓰는 가변 길이 변환은 실제 암호문과 통계 길이가 다를 수 있다.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
// 동기 암호화·압축 통계는 adapter가 포함된 secure 진입점으로 검증합니다.
import { Ddu64Secure } from "../src/Ddu64Secure.js";
import { DduSetSymbol, type DduProgressInfo } from "../src/core/types.js";

const NUM_RUNS = 60;
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** 테스트할 인코더 팩토리 (pow2 프리셋 / base64 네이티브 fast-path / URL-safe / 암호화 키 보유) */
const encoderFactories: Array<{ name: string; make: () => Ddu64Secure }> = [
  {
    name: "DDU preset + key",
    make: () => new Ddu64Secure(undefined, undefined, { encryptionKey: "stats-key" }),
  },
  {
    name: "DDU preset + key + urlSafe",
    make: () =>
      new Ddu64Secure(undefined, undefined, { encryptionKey: "stats-key", urlSafe: true }),
  },
  {
    name: "ONECHARSET + key",
    make: () =>
      new Ddu64Secure(undefined, undefined, {
        dduSetSymbol: DduSetSymbol.ONECHARSET,
        encryptionKey: "stats-key",
      }),
  },
  {
    name: "base64 positional + key",
    make: () => new Ddu64Secure(BASE64, "=", { encryptionKey: "stats-key" }),
  },
  {
    name: "DDU_V1 + key",
    make: () =>
      new Ddu64Secure(undefined, undefined, {
        dduSetSymbol: DduSetSymbol.DDU_V1,
        encryptionKey: "stats-key",
      }),
  },
];

/** 호출별 옵션 임의 생성기 (encode/getStats에 동일하게 전달) */
const optionsArb = fc.record({
  encrypt: fc.boolean(),
  compress: fc.boolean(),
  compressionAlgorithm: fc.constantFrom("deflate" as const, "brotli" as const),
  checksum: fc.boolean(),
  checksumScope: fc.constantFrom("plaintext" as const, "output" as const),
  obfuscate: fc.boolean(),
  chunkSize: fc.option(fc.integer({ min: 1, max: 16 }), { nil: undefined }),
});

describe("getStats encoded length accuracy (property)", () => {
  it.each([false, true])(
    "reports the original UTF-8 size before compression with async=%s",
    async (asyncMode) => {
      const input = "\uFEFF한글🚀".repeat(64);
      const originalSize = new TextEncoder().encode(input).length;
      const encoder = new Ddu64Secure({ compress: true });
      const stats = asyncMode ? await encoder.getStatsAsync(input) : encoder.getStats(input);
      expect(stats.originalSize).toBe(originalSize);
      expect(stats.compressedSize).toBeLessThan(originalSize);
      expect(stats.compressionRatio).toBe(stats.compressedSize! / originalSize);
      expect(stats.expansionRatio).toBe(stats.encodedSize / originalSize);
    },
  );

  it.each([false, true])(
    "executes custom obfuscation and progress callbacks with async=%s",
    async (asyncMode) => {
      let transformations = 0;
      const encoder = new Ddu64Secure({
        obfuscate: true,
        obfuscationLayerFactory: () => ({
          obfuscate(input) {
            transformations++;
            return input + "가나다";
          },
          deobfuscate(input) {
            return input.slice(0, -3);
          },
        }),
      });
      const input = "custom stats";
      const encoded = encoder.encode(input);
      const stages: string[] = [];
      const options = {
        onProgress: ({ stage }: DduProgressInfo) => {
          if (stage) stages.push(stage);
        },
      };
      const stats = asyncMode
        ? await encoder.getStatsAsync(input, options)
        : encoder.getStats(input, options);
      expect(stats.encodedSize).toBe(encoded.length);
      expect(transformations).toBe(2);
      expect(stages).toContain("done");
    },
  );

  for (const { name, make } of encoderFactories) {
    it(`matches encode().length across option combos — ${name}`, () => {
      const encoder = make();
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 256 }), optionsArb, (bytes, opts) => {
          const data = new Uint8Array(bytes);
          // 통계 경량화 경로(더미 암호화)와 실제 인코딩의 와이어 길이가 동일해야 한다.
          const statsLen = encoder.getStats(data, opts).encodedSize;
          const realLen = encoder.encode(data, opts).length;
          expect(statsLen).toBe(realLen);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  }

  it("matches for plain (no-key) encoder without encryption", () => {
    const encoder = new Ddu64Secure();
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 256 }), optionsArb, (bytes, opts) => {
        const data = new Uint8Array(bytes);
        expect(encoder.getStats(data, opts).encodedSize).toBe(encoder.encode(data, opts).length);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
