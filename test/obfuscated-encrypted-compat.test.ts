/**
 * "암호문 + 난독" 데이터 디코딩 회귀 테스트.
 *
 * 암호화는 IV가 랜덤이라 인코딩 자체는 비결정적이지만, 저장된 암호문+난독 인코딩
 * 문자열은 동일 키로 **항상 동일 평문을 복원**해야 한다(wire format 무변경 보장).
 * 진입점 구조와 무관하게 복원 결과가 동일함을 고정 벡터로 검증한다.
 */
import { describe, it, expect } from "vitest";
import { Ddu64Secure } from "../src/Ddu64Secure.js";
import obfEncVectors from "./fixtures/obfuscated-encrypted-vectors.json";

interface ObfEncVector {
  key: string;
  plaintext: string;
  encoded: string;
}

const vectors = (obfEncVectors as { vectors: ObfEncVector[] }).vectors;

describe("암호문 + 난독 디코딩 회귀", () => {
  it("고정 벡터가 1개 이상 존재한다", () => {
    expect(vectors.length).toBeGreaterThanOrEqual(1);
  });

  for (const [index, vec] of vectors.entries()) {
    it(`[${index}] 저장된 암호문+난독 벡터를 동일 키로 디코딩하면 원본 평문 복원`, () => {
      const decoder = new Ddu64Secure(undefined, undefined, {
        encryptionKey: vec.key,
        obfuscate: true,
      });
      expect(decoder.decode(vec.encoded)).toBe(vec.plaintext);
    });

    it(`[${index}] 난독 문자열 본문이 한글 음절 블록(U+AC00–U+D7A3) 범위에 속한다`, () => {
      for (const ch of vec.encoded) {
        const code = ch.codePointAt(0)!;
        expect(code).toBeGreaterThanOrEqual(0xac00);
        expect(code).toBeLessThanOrEqual(0xd7a3);
      }
    });
  }

  it("암호문+난독 라운드트립이 재인코딩 후에도 동일 평문을 복원", () => {
    const key = "obf-enc-roundtrip-key";
    const plaintext = "암호문+난독 라운드트립";
    const encoder = new Ddu64Secure(undefined, undefined, { encryptionKey: key, obfuscate: true });
    const encoded = encoder.encode(plaintext);

    const decoder = new Ddu64Secure(undefined, undefined, { encryptionKey: key, obfuscate: true });
    expect(decoder.decode(encoded)).toBe(plaintext);
  });
});
