/**
 * Native Base64 fast path 회귀 테스트.
 *
 * 표준 Base64 charset + "=" 패딩 + 6비트 pow2 조합은 NativeBase64FastPath로
 * 라우팅됩니다. 디코드 결과가 Node Buffer 풀 백킹 버퍼를 공유하는 뷰가 아니라
 * 정확한 크기의 독립 복사본인지 검증합니다(인접 풀 메모리 노출 방지).
 */

import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { Ddu64Node } from "../src/Ddu64Node.js";
import { decodeNativeBase64 } from "../src/core/internal/NativeBase64FastPath.js";
import { Ddu64ErrorCode } from "../src/core/errors.js";

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function makeBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = (i * 37 + 11) & 0xff;
  return bytes;
}

describe("Native Base64 fast path", () => {
  const encoder = new Ddu64Node(BASE64, "=");

  it("preserves public decode validation and padding variants without native decoders", () => {
    const fromBase64Descriptor = Object.getOwnPropertyDescriptor(Uint8Array, "fromBase64");
    const bufferDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Buffer");
    const inputs = [0, 1, 2, 3, 4, 5, 100].map(makeBytes);
    const encoded = inputs.map((input) => encoder.encode(input));
    const zeroEncoded = encoder.encode(new Uint8Array([0]));
    const invalidMiddle = encoded[6].slice(0, 4) + "!" + encoded[6].slice(5);
    const invalidPadding = zeroEncoded.slice(0, 1) + "B" + zeroEncoded.slice(2);
    const decoded: Uint8Array[] = [];
    const errors: unknown[] = [];
    try {
      Object.defineProperty(Uint8Array, "fromBase64", { configurable: true, value: undefined });
      Object.defineProperty(globalThis, "Buffer", { configurable: true, value: undefined });
      for (const input of encoded) decoded.push(encoder.decodeToUint8Array(input));
      for (const { input, options } of [
        { input: invalidMiddle, options: undefined },
        { input: invalidPadding, options: undefined },
        { input: encoded[3], options: { maxEncodedChars: 3 } },
        { input: encoded[3], options: { maxDecodedBytes: 2 } },
      ]) {
        try {
          encoder.decodeToUint8Array(input, options);
          errors.push(undefined);
        } catch (error) {
          errors.push(error);
        }
      }
    } finally {
      if (fromBase64Descriptor) {
        Object.defineProperty(Uint8Array, "fromBase64", fromBase64Descriptor);
      } else {
        Reflect.deleteProperty(Uint8Array, "fromBase64");
      }
      if (bufferDescriptor) Object.defineProperty(globalThis, "Buffer", bufferDescriptor);
      else Reflect.deleteProperty(globalThis, "Buffer");
    }
    expect(decoded).toEqual(inputs);
    expect(errors[0]).toMatchObject({ code: Ddu64ErrorCode.DecodeFailed });
    expect((errors[0] as Error).message).toContain('Invalid character "!" at 4');
    expect(errors[1]).toMatchObject({ code: Ddu64ErrorCode.DecodeFailed });
    expect((errors[1] as Error).message).toContain("non-zero padding bits");
    expect(errors[2]).toMatchObject({ code: Ddu64ErrorCode.LimitExceeded });
    expect((errors[2] as Error).message).toContain("Encoded input exceeds limit");
    expect(errors[3]).toMatchObject({ code: Ddu64ErrorCode.LimitExceeded });
    expect((errors[3] as Error).message).toContain("Decoded output exceeds limit");
  });

  it("preserves the native method receiver and rejects invalid characters before calling it", () => {
    const fromBase64Descriptor = Object.getOwnPropertyDescriptor(Uint8Array, "fromBase64");
    const receivers: unknown[] = [];
    let nativeInput = "";
    let nativeCalls = 0;
    let decoded: Uint8Array | null;
    let invalid: Uint8Array | null;
    try {
      Object.defineProperty(Uint8Array, "fromBase64", {
        configurable: true,
        value(this: unknown, input: string) {
          receivers.push(this);
          nativeInput = input;
          nativeCalls++;
          return new Uint8Array([1, 2]);
        },
      });
      decoded = decodeNativeBase64("AQI", 2, (code) => BASE64.includes(String.fromCharCode(code)));
      invalid = decodeNativeBase64("AQ!", 2, (code) => BASE64.includes(String.fromCharCode(code)));
    } finally {
      if (fromBase64Descriptor) {
        Object.defineProperty(Uint8Array, "fromBase64", fromBase64Descriptor);
      } else {
        Reflect.deleteProperty(Uint8Array, "fromBase64");
      }
    }
    expect(decoded).toEqual(new Uint8Array([1, 2]));
    expect(receivers).toEqual([Uint8Array]);
    expect(nativeInput).toBe("AQI=");
    expect(invalid).toBeNull();
    expect(nativeCalls).toBe(1);
  });

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

  it.each(["byteLength", "byteOffset", "buffer"])(
    "encodes actual view bytes when %s is shadowed",
    async (field) => {
      for (const input of [
        new Uint8Array([9, 1, 2, 3, 9]).subarray(1, 4),
        Buffer.from([9, 1, 2, 3, 9]).subarray(1, 4),
        runInNewContext("new Uint8Array([9, 1, 2, 3, 9]).subarray(1, 4)") as Uint8Array,
      ]) {
        Object.defineProperty(input, "toBase64", { value: undefined });
        Object.defineProperty(input, field, {
          get() {
            throw new Error(`shadowed ${field} must not be read`);
          },
        });
        const expected = new Uint8Array([1, 2, 3]);
        expect(encoder.decodeToUint8Array(encoder.encode(input))).toEqual(expected);
        expect(await encoder.decodeToUint8ArrayAsync(await encoder.encodeAsync(input))).toEqual(
          expected,
        );
      }
    },
  );
});
