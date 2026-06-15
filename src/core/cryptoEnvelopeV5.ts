/**
 * 암호화 envelope v5 — self-describing KDF 메타데이터.
 *
 * V4까지의 암호화 payload는 `IV(12) │ authTag(16) │ ciphertext`만 담고, 키 파생
 * 파라미터(알고리즘/salt/iterations/hash)는 와이어에 기록되지 않았습니다. 따라서
 * 디코더가 파라미터를 별도로 알아야 했고(마이그레이션 footgun), 기본값 변경이 곧
 * 호환성 파괴였습니다.
 *
 * V5는 KDF 메타데이터를 payload 앞에 자기기술로 싣고 AES-GCM AAD로 인증합니다:
 *
 * ```
 * KDF_META │ IV(12) │ authTag(16) │ ciphertext(N)
 * ```
 *
 * KDF_META 레이아웃(고정 7바이트 + salt):
 * ```
 * [0]      algId      (0=sha256, 1=pbkdf2)
 * [1..4]   iterations (uint32 BE; sha256은 0)
 * [5]      hashId     (0=SHA-256, 1=SHA-384, 2=SHA-512)
 * [6]      saltLen    (uint8, 0..255)
 * [7..]    salt       (saltLen bytes)
 * ```
 *
 * salt는 **인스턴스(키) 단위 랜덤**으로 1회 생성해 envelope에 동봉합니다(메시지마다
 * 재도출하지 않으므로 키 해시 캐시가 유지되어 성능 저하가 없습니다). 메시지 유일성은
 * AES-GCM IV(매 메시지 랜덤)가 담당합니다.
 *
 * 이 모듈은 순수·결정론적입니다(암호 연산 없음). encode/decode 파이프라인 활성화는
 * 별도 단계에서 이 프리미티브를 사용합니다.
 *
 * @module core/cryptoEnvelopeV5
 */

import type { KeyDerivationAlgorithm } from "./types.js";

/** 암호화 payload 파이프라인 v5 마커(footer에 부착). */
export const PIPELINE_V5_MARKER = "V5";

/** KDF_META 고정 prefix 길이(salt 제외). */
export const KDF_META_FIXED_BYTES = 7;

/** 권장 최소 salt 길이(바이트). */
export const MIN_SALT_BYTES = 16;

export type Pbkdf2HashName = "SHA-256" | "SHA-384" | "SHA-512";

export interface KdfMetaV5 {
  algorithm: KeyDerivationAlgorithm;
  /** PBKDF2 반복 횟수. sha256에서는 무시(0으로 직렬화). */
  iterations: number;
  hash: Pbkdf2HashName;
  salt: Uint8Array;
}

// ─── ID 매핑 ─────────────────────────────────────────────────────────────────

const ALG_TO_ID: Record<KeyDerivationAlgorithm, number> = { sha256: 0, pbkdf2: 1 };
const ID_TO_ALG: Record<number, KeyDerivationAlgorithm> = { 0: "sha256", 1: "pbkdf2" };

const HASH_TO_ID: Record<Pbkdf2HashName, number> = {
  "SHA-256": 0,
  "SHA-384": 1,
  "SHA-512": 2,
};
const ID_TO_HASH: Record<number, Pbkdf2HashName> = {
  0: "SHA-256",
  1: "SHA-384",
  2: "SHA-512",
};

// ─── 직렬화 ──────────────────────────────────────────────────────────────────

/**
 * KDF 메타데이터를 V5 바이트 레이아웃으로 직렬화합니다.
 *
 * @throws salt 길이가 0..255를 벗어나거나 알고리즘/해시가 미지원이면 RangeError
 */
export function encodeKdfMetaV5(meta: KdfMetaV5): Uint8Array {
  const algId = ALG_TO_ID[meta.algorithm];
  if (algId === undefined) {
    throw new RangeError(`[Ddu64 v5] Unsupported KDF algorithm: ${String(meta.algorithm)}`);
  }
  const hashId = HASH_TO_ID[meta.hash];
  if (hashId === undefined) {
    throw new RangeError(`[Ddu64 v5] Unsupported PBKDF2 hash: ${String(meta.hash)}`);
  }
  if (meta.salt.length > 255) {
    throw new RangeError(`[Ddu64 v5] salt too long: ${meta.salt.length} (max 255)`);
  }
  if (!Number.isInteger(meta.iterations) || meta.iterations < 0 || meta.iterations > 0xffffffff) {
    throw new RangeError(`[Ddu64 v5] iterations out of range: ${meta.iterations}`);
  }

  const out = new Uint8Array(KDF_META_FIXED_BYTES + meta.salt.length);
  out[0] = algId;
  out[1] = (meta.iterations >>> 24) & 0xff;
  out[2] = (meta.iterations >>> 16) & 0xff;
  out[3] = (meta.iterations >>> 8) & 0xff;
  out[4] = meta.iterations & 0xff;
  out[5] = hashId;
  out[6] = meta.salt.length;
  out.set(meta.salt, KDF_META_FIXED_BYTES);
  return out;
}

export interface DecodeKdfMetaResult {
  meta: KdfMetaV5;
  /** KDF_META가 차지한 총 바이트 수(이후 IV가 시작). */
  bytesRead: number;
}

/**
 * V5 payload 앞부분에서 KDF 메타데이터를 파싱합니다.
 *
 * @param bytes - 최소 KDF_META + IV(12) + authTag(16)를 담은 payload 바이트
 * @throws 길이 부족·미지원 ID·salt 범위 초과 시 RangeError
 */
export function decodeKdfMetaV5(bytes: Uint8Array): DecodeKdfMetaResult {
  if (bytes.length < KDF_META_FIXED_BYTES) {
    throw new RangeError("[Ddu64 v5] KDF metadata truncated");
  }
  const algorithm = ID_TO_ALG[bytes[0]];
  if (algorithm === undefined) {
    throw new RangeError(`[Ddu64 v5] Unknown KDF algId: ${bytes[0]}`);
  }
  const iterations = (bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4];
  const hash = ID_TO_HASH[bytes[5]];
  if (hash === undefined) {
    throw new RangeError(`[Ddu64 v5] Unknown hashId: ${bytes[5]}`);
  }
  const saltLen = bytes[6];
  const saltEnd = KDF_META_FIXED_BYTES + saltLen;
  if (bytes.length < saltEnd) {
    throw new RangeError("[Ddu64 v5] KDF salt truncated");
  }
  const salt = bytes.subarray(KDF_META_FIXED_BYTES, saltEnd);
  return {
    meta: { algorithm, iterations: iterations >>> 0, hash, salt },
    bytesRead: saltEnd,
  };
}

// ─── AAD ─────────────────────────────────────────────────────────────────────

const aadEncoder = /* @__PURE__ */ new TextEncoder();

/**
 * V5 AES-GCM AAD를 생성합니다. 와이어 버전·압축 알고리즘과 **KDF_META 전체**를
 * 인증 영역에 포함해, 메타데이터 변조·스플라이싱을 차단합니다.
 *
 * @param compressionAlgorithm - 압축 알고리즘(없으면 "none")
 * @param kdfMetaBytes - `encodeKdfMetaV5` 결과
 */
export function buildV5EncryptionAAD(
  compressionAlgorithm: "deflate" | "brotli" | undefined,
  kdfMetaBytes: Uint8Array,
): Uint8Array {
  const prefix = aadEncoder.encode(
    `ddunigma:wire:v5;enc=1;compress=${compressionAlgorithm ?? "none"};kdf=`,
  );
  const aad = new Uint8Array(prefix.length + kdfMetaBytes.length);
  aad.set(prefix, 0);
  aad.set(kdfMetaBytes, prefix.length);
  return aad;
}
