/**
 * 핵심 기능 빠른 검증 (smoke).
 *
 * 이전에는 모듈 로드 시점에 encode/decode를 실행하고 console로 결과를 출력한 뒤 동적으로
 * test()를 등록하는 구조였습니다. CI 로그를 흐리고 표준 패턴이 아니라 일반 describe/it로
 * 전환했습니다(시나리오는 동일하게 보존).
 */

import { describe, it, expect } from "vitest";
// 6.0: compress 옵션은 secure 진입점에서만 노출되므로 secure 진입점의 Ddu64를 사용.
import { Ddu64 } from "../secure.js";

const BASE64_CHARS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"];

describe("quick smoke — 기본 인코딩/디코딩", () => {
  const encoder = new Ddu64(BASE64_CHARS, "=");
  it.each([
    ["영문", "Hello World!"],
    ["한글", "안녕하세요"],
    ["혼합", "Hello안녕123!😀"],
  ])("round-trips %s", (_name, data) => {
    expect(encoder.decode(encoder.encode(data))).toBe(data);
  });
});

describe("quick smoke — 멀티바이트 비 2의 제곱수 charset", () => {
  it("round-trips with a 3-char Hangul charset", () => {
    const encoder = new Ddu64("우따야", "뭐", { usePowerOfTwo: false });
    const data = "안녕하세요 Hello!";
    expect(encoder.decode(encoder.encode(data))).toBe(data);
  });
});

describe("quick smoke — 중복 문자 및 최소 길이 검증", () => {
  it("rejects duplicate characters", () => {
    expect(() => new Ddu64("우따야야", "뭐", { throwOnError: true })).toThrow(/duplicate/);
  });

  it("rejects a single-character charset", () => {
    expect(() => new Ddu64("A", "=", { throwOnError: true })).toThrow(/At least 2/);
  });
});

describe("quick smoke — 패딩 검증", () => {
  it("rejects negative/invalid padding input", () => {
    const encoder = new Ddu64("우따야어", "뭐");
    expect(() => encoder.decode("우따뭐-5")).toThrow(
      /Invalid padding|Invalid character|Invalid encoded bit length/,
    );
  });

  it("does not false-positive on padding-like patterns", () => {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const data = "Test data with potential padding collision patterns!";
    expect(encoder.decode(encoder.encode(data))).toBe(data);
  });

  it("handles a numeric paddingChar without collision", () => {
    const encoder = new Ddu64(["a", "b", "c", "d", "e", "f", "g", "h"], "1");
    expect(encoder.decode(encoder.encode("A"))).toBe("A");
  });
});

describe("quick smoke — 다양한 charset 크기", () => {
  it("round-trips a 64-char (2^6) charset", () => {
    const chars = Array.from({ length: 64 }, (_, i) => String.fromCharCode(0x4e00 + i));
    const encoder = new Ddu64(chars, "뭐");
    const data = "64개 charset";
    expect(encoder.decode(encoder.encode(data))).toBe(data);
  });

  it("round-trips a 100-char (non-power-of-two) charset", () => {
    const chars = Array.from({ length: 100 }, (_, i) => String.fromCharCode(0x5000 + i));
    const encoder = new Ddu64(chars, "뭐", { usePowerOfTwo: false });
    const data = "100개 charset";
    expect(encoder.decode(encoder.encode(data))).toBe(data);
  });
});

describe("quick smoke — 바이너리 데이터 (decodeToBuffer)", () => {
  const encoder = new Ddu64(BASE64_CHARS, "=");

  it("round-trips all-0xFF bytes", () => {
    const buffer = Buffer.alloc(50, 0xff);
    expect(buffer.equals(encoder.decodeToBuffer(encoder.encode(buffer)))).toBe(true);
  });

  it("round-trips a repeating (0xAA, 0x55) pattern", () => {
    const buffer = Buffer.from([0xaa, 0x55].flatMap((b) => Array(25).fill(b)));
    expect(buffer.equals(encoder.decodeToBuffer(encoder.encode(buffer)))).toBe(true);
  });
});

describe("quick smoke — 에러 메시지 / getCharSetInfo", () => {
  it("prefixes constructor errors", () => {
    expect(() => new Ddu64("ABC", undefined as never, { throwOnError: true })).toThrow(
      /\[Ddu64 Constructor\]/,
    );
  });

  it("reports charset info", () => {
    const info = new Ddu64(BASE64_CHARS, "=").getCharSetInfo();
    expect(info.charSet.length).toBe(64);
    expect(info.paddingChar).toBe("=");
    expect(info.bitLength).toBe(6);
    expect(info.usePowerOfTwo).toBe(true);
  });
});

describe("quick smoke — Fast Path 및 패딩 비트", () => {
  const encoder = new Ddu64(BASE64_CHARS, "=");

  it("round-trips via the Base64 fast path", () => {
    const data = "FastPathTest123!@#";
    expect(encoder.decode(encoder.encode(data))).toBe(data);
  });

  it("computes padding bits precisely for a single byte", () => {
    expect(encoder.decode(encoder.encode("A"))).toBe("A");
  });
});

describe("quick smoke — 압축(compress) 옵션", () => {
  const encoder = new Ddu64(BASE64_CHARS, "=");

  it("round-trips compressed text", () => {
    const data = "Hello World! This is a test for compression.";
    expect(encoder.decode(encoder.encode(data, { compress: true }))).toBe(data);
  });

  it("round-trips compressed decodeToBuffer", () => {
    const data = "Buffer 압축 테스트 데이터입니다.";
    expect(encoder.decodeToBuffer(encoder.encode(data, { compress: true })).toString("utf-8")).toBe(
      data,
    );
  });

  it("round-trips compressed Hangul", () => {
    const data = "안녕하세요! 반갑습니다. ".repeat(30);
    expect(encoder.decode(encoder.encode(data, { compress: true }))).toBe(data);
  });

  it("round-trips an empty string with compression", () => {
    expect(encoder.decode(encoder.encode("", { compress: true }))).toBe("");
  });

  it("decodes non-compressed data unchanged", () => {
    const data = "Normal encoding without compression";
    expect(encoder.decode(encoder.encode(data))).toBe(data);
  });

  it("round-trips compressed binary data", () => {
    const buffer = Buffer.alloc(500, 0xab);
    expect(buffer.equals(encoder.decodeToBuffer(encoder.encode(buffer, { compress: true })))).toBe(
      true,
    );
  });

  it("round-trips compression on a different charset", () => {
    const koreanEncoder = new Ddu64("우따야", "뭐", { usePowerOfTwo: false });
    const data = "다른 charset에서도 압축이 잘 되는지 테스트합니다!";
    expect(koreanEncoder.decode(koreanEncoder.encode(data, { compress: true }))).toBe(data);
  });

  it("round-trips a large compressed payload", () => {
    const data = "Lorem ipsum dolor sit amet. ".repeat(1000);
    expect(encoder.decode(encoder.encode(data, { compress: true }))).toBe(data);
  });

  it("round-trips numeric paddingChar with compression", () => {
    const numPadEncoder = new Ddu64(BASE64_CHARS.slice(0, 8), "9");
    const data = "AAAA".repeat(200);
    expect(numPadEncoder.decode(numPadEncoder.encode(data, { compress: true }))).toBe(data);
  });
});

describe("quick smoke — 보안/안정성 제한", () => {
  it("enforces maxDecodedBytes", () => {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const encoded = encoder.encode("A".repeat(1024));
    expect(() => encoder.decodeToBuffer(encoded, { maxDecodedBytes: 16 })).toThrow(/exceeds limit/);
  });

  it("enforces maxDecompressedBytes", () => {
    const encoder = new Ddu64(BASE64_CHARS, "=", { compress: true });
    const encoded = encoder.encode("AAAAABBBBB".repeat(2000), { compress: true });
    expect(() => encoder.decodeToBuffer(encoded, { maxDecompressedBytes: 64 })).toThrow(
      /exceeds limit/,
    );
  });
});

describe("quick smoke — 성능 퀵", () => {
  it("round-trips 10KB", () => {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const data = "A".repeat(10000);
    expect(encoder.decode(encoder.encode(data))).toBe(data);
  });

  it("round-trips 100 iterations on a non-power-of-two charset", () => {
    const encoder = new Ddu64("우따야", "뭐", { usePowerOfTwo: false });
    for (let i = 0; i < 100; i++) {
      expect(encoder.decode(encoder.encode("반복"))).toBe("반복");
    }
  });
});
