/**
 * Native Base64 fast path 회귀 테스트.
 *
 * 표준 Base64 charset + "=" 패딩 + 6비트 pow2 조합은 NativeBase64FastPath로
 * 라우팅됩니다. 디코드 결과가 Node Buffer 풀 백킹 버퍼를 공유하는 뷰가 아니라
 * 정확한 크기의 독립 복사본인지 검증합니다(인접 풀 메모리 노출 방지).
 */

import { describe, expect, it } from "vitest";
import { Ddu64Node } from "../Ddu64Node.js";

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function makeBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = (i * 37 + 11) & 0xff;
  return bytes;
}

describe("Native Base64 fast path", () => {
  const encoder = new Ddu64Node(BASE64, "=");

  it("round-trips all padding variants (len % 3 = 0,1,2)", () => {
    for (const len of [0, 1, 2, 3, 4, 5, 6, 100, 257]) {
      const input = makeBytes(len);
      const encoded = encoder.encode(input);
      const decoded = encoder.decodeToUint8Array(encoded);
      expect(decoded).toEqual(input);
    }
  });

  it("returns an exact-length, independently-owned buffer (no pooled view)", () => {
    const input = makeBytes(64);
    const decoded = encoder.decodeToUint8Array(encoder.encode(input));

    // 정확한 길이
    expect(decoded.length).toBe(input.length);
    // 풀 백킹 버퍼 공유 뷰가 아니라 정확한 크기의 독립 ArrayBuffer여야 함
    expect(decoded.byteOffset).toBe(0);
    expect(decoded.buffer.byteLength).toBe(input.length);
  });

  it("decoded result mutation does not affect subsequent decodes", () => {
    const input = makeBytes(48);
    const encoded = encoder.encode(input);

    const first = encoder.decodeToUint8Array(encoded);
    first.fill(0xff); // 결과 변조

    const second = encoder.decodeToUint8Array(encoded);
    expect(second).toEqual(input); // 독립 버퍼라 영향 없음
  });
});
