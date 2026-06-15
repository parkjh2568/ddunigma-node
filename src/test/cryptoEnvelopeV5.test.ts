/**
 * 암호화 envelope v5 wireFormat 프리미티브 spec-lock 테스트.
 *
 * KDF_META 직렬화/파싱·AAD는 순수·결정론적이므로 고정 바이트 벡터로 포맷을 잠급니다.
 * 이 벡터가 깨지면 V5 와이어 포맷이 변경된 것이며 하위호환을 검토해야 합니다.
 */

import { describe, expect, it } from "vitest";
import {
  KDF_META_FIXED_BYTES,
  PIPELINE_V5_MARKER,
  buildV5EncryptionAAD,
  decodeKdfMetaV5,
  encodeKdfMetaV5,
  type KdfMetaV5,
} from "../core/cryptoEnvelopeV5.js";

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("cryptoEnvelopeV5 wire-format primitives (spec lock)", () => {
  it("marker and fixed prefix length are stable", () => {
    expect(PIPELINE_V5_MARKER).toBe("V5");
    expect(KDF_META_FIXED_BYTES).toBe(7);
  });

  describe("encodeKdfMetaV5 — fixed byte layout", () => {
    it("pbkdf2 / SHA-256 / 210000 / 4-byte salt", () => {
      const meta: KdfMetaV5 = {
        algorithm: "pbkdf2",
        iterations: 210_000,
        hash: "SHA-256",
        salt: new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]),
      };
      // algId=01 | iter=00033450(210000 BE) | hashId=00 | saltLen=04 | salt=aabbccdd
      expect(hex(encodeKdfMetaV5(meta))).toBe("01000334500004aabbccdd");
    });

    it("sha256 / 0 iterations / SHA-512 / empty salt", () => {
      const meta: KdfMetaV5 = {
        algorithm: "sha256",
        iterations: 0,
        hash: "SHA-512",
        salt: new Uint8Array(0),
      };
      // algId=00 | iter=00000000 | hashId=02 | saltLen=00
      expect(hex(encodeKdfMetaV5(meta))).toBe("00000000000200");
    });

    it("max iterations (0xffffffff) and 32-byte salt round-trips", () => {
      const salt = new Uint8Array(32).map((_, i) => i + 1);
      const meta: KdfMetaV5 = {
        algorithm: "pbkdf2",
        iterations: 0xffffffff,
        hash: "SHA-384",
        salt,
      };
      const round = decodeKdfMetaV5(encodeKdfMetaV5(meta));
      expect(round.meta.algorithm).toBe("pbkdf2");
      expect(round.meta.iterations).toBe(0xffffffff);
      expect(round.meta.hash).toBe("SHA-384");
      expect(Array.from(round.meta.salt)).toEqual(Array.from(salt));
      expect(round.bytesRead).toBe(KDF_META_FIXED_BYTES + 32);
    });
  });

  describe("encode/parse round-trip", () => {
    const cases: KdfMetaV5[] = [
      {
        algorithm: "pbkdf2",
        iterations: 600_000,
        hash: "SHA-256",
        salt: new Uint8Array(16).fill(7),
      },
      { algorithm: "sha256", iterations: 0, hash: "SHA-256", salt: new Uint8Array(0) },
      { algorithm: "pbkdf2", iterations: 1, hash: "SHA-512", salt: new Uint8Array([255]) },
    ];
    it.each(cases)("round-trips %o", (meta) => {
      const decoded = decodeKdfMetaV5(encodeKdfMetaV5(meta));
      expect(decoded.meta.algorithm).toBe(meta.algorithm);
      expect(decoded.meta.iterations).toBe(meta.iterations);
      expect(decoded.meta.hash).toBe(meta.hash);
      expect(Array.from(decoded.meta.salt)).toEqual(Array.from(meta.salt));
    });

    it("parse ignores trailing bytes (IV/tag/ciphertext) after KDF_META", () => {
      const meta = encodeKdfMetaV5({
        algorithm: "pbkdf2",
        iterations: 210_000,
        hash: "SHA-256",
        salt: new Uint8Array(16).fill(9),
      });
      const payload = new Uint8Array(meta.length + 12 + 16 + 5);
      payload.set(meta, 0);
      const { bytesRead, meta: parsed } = decodeKdfMetaV5(payload);
      expect(bytesRead).toBe(meta.length);
      expect(parsed.salt.length).toBe(16);
    });
  });

  describe("validation", () => {
    it("rejects salt longer than 255", () => {
      expect(() =>
        encodeKdfMetaV5({
          algorithm: "pbkdf2",
          iterations: 1,
          hash: "SHA-256",
          salt: new Uint8Array(256),
        }),
      ).toThrow(/salt too long/);
    });

    it("rejects out-of-range iterations", () => {
      expect(() =>
        encodeKdfMetaV5({
          algorithm: "pbkdf2",
          iterations: 0x1_0000_0000,
          hash: "SHA-256",
          salt: new Uint8Array(0),
        }),
      ).toThrow(/iterations out of range/);
    });

    it("rejects truncated metadata on decode", () => {
      expect(() => decodeKdfMetaV5(new Uint8Array(3))).toThrow(/truncated/);
    });

    it("rejects truncated salt on decode", () => {
      const bytes = new Uint8Array(KDF_META_FIXED_BYTES);
      bytes[0] = 1; // pbkdf2
      bytes[5] = 0; // SHA-256
      bytes[6] = 20; // saltLen=20 but no salt bytes follow
      expect(() => decodeKdfMetaV5(bytes)).toThrow(/salt truncated/);
    });

    it("rejects unknown algId / hashId", () => {
      const bad = new Uint8Array(KDF_META_FIXED_BYTES);
      bad[0] = 99;
      expect(() => decodeKdfMetaV5(bad)).toThrow(/algId/);
      const bad2 = new Uint8Array(KDF_META_FIXED_BYTES);
      bad2[0] = 1;
      bad2[5] = 99;
      expect(() => decodeKdfMetaV5(bad2)).toThrow(/hashId/);
    });
  });

  describe("buildV5EncryptionAAD", () => {
    it("includes version, compression, and the full KDF_META bytes", () => {
      const kdf = encodeKdfMetaV5({
        algorithm: "pbkdf2",
        iterations: 210_000,
        hash: "SHA-256",
        salt: new Uint8Array([1, 2, 3, 4]),
      });
      const aad = buildV5EncryptionAAD("deflate", kdf);
      const text = new TextDecoder().decode(aad);
      expect(text.startsWith("ddunigma:wire:v5;enc=1;compress=deflate;kdf=")).toBe(true);
      // 마지막 kdf.length 바이트는 KDF_META와 정확히 일치(인증 대상)
      expect(Array.from(aad.subarray(aad.length - kdf.length))).toEqual(Array.from(kdf));
    });

    it("uses 'none' when no compression and differs by algorithm (tamper-evident binding)", () => {
      const kdf = encodeKdfMetaV5({
        algorithm: "pbkdf2",
        iterations: 1,
        hash: "SHA-256",
        salt: new Uint8Array(0),
      });
      const none = new TextDecoder().decode(buildV5EncryptionAAD(undefined, kdf));
      const brotli = new TextDecoder().decode(buildV5EncryptionAAD("brotli", kdf));
      expect(none).toContain("compress=none");
      expect(brotli).toContain("compress=brotli");
      expect(none).not.toBe(brotli);
    });
  });
});
