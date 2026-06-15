/**
 * V5 KDF envelope 통합 테스트 (opt-in `encryptionVersion: 5`).
 *
 * 자기기술 KDF: 디코더는 wire의 salt/alg/iter/hash로 키를 도출하므로 인코더와 별도
 * 설정 없이 복호화할 수 있어야 합니다. iterations는 테스트 속도를 위해 낮춥니다
 * (자기기술이라 디코드가 wire 값을 따름).
 */

import { describe, expect, it } from "vitest";
import { Ddu64Node } from "../Ddu64Node.js";
import { Ddu64DecryptionError } from "../core/errors.js";

const KD = { iterations: 10_000 } as const;

describe("V5 KDF envelope integration", () => {
  it("sync round-trips (V5 opt-in)", () => {
    const ddu = new Ddu64Node({ encryptionKey: "secret", encryptionVersion: 5, keyDerivation: KD });
    const input = "self-describing KDF 비밀 데이터";
    expect(ddu.decode(ddu.encode(input))).toBe(input);
  });

  it("async round-trips (V5 opt-in)", async () => {
    const ddu = new Ddu64Node({ encryptionKey: "secret", encryptionVersion: 5, keyDerivation: KD });
    const input = "async v5 payload";
    expect(await ddu.decodeAsync(await ddu.encodeAsync(input))).toBe(input);
  });

  it("V5 + compress round-trips", () => {
    const ddu = new Ddu64Node({
      encryptionKey: "secret",
      encryptionVersion: 5,
      compress: true,
      keyDerivation: KD,
    });
    const input = "x".repeat(4096);
    expect(ddu.decode(ddu.encode(input))).toBe(input);
  });

  it("cross-instance: decoder reads KDF params from the wire (no salt/version config)", () => {
    const enc = new Ddu64Node({ encryptionKey: "k", encryptionVersion: 5, keyDerivation: KD });
    const encoded = enc.encode("portable v5");
    // 디코더는 키만 안다(버전/salt/iter 미지정). 자기기술 메타로 복호화되어야 함.
    const dec = new Ddu64Node({ encryptionKey: "k" });
    expect(dec.decode(encoded)).toBe("portable v5");
  });

  it("wrong key fails authentication", () => {
    const enc = new Ddu64Node({ encryptionKey: "right", encryptionVersion: 5, keyDerivation: KD });
    const encoded = enc.encode("secret");
    const dec = new Ddu64Node({ encryptionKey: "wrong" });
    expect(() => dec.decode(encoded)).toThrow(Ddu64DecryptionError);
  });

  it("binary round-trip and stats length matches actual encode length (V5)", () => {
    const ddu = new Ddu64Node({ encryptionKey: "k", encryptionVersion: 5, keyDerivation: KD });
    const data = new Uint8Array(300).map((_, i) => (i * 7 + 3) & 0xff);
    const encoded = ddu.encode(data);
    expect(ddu.decodeToUint8Array(encoded)).toEqual(data);
    // getStats는 실제 암호화 없이 길이만 산출 — V5 KDF_META 길이를 포함해 일치해야 함
    expect(ddu.getStats(data).encodedSize).toBe(encoded.length);
  });

  it("default instance (V4) still round-trips and stays V4", () => {
    const v4 = new Ddu64Node({ encryptionKey: "k", keyDerivation: KD });
    const encoded = v4.encode("v4 payload");
    expect(v4.decode(encoded)).toBe("v4 payload");
    // V5 인스턴스가 V4 출력을 디코드(역호환)
    const v5 = new Ddu64Node({ encryptionKey: "k", encryptionVersion: 5, keyDerivation: KD });
    expect(v5.decode(encoded)).toBe("v4 payload");
  });

  it("tampering with the encrypted body fails authentication", () => {
    const enc = new Ddu64Node({ encryptionKey: "k", encryptionVersion: 5, keyDerivation: KD });
    const encoded = enc.encode("authentic");
    // 첫 글자를 charset 내 다른 글자로 바꿔 본문 변조
    const chars = [...encoded];
    chars[0] = chars[0] === "뜌" ? "땨" : "뜌";
    expect(() => enc.decode(chars.join(""))).toThrow();
  });
});
