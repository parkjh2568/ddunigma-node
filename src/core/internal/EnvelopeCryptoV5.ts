/**
 * 암호화 envelope v5 런타임 통합 (KDF 자기기술).
 *
 * 인코드: 인스턴스 salt(미지정 시 랜덤)로 KDF_META를 만들고, payload 앞에 동봉합니다.
 *   `KDF_META │ IV │ authTag │ ciphertext`. AAD로 KDF_META를 인증합니다.
 * 디코드: payload 앞의 KDF_META를 파싱해 그 파라미터로 키를 도출(인스턴스 설정과 무관)
 *   후 복호화합니다. salt별 키 해시를 1개 캐시해 반복 도출 비용을 줄입니다.
 *
 * @module core/internal/EnvelopeCryptoV5
 */

import type { KeyDerivationOptions, PlatformAdapter } from "../types.js";
import {
  normalizePbkdf2HashForWebCrypto,
  normalizePbkdf2Iterations,
  resolveKeyDerivationAlgorithm,
} from "../../adapters/keyDerivation.js";
import {
  buildV5EncryptionAAD,
  decodeKdfMetaV5,
  encodeKdfMetaV5,
  MIN_SALT_BYTES,
  type KdfMetaV5,
} from "../cryptoEnvelopeV5.js";

type CompressionAlgorithm = "deflate" | "brotli";

/** V5 기본 PBKDF2 반복 횟수(OWASP 권고 상향; 자기기술이라 디코드가 메타를 따름). */
const V5_DEFAULT_PBKDF2_ITERATIONS = 600_000;

/** 인스턴스가 보유하는 V5 상태(인코드 material + 디코드 키 캐시). */
export interface V5CryptoState {
  adapter: PlatformAdapter | undefined;
  encryptionKey: string;
  keyDerivation: KeyDerivationOptions | undefined;
  /** 지연 해석된 인코드용 material(KDF_META + 효과적 키파생 옵션). */
  encodeMaterial?: { kdfMeta: Uint8Array; keyDerivation: KeyDerivationOptions };
  /** 인코드 키 해시 캐시(인스턴스 salt 기준). */
  encodeKeyHash?: Uint8Array;
  /** 디코드 키 해시 캐시(wire salt hex → hash, 최근 1개). */
  decodeKeyCache?: { saltHex: string; hash: Uint8Array };
}

function toSaltBytes(salt: string | Uint8Array | undefined, adapter: PlatformAdapter): Uint8Array {
  if (salt === undefined) return adapter.randomBytes(MIN_SALT_BYTES);
  if (typeof salt === "string") return new TextEncoder().encode(salt);
  return salt;
}

/** 인스턴스 키파생 설정으로부터 V5 인코드 material을 1회 해석합니다. */
export function resolveV5EncodeMaterial(state: V5CryptoState, adapter: PlatformAdapter) {
  if (state.encodeMaterial) return state.encodeMaterial;
  const algorithm = resolveKeyDerivationAlgorithm(state.keyDerivation);
  const hash = normalizePbkdf2HashForWebCrypto(state.keyDerivation?.hash);
  const iterations =
    algorithm === "pbkdf2"
      ? state.keyDerivation?.iterations !== undefined
        ? normalizePbkdf2Iterations(state.keyDerivation.iterations)
        : V5_DEFAULT_PBKDF2_ITERATIONS
      : 0;
  const salt = toSaltBytes(state.keyDerivation?.salt, adapter);
  const meta: KdfMetaV5 = { algorithm, iterations, hash, salt };
  const kdfMeta = encodeKdfMetaV5(meta);
  const keyDerivation: KeyDerivationOptions = {
    algorithm,
    salt,
    iterations: iterations || undefined,
    hash,
  };
  state.encodeMaterial = { kdfMeta, keyDerivation };
  return state.encodeMaterial;
}

/** wire KDF_META → adapter.deriveKey에 넘길 KeyDerivationOptions. */
function kdfMetaToKeyDerivation(meta: KdfMetaV5): KeyDerivationOptions {
  return {
    algorithm: meta.algorithm,
    salt: meta.salt,
    iterations: meta.iterations || undefined,
    hash: meta.hash,
  };
}

function saltHex(salt: Uint8Array): string {
  let s = "";
  for (let i = 0; i < salt.length; i++) s += salt[i].toString(16).padStart(2, "0");
  return s;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// ─── 동기 ────────────────────────────────────────────────────────────────────

export function encryptV5Sync(
  state: V5CryptoState,
  data: Uint8Array,
  compressionAlgorithm: CompressionAlgorithm | undefined,
  adapter: PlatformAdapter,
): Uint8Array {
  if (!adapter.deriveKeySync || !adapter.encryptSync) {
    throw new Error("[Ddu64 encrypt] Sync encryption unavailable. Use encodeAsync().");
  }
  const material = resolveV5EncodeMaterial(state, adapter);
  if (!state.encodeKeyHash) {
    state.encodeKeyHash = adapter.deriveKeySync(state.encryptionKey, material.keyDerivation);
  }
  const aad = buildV5EncryptionAAD(compressionAlgorithm, material.kdfMeta);
  const ct = adapter.encryptSync(data, state.encodeKeyHash, aad);
  return concat(material.kdfMeta, ct);
}

export function decryptV5Sync(
  state: V5CryptoState,
  envelope: Uint8Array,
  compressionAlgorithm: CompressionAlgorithm | undefined,
  adapter: PlatformAdapter,
): Uint8Array {
  if (!adapter.deriveKeySync || !adapter.decryptSync) {
    throw new Error("[Ddu64 decrypt] Sync decryption unavailable. Use decodeAsync().");
  }
  const { meta, bytesRead } = decodeKdfMetaV5(envelope);
  const kdfMeta = envelope.subarray(0, bytesRead);
  const body = envelope.subarray(bytesRead);
  const hash = getDecodeKeyHashSync(state, meta, adapter);
  const aad = buildV5EncryptionAAD(compressionAlgorithm, kdfMeta);
  return adapter.decryptSync(body, hash, aad);
}

function getDecodeKeyHashSync(
  state: V5CryptoState,
  meta: KdfMetaV5,
  adapter: PlatformAdapter,
): Uint8Array {
  const hex = saltHex(meta.salt) + `:${meta.algorithm}:${meta.iterations}:${meta.hash}`;
  if (state.decodeKeyCache?.saltHex === hex) return state.decodeKeyCache.hash;
  const hash = adapter.deriveKeySync!(state.encryptionKey, kdfMetaToKeyDerivation(meta));
  state.decodeKeyCache = { saltHex: hex, hash };
  return hash;
}

// ─── 비동기 ──────────────────────────────────────────────────────────────────

export async function encryptV5Async(
  state: V5CryptoState,
  data: Uint8Array,
  compressionAlgorithm: CompressionAlgorithm | undefined,
  adapter: PlatformAdapter,
): Promise<Uint8Array> {
  const material = resolveV5EncodeMaterial(state, adapter);
  if (!state.encodeKeyHash) {
    state.encodeKeyHash = await adapter.deriveKey(state.encryptionKey, material.keyDerivation);
  }
  const aad = buildV5EncryptionAAD(compressionAlgorithm, material.kdfMeta);
  const ct = await adapter.encrypt(data, state.encodeKeyHash, aad);
  return concat(material.kdfMeta, ct);
}

export async function decryptV5Async(
  state: V5CryptoState,
  envelope: Uint8Array,
  compressionAlgorithm: CompressionAlgorithm | undefined,
  adapter: PlatformAdapter,
): Promise<Uint8Array> {
  const { meta, bytesRead } = decodeKdfMetaV5(envelope);
  const kdfMeta = envelope.subarray(0, bytesRead);
  const body = envelope.subarray(bytesRead);
  const hex = saltHex(meta.salt) + `:${meta.algorithm}:${meta.iterations}:${meta.hash}`;
  let hash: Uint8Array;
  if (state.decodeKeyCache?.saltHex === hex) {
    hash = state.decodeKeyCache.hash;
  } else {
    hash = await adapter.deriveKey(state.encryptionKey, kdfMetaToKeyDerivation(meta));
    state.decodeKeyCache = { saltHex: hex, hash };
  }
  const aad = buildV5EncryptionAAD(compressionAlgorithm, kdfMeta);
  return adapter.decrypt(body, hash, aad);
}
