/**
 * Node.js 플랫폼 어댑터 구현.
 * Node.js `crypto`와 `zlib` 모듈을 래핑하여 PlatformAdapter 인터페이스를 구현합니다.
 *
 * @module adapters/NodeAdapter
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes as cryptoRandomBytes,
  createHash,
  pbkdf2,
  pbkdf2Sync,
} from "crypto";
import {
  deflateRawSync,
  inflateRawSync,
  deflateRaw,
  inflateRaw,
  brotliCompressSync as zlibBrotliCompressSync,
  brotliDecompressSync as zlibBrotliDecompressSync,
  brotliCompress as zlibBrotliCompress,
  brotliDecompress as zlibBrotliDecompress,
  constants as zlibConstants,
  type ZlibOptions,
  type BrotliOptions,
} from "zlib";
import { promisify } from "util";
import type { KeyDerivationOptions, PlatformAdapter } from "../core/types.js";
import {
  normalizePbkdf2HashForNode,
  normalizePbkdf2Iterations,
  pbkdf2SaltToBytes,
  resolveKeyDerivationAlgorithm,
} from "./keyDerivation.js";

const deflateRawAsync = promisify(deflateRaw);
const inflateRawAsync = promisify(inflateRaw);
const brotliCompressAsync = promisify(zlibBrotliCompress);
const brotliDecompressAsync = promisify(zlibBrotliDecompress);
const pbkdf2Async = promisify(pbkdf2);

/** zlib/brotli의 "출력 버퍼 초과" 계열 에러인지 판별합니다. */
function isBufferTooLargeError(e: unknown): boolean {
  const err = e as { message?: string; code?: string };
  const msg = String(err?.message ?? "").toLowerCase();
  const code = String(err?.code ?? "");
  return (
    code === "ERR_BUFFER_TOO_LARGE" ||
    msg.includes("output length") ||
    msg.includes("buffer too large") ||
    msg.includes("cannot create a buffer larger")
  );
}

/**
 * 압축 해제 중 발생한 에러가 출력 크기 제한 초과면 표준 메시지로 다시 던지고,
 * 그 외에는 원본 에러를 그대로 전파합니다.
 */
function rethrowDecompressLimitError(e: unknown, maxBytes: number, label: string): never {
  if (isBufferTooLargeError(e)) {
    throw new Error(`[Ddu64 ${label}] Decompressed data exceeds limit. Limit: ${maxBytes} bytes`, {
      cause: e,
    });
  }
  throw e;
}

function toBufferView(data: Uint8Array): Buffer {
  if (Buffer.isBuffer(data)) return data;
  // SharedArrayBuffer는 일부 Node.js native API에서 거부될 수 있으므로 복사
  if (data.buffer instanceof SharedArrayBuffer) {
    return Buffer.from(data);
  }
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

function toUint8View(data: Buffer): Uint8Array {
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * PlatformAdapter의 Node.js 구현.
 * 네이티브 Node.js `crypto`와 `zlib` 모듈을 사용하여
 * 동기 및 비동기 암호화/압축 연산을 제공합니다.
 */
export class NodeAdapter implements PlatformAdapter {
  readonly supportsSyncCrypto = true;
  readonly supportsSyncCompression = true;
  readonly supportsBrotli = true;
  readonly runtime = "node" as const;

  // ─── Crypto ──────────────────────────────────────────────────────────────

  async deriveKey(key: string, options?: KeyDerivationOptions): Promise<Uint8Array> {
    if (resolveKeyDerivationAlgorithm(options) === "pbkdf2") {
      const derived = await pbkdf2Async(
        key,
        pbkdf2SaltToBytes(options?.salt),
        normalizePbkdf2Iterations(options?.iterations),
        32,
        normalizePbkdf2HashForNode(options?.hash),
      );
      return toUint8View(derived);
    }
    return this.deriveKeySync(key, options);
  }

  deriveKeySync(key: string, options?: KeyDerivationOptions): Uint8Array {
    if (resolveKeyDerivationAlgorithm(options) === "pbkdf2") {
      return toUint8View(
        pbkdf2Sync(
          key,
          pbkdf2SaltToBytes(options?.salt),
          normalizePbkdf2Iterations(options?.iterations),
          32,
          normalizePbkdf2HashForNode(options?.hash),
        ),
      );
    }
    return toUint8View(createHash("sha256").update(key).digest());
  }

  async encrypt(data: Uint8Array, keyHash: Uint8Array, aad?: Uint8Array): Promise<Uint8Array> {
    return this.encryptSync(data, keyHash, aad);
  }

  encryptSync(data: Uint8Array, keyHash: Uint8Array, aad?: Uint8Array): Uint8Array {
    const iv = cryptoRandomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", keyHash, iv);
    if (aad && aad.length > 0) {
      cipher.setAAD(toBufferView(aad));
    }
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // 와이어 포맷: IV(12) + authTag(16) + 암호문
    const result = new Uint8Array(12 + 16 + encrypted.length);
    result.set(iv, 0);
    result.set(authTag, 12);
    result.set(encrypted, 28);
    return result;
  }

  async decrypt(data: Uint8Array, keyHash: Uint8Array, aad?: Uint8Array): Promise<Uint8Array> {
    return this.decryptSync(data, keyHash, aad);
  }

  decryptSync(data: Uint8Array, keyHash: Uint8Array, aad?: Uint8Array): Uint8Array {
    if (data.length < 28) {
      throw new Error("[Ddu64 decrypt] Invalid encrypted data: too short");
    }
    const iv = data.subarray(0, 12);
    const authTag = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", keyHash, iv);
    if (aad && aad.length > 0) {
      decipher.setAAD(toBufferView(aad));
    }
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return toUint8View(decrypted);
  }

  randomBytes(length: number): Uint8Array {
    return toUint8View(cryptoRandomBytes(length));
  }

  // ─── Compression ─────────────────────────────────────────────────────────

  async deflate(data: Uint8Array, level?: number): Promise<Uint8Array> {
    const options: ZlibOptions = {};
    if (level !== undefined) {
      options.level = level;
    }
    const result = await deflateRawAsync(toBufferView(data), options);
    return toUint8View(result);
  }

  deflateSync(data: Uint8Array, level?: number): Uint8Array {
    const options: ZlibOptions = {};
    if (level !== undefined) {
      options.level = level;
    }
    return toUint8View(deflateRawSync(toBufferView(data), options));
  }

  async inflate(data: Uint8Array, maxBytes?: number): Promise<Uint8Array> {
    if (maxBytes === undefined || maxBytes === Number.POSITIVE_INFINITY) {
      const result = await inflateRawAsync(toBufferView(data));
      return toUint8View(result);
    }
    const options: ZlibOptions = { maxOutputLength: maxBytes };
    try {
      const result = await inflateRawAsync(toBufferView(data), options);
      return toUint8View(result);
    } catch (e: unknown) {
      rethrowDecompressLimitError(e, maxBytes, "inflate");
    }
  }

  inflateSync(data: Uint8Array, maxBytes?: number): Uint8Array {
    if (maxBytes === undefined || maxBytes === Number.POSITIVE_INFINITY) {
      return toUint8View(inflateRawSync(toBufferView(data)));
    }
    try {
      return toUint8View(
        inflateRawSync(toBufferView(data), { maxOutputLength: maxBytes } as ZlibOptions),
      );
    } catch (e: unknown) {
      rethrowDecompressLimitError(e, maxBytes, "inflate");
    }
  }

  async brotliCompress(data: Uint8Array, level?: number): Promise<Uint8Array> {
    const options: BrotliOptions = {};
    if (level !== undefined) {
      options.params = {
        [zlibConstants.BROTLI_PARAM_QUALITY]: Math.max(0, Math.min(11, level)),
      };
    }
    const result = await brotliCompressAsync(toBufferView(data), options);
    return toUint8View(result);
  }

  brotliCompressSync(data: Uint8Array, level?: number): Uint8Array {
    const options: BrotliOptions = {};
    if (level !== undefined) {
      options.params = {
        [zlibConstants.BROTLI_PARAM_QUALITY]: Math.max(0, Math.min(11, level)),
      };
    }
    return toUint8View(zlibBrotliCompressSync(toBufferView(data), options));
  }

  async brotliDecompress(data: Uint8Array, maxBytes?: number): Promise<Uint8Array> {
    if (maxBytes === undefined || maxBytes === Number.POSITIVE_INFINITY) {
      const result = await brotliDecompressAsync(toBufferView(data));
      return toUint8View(result);
    }
    try {
      const result = await brotliDecompressAsync(toBufferView(data), {
        maxOutputLength: maxBytes,
      } as BrotliOptions);
      return toUint8View(result);
    } catch (e: unknown) {
      rethrowDecompressLimitError(e, maxBytes, "brotli");
    }
  }

  brotliDecompressSync(data: Uint8Array, maxBytes?: number): Uint8Array {
    if (maxBytes === undefined || maxBytes === Number.POSITIVE_INFINITY) {
      return toUint8View(zlibBrotliDecompressSync(toBufferView(data)));
    }
    try {
      return toUint8View(
        zlibBrotliDecompressSync(toBufferView(data), {
          maxOutputLength: maxBytes,
        } as BrotliOptions),
      );
    } catch (e: unknown) {
      rethrowDecompressLimitError(e, maxBytes, "brotli");
    }
  }
}
