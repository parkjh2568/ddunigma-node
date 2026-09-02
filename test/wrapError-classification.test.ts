/**
 * `wrapDdu64Error` 계약 테스트 (분류기 제거 후).
 *
 * 내부 모듈이 발생 지점에서 도메인 타입 에러(Ddu64XxxError)를 직접 throw하므로,
 * `wrapDdu64Error`의 메시지 키워드 추측 분류는 제거되었습니다. 이제 계약은 단순합니다:
 *  1) 이미 Ddu64Error면 그대로 통과(인스턴스 보존)
 *  2) 그 외(외부/예기치 못한 에러)는 operation 기반 fallback으로만 래핑
 *     (encode→EncodeFailed, decode→DecodeFailed, stream→StreamFailed)
 *
 * 핵심 회귀 가드: 내부처럼 보이는 메시지(`[Ddu64 ...]`)라도 더 이상 키워드로 재분류되지 않음을
 * 고정합니다. (분류 책임은 발생 지점에 있으며, 여기서 메시지 문구로 타입이 바뀌면 안 됩니다.)
 */

import { describe, it, expect } from "vitest";
import {
  Ddu64ChecksumError,
  Ddu64DecodeError,
  Ddu64EncodeError,
  Ddu64ErrorCode,
  Ddu64StreamError,
  wrapDdu64Error,
} from "../src/core/errors.js";

describe("wrapDdu64Error 계약 (passthrough + operation fallback)", () => {
  it("이미 Ddu64Error면 동일 인스턴스를 그대로 반환한다", () => {
    const original = new Ddu64ChecksumError("[Ddu64 checksum] mismatch");
    expect(wrapDdu64Error(original, "decode")).toBe(original);
    expect(wrapDdu64Error(original, "encode")).toBe(original);
    expect(wrapDdu64Error(original, "stream")).toBe(original);
  });

  it("비-Ddu64Error는 operation으로만 분류된다 (encode→EncodeFailed)", () => {
    const wrapped = wrapDdu64Error(new Error("some external failure"), "encode");
    expect(wrapped).toBeInstanceOf(Ddu64EncodeError);
    expect(wrapped.code).toBe(Ddu64ErrorCode.EncodeFailed);
  });

  it("비-Ddu64Error는 operation으로만 분류된다 (decode→DecodeFailed)", () => {
    const wrapped = wrapDdu64Error(new Error("some external failure"), "decode");
    expect(wrapped).toBeInstanceOf(Ddu64DecodeError);
    expect(wrapped.code).toBe(Ddu64ErrorCode.DecodeFailed);
  });

  it("비-Ddu64Error는 operation으로만 분류된다 (stream→StreamFailed)", () => {
    const wrapped = wrapDdu64Error(new Error("external stream glitch"), "stream");
    expect(wrapped).toBeInstanceOf(Ddu64StreamError);
    expect(wrapped.code).toBe(Ddu64ErrorCode.StreamFailed);
  });
});

describe("내부처럼 보이는 plain 메시지는 더 이상 키워드 재분류되지 않는다", () => {
  // 발생 지점에서 타입 에러를 던지므로, plain Error가 wrapDdu64Error에 도달하면
  // 키워드와 무관하게 operation fallback으로만 분류된다.
  const messages = [
    "[Ddu64 checksum] Checksum verification requested.",
    "[Ddu64 obfuscation] Character not found.",
    "[Ddu64 decode] Invalid character at 0",
    "[BitPack decode] Invalid index 99 at position 0",
    "[Ddu64 decode] Decoded output exceeds limit.",
    "[Ddu64 encrypt] Sync encryption unavailable.",
  ];

  for (const message of messages) {
    it(`decode fallback 유지: ${message.slice(0, 24)}…`, () => {
      const wrapped = wrapDdu64Error(new Error(message), "decode");
      expect(wrapped).toBeInstanceOf(Ddu64DecodeError);
      expect(wrapped.code).toBe(Ddu64ErrorCode.DecodeFailed);
    });
  }
});
