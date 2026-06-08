/**
 * getStats 길이 정확성 가드 (property-based).
 *
 * `getStats`는 성능을 위해 실제 AES-GCM 연산을 생략하고 길이만 정확한 더미 암호화를 사용한다.
 * 이 테스트는 모든 옵션 조합에서 `getStats(...).encodedSize`가 실제 `encode(...).length`와
 * 바이트 단위로 일치함을 고정하여, 통계 경량화 경로가 와이어 길이 산출 로직과 어긋나지 않도록 보장한다.
 *
 * 암호화 출력 길이(평문+28), 비트팩/푸터/체크섬/난독화/URL-safe/청킹 길이는 모두 입력 바이트
 * "길이"에만 의존(값 무관)하므로 더미 암호문으로도 길이가 정확해야 한다.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { Ddu64Node } from "../Ddu64Node.js";
import { DduSetSymbol, type DduOptions } from "../core/types.js";

const NUM_RUNS = 60;
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** 테스트할 인코더 팩토리 (pow2 프리셋 / base64 네이티브 fast-path / URL-safe / 암호화 키 보유) */
const encoderFactories: Array<{ name: string; make: () => Ddu64Node }> = [
  {
    name: "DDU preset + key",
    make: () => new Ddu64Node(undefined, undefined, { encryptionKey: "stats-key" }),
  },
  {
    name: "DDU preset + key + urlSafe",
    make: () => new Ddu64Node(undefined, undefined, { encryptionKey: "stats-key", urlSafe: true }),
  },
  {
    name: "ONECHARSET + key",
    make: () =>
      new Ddu64Node(undefined, undefined, {
        dduSetSymbol: DduSetSymbol.ONECHARSET,
        encryptionKey: "stats-key",
      }),
  },
  {
    name: "base64 positional + key",
    make: () => new Ddu64Node(BASE64, "=", { encryptionKey: "stats-key" }),
  },
  {
    name: "DDU_V1 + key",
    make: () =>
      new Ddu64Node(undefined, undefined, {
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

function validStatsOptions(opts: DduOptions): DduOptions {
  if (opts.obfuscate && opts.encrypt === false) {
    return { ...opts, obfuscate: false };
  }
  return opts;
}

describe("getStats encoded length accuracy (property)", () => {
  for (const { name, make } of encoderFactories) {
    it(`matches encode().length across option combos — ${name}`, () => {
      const encoder = make();
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 256 }), optionsArb, (bytes, opts) => {
          const data = new Uint8Array(bytes);
          const safeOpts = validStatsOptions(opts);
          // 통계 경량화 경로(더미 암호화)와 실제 인코딩의 와이어 길이가 동일해야 한다.
          const statsLen = encoder.getStats(data, safeOpts).encodedSize;
          const realLen = encoder.encode(data, safeOpts).length;
          expect(statsLen).toBe(realLen);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  }

  it("matches for plain (no-key) encoder without encryption", () => {
    const encoder = new Ddu64Node();
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 256 }), optionsArb, (bytes, opts) => {
        const data = new Uint8Array(bytes);
        // 키가 없으면 encrypt 옵션은 무시되므로 obfuscate도 비활성화한다.
        const safeOpts = { ...opts, obfuscate: false };
        expect(encoder.getStats(data, safeOpts).encodedSize).toBe(
          encoder.encode(data, safeOpts).length,
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
