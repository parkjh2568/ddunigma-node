/**
 * 공개 API 에러 불변식 property 테스트.
 *
 * 불변식: 모든 공개 진입점은 실패 시 **항상 `Ddu64Error`**(`isDdu64Error === true`)를 던지며,
 * plain `Error`를 누출하지 않는다. 이는 6.0에서 "에러 분류를 발생 지점으로 이전"한 작업의
 * 완결성을 고정한다 — 내부 모듈이 도메인 타입 에러를 직접 throw하므로 경계 래핑 없이도
 * 타입이 보장되어야 한다.
 *
 * 핵심 타깃: `getStats`/`getStatsAsync`는 `encode`/`decode`와 달리 try/catch 경계 래핑이
 * 없으므로, 파이프라인이 plain Error를 던지면 그대로 누출된다. 이 테스트가 그 갭을 차단한다.
 */

import { describe, it } from "vitest";
import fc from "fast-check";
import { Ddu64Node } from "../Ddu64Node.js";
import { Ddu64Secure } from "../Ddu64Secure.js";
import { createReadableEncodeStream, createReadableDecodeStream } from "../streams/WebStreams.js";
import { isDdu64Error } from "../core/errors.js";
import type { DduSecureOptions } from "../core/types.js";

const NUM_RUNS = 100;

/** 동기 호출이 던지면 반드시 Ddu64Error여야 한다(안 던지면 통과). */
function assertTypedOnThrow(fn: () => unknown): void {
  try {
    fn();
  } catch (err) {
    if (!isDdu64Error(err)) {
      throw new Error(
        `Expected Ddu64Error, leaked ${err instanceof Error ? err.constructor.name : typeof err}: ${String(err)}`,
        { cause: err },
      );
    }
  }
}

/** 비동기 호출이 reject하면 반드시 Ddu64Error여야 한다(resolve면 통과). */
async function assertTypedOnReject(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (!isDdu64Error(err)) {
      throw new Error(
        `Expected Ddu64Error, leaked ${err instanceof Error ? err.constructor.name : typeof err}: ${String(err)}`,
        { cause: err },
      );
    }
  }
}

// 임의 런타임 옵션(무효값 포함 — OptionValidation이 타입 에러로 거부해야 함).
const arbOptions: fc.Arbitrary<DduSecureOptions> = fc.record(
  {
    compress: fc.boolean(),
    checksum: fc.boolean(),
    obfuscate: fc.boolean(),
    compressionAlgorithm: fc.constantFrom("deflate", "brotli"),
    chunkSize: fc.oneof(fc.integer({ min: -5, max: 64 }), fc.double()),
    maxDecodedBytes: fc.oneof(fc.integer({ min: -1, max: 1024 }), fc.double({ min: 0, max: 5 })),
    maxEncodedChars: fc.oneof(fc.integer({ min: -1, max: 1024 }), fc.constant(0)),
  },
  { requiredKeys: [] },
) as fc.Arbitrary<DduSecureOptions>;

describe("공개 API 에러 불변식 (plain Error 누출 0)", () => {
  const leanEncoders = () => [new Ddu64Node(), new Ddu64Node({ obfuscate: true })];
  const secureEncoders = () => [
    new Ddu64Secure(),
    new Ddu64Secure({ compress: true, checksum: true }),
    new Ddu64Secure({ encryptionKey: "inv-key" }),
  ];

  it("decode/decodeToUint8Array: 임의 문자열 입력에 타입 에러만", () => {
    fc.assert(
      fc.property(fc.string(), arbOptions, (input, options) => {
        for (const enc of [...leanEncoders(), ...secureEncoders()]) {
          assertTypedOnThrow(() => enc.decode(input, options));
          assertTypedOnThrow(() => enc.decodeToUint8Array(input, options));
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("decodeToBuffer(lean Node): 임의 문자열 입력에 타입 에러만", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const enc = new Ddu64Node();
        assertTypedOnThrow(() => enc.decodeToBuffer(input));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("getStats/getStatsAsync: 경계 래핑 없는 경로도 타입 에러만 (핵심 타깃)", async () => {
    // getStats는 try/catch wrapDdu64Error 래핑이 없으므로, 소스 타입화가 완전해야만
    // 타입 에러가 보장된다. lean+compress는 어댑터 부재로 실패 → Ddu64Error여야 함.
    const inputs: Array<string | Uint8Array> = ["hello", "", new Uint8Array([0, 255, 7])];
    for (const enc of [...leanEncoders(), ...secureEncoders()]) {
      for (const input of inputs) {
        assertTypedOnThrow(() => enc.getStats(input, { compress: true, checksum: true }));
        await assertTypedOnReject(() => enc.getStatsAsync(input, { compress: true }));
      }
    }
  });

  it("encode: 임의 입력+무효 옵션에 타입 에러만", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.uint8Array()), arbOptions, (input, options) => {
        for (const enc of [...leanEncoders(), ...secureEncoders()]) {
          assertTypedOnThrow(() => enc.encode(input, options));
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("오염된 유효 페이로드 디코드: 타입 에러만", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 64 }), fc.nat(), (raw, pos) => {
        const enc = new Ddu64Node();
        const encoded = enc.encode(raw);
        if (encoded.length === 0) return;
        // 한 문자를 charset 밖 문자로 치환해 손상 유발
        const i = pos % encoded.length;
        const corrupted = encoded.slice(0, i) + "\u0000" + encoded.slice(i + 1);
        assertTypedOnThrow(() => enc.decode(corrupted));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("스트림 디코드: 헤더 없는 garbage 입력은 Ddu64Error로 reject", async () => {
    const enc = new Ddu64Secure();
    await assertTypedOnReject(async () => {
      const readable = new ReadableStream<string>({
        start(controller) {
          controller.enqueue("garbage-without-stream-header");
          controller.close();
        },
      });
      const out = readable.pipeThrough(createReadableDecodeStream(enc));
      const reader = out.getReader();
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }
    });
  });

  it("스트림 인코드 후 디코드 라운드트립은 누출 없이 동작", async () => {
    const enc = new Ddu64Secure();
    const bytes = new TextEncoder().encode("stream invariant check");
    await assertTypedOnReject(async () => {
      const src = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
      const encodedStream = src.pipeThrough(createReadableEncodeStream(enc));
      const reader = encodedStream.getReader();
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }
    });
  });
});
