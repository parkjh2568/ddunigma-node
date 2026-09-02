/**
 * 브라우저 플랫폼 어댑터 구현.
 * 암호화 연산에 Web Crypto API(SubtleCrypto)를 사용하고
 * 압축에 CompressionStream/DecompressionStream을 사용합니다.
 *
 * 이 어댑터는 동기 암호화 또는 압축 연산을 지원하지 않습니다.
 * Brotli는 CompressionStream/DecompressionStream에서 지원되는 런타임에서만 사용할 수 있습니다.
 *
 * @module adapters/BrowserAdapter
 */

import type { KeyDerivationOptions, PlatformAdapter } from "../core/types.js";
import { Ddu64AdapterError } from "../core/errors.js";
import {
  normalizePbkdf2HashForWebCrypto,
  normalizePbkdf2Iterations,
  pbkdf2SaltToBytes,
  resolveKeyDerivationAlgorithm,
} from "./keyDerivation.js";

type BrowserCompressionFormat = "deflate-raw" | "brotli";
type BrowserCompressionOperation = "compress" | "decompress";

const compressionSupportCache = new Set<string>();

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  if (data.buffer instanceof ArrayBuffer) {
    if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
      return data.buffer;
    }
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }

  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

function requireCompressionFormat(
  format: BrowserCompressionFormat,
  operation: BrowserCompressionOperation,
): CompressionFormat {
  const cacheKey = `${operation}:${format}`;
  if (!compressionSupportCache.has(cacheKey)) {
    try {
      if (operation === "compress" && typeof CompressionStream !== "undefined") {
        new CompressionStream(format as CompressionFormat);
        compressionSupportCache.add(cacheKey);
      } else if (operation === "decompress" && typeof DecompressionStream !== "undefined") {
        new DecompressionStream(format as CompressionFormat);
        compressionSupportCache.add(cacheKey);
      }
    } catch {
      compressionSupportCache.delete(cacheKey);
    }

    if (!compressionSupportCache.has(cacheKey)) {
      const label = format === "brotli" ? "Brotli" : "Deflate raw";
      const api = operation === "compress" ? "CompressionStream" : "DecompressionStream";
      throw new Ddu64AdapterError(
        `[Ddu64 ${operation}] ${label} ${operation}ion is unsupported in the current runtime. ` +
          `${api} does not support "${format}".`,
        operation,
      );
    }
  }

  return format as CompressionFormat;
}

/**
 * Web API를 사용하여 PlatformAdapter를 구현하는 BrowserAdapter:
 * - AES-256-GCM 및 SHA-256을 위한 Web Crypto API(SubtleCrypto)
 * - 안전한 랜덤 바이트를 위한 crypto.getRandomValues
 * - deflate-raw 압축을 위한 CompressionStream/DecompressionStream
 * - 런타임이 지원하는 경우 Brotli 압축
 */
export class BrowserAdapter implements PlatformAdapter {
  readonly runtime: "browser" | "edge" | "deno" | "bun";

  constructor(runtime: "browser" | "edge" | "deno" | "bun" = "browser") {
    this.runtime = runtime;
  }

  // ─── Crypto ──────────────────────────────────────────────────────────────

  /**
   * UTF-8 키 문자열에서 SHA-256을 통해 256비트 키를 파생합니다.
   * UTF-8 인코딩된 키에 SubtleCrypto.digest('SHA-256', ...)를 사용합니다.
   */
  async deriveKey(key: string, options?: KeyDerivationOptions): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);

    if (resolveKeyDerivationAlgorithm(options) === "pbkdf2") {
      const keyMaterial = await crypto.subtle.importKey("raw", keyData, "PBKDF2", false, [
        "deriveBits",
      ]);
      const bits = await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: pbkdf2SaltToBytes(options?.salt) as BufferSource,
          iterations: normalizePbkdf2Iterations(options?.iterations),
          hash: normalizePbkdf2HashForWebCrypto(options?.hash),
        },
        keyMaterial,
        256,
      );
      return new Uint8Array(bits);
    }

    const hashBuffer = await crypto.subtle.digest("SHA-256", keyData);
    return new Uint8Array(hashBuffer);
  }

  /**
   * 12바이트 IV를 사용하여 AES-256-GCM으로 데이터를 암호화합니다.
   * 와이어 포맷 반환: IV(12바이트) + authTag(16바이트) + 암호문.
   *
   * 참고: Web Crypto는 authTag를 암호문에 추가하므로,
   * 마지막 16바이트를 authTag로 추출하고 와이어 포맷에 맞게 재배치합니다.
   */
  async encrypt(data: Uint8Array, keyHash: Uint8Array, aad?: Uint8Array): Promise<Uint8Array> {
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      toArrayBuffer(keyHash),
      { name: "AES-GCM" },
      false,
      ["encrypt"],
    );

    // Web Crypto AES-GCM 반환: 암호문 + authTag(16바이트 추가)
    const algorithm: AesGcmParams = { name: "AES-GCM", iv, tagLength: 128 };
    if (aad && aad.length > 0) {
      algorithm.additionalData = toArrayBuffer(aad);
    }

    const encryptedBuffer = await crypto.subtle.encrypt(algorithm, cryptoKey, toArrayBuffer(data));

    const encrypted = new Uint8Array(encryptedBuffer);
    // Web Crypto 출력: 암호문(N바이트) + authTag(16바이트)
    const ciphertext = encrypted.subarray(0, encrypted.length - 16);
    const authTag = encrypted.subarray(encrypted.length - 16);

    // 와이어 포맷: IV(12) + authTag(16) + 암호문(N)
    const result = new Uint8Array(12 + 16 + ciphertext.length);
    result.set(iv, 0);
    result.set(authTag, 12);
    result.set(ciphertext, 28);

    return result;
  }

  /**
   * AES-256-GCM 페이로드를 복호화합니다.
   * 와이어 포맷 기대: IV(12바이트) + authTag(16바이트) + 암호문.
   * 복호화 전에 Web Crypto 형식(암호문 + authTag)으로 재구성합니다.
   */
  async decrypt(data: Uint8Array, keyHash: Uint8Array, aad?: Uint8Array): Promise<Uint8Array> {
    if (data.length < 28) {
      throw new Error(
        "[Ddu64 decrypt] Encrypted data is invalid. " +
          "Payload must be at least 28 bytes (12 IV + 16 authTag + ciphertext).",
      );
    }

    const iv = data.subarray(0, 12);
    const authTag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);

    // Web Crypto 기대 형식: 암호문 + authTag
    const webCryptoInput = new Uint8Array(ciphertext.length + 16);
    webCryptoInput.set(ciphertext, 0);
    webCryptoInput.set(authTag, ciphertext.length);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      toArrayBuffer(keyHash),
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );

    try {
      const algorithm: AesGcmParams = {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        tagLength: 128,
      };
      if (aad && aad.length > 0) {
        algorithm.additionalData = toArrayBuffer(aad);
      }

      const decryptedBuffer = await crypto.subtle.decrypt(
        algorithm,
        cryptoKey,
        toArrayBuffer(webCryptoInput),
      );

      return new Uint8Array(decryptedBuffer);
    } catch {
      throw new Error("[Ddu64 decrypt] Decryption failed: data tampering or incorrect key.");
    }
  }

  /**
   * 암호학적으로 안전한 랜덤 바이트를 생성합니다.
   */
  randomBytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  // ─── Compression ─────────────────────────────────────────────────────────

  /**
   * CompressionStream을 통해 deflate로 데이터를 압축합니다.
   * Node.js zlib.deflateRaw와의 상호운용성을 위해 'deflate-raw' 형식만 사용합니다.
   */
  async deflate(data: Uint8Array, _level?: number): Promise<Uint8Array> {
    const format = requireCompressionFormat("deflate-raw", "compress");
    const cs = new CompressionStream(format);
    return this.writeAndReadStream(cs, data);
  }

  /**
   * DecompressionStream을 통해 deflate 데이터를 압축 해제합니다.
   * Node.js zlib.inflateRaw와의 상호운용성을 위해 'deflate-raw' 형식만 사용합니다.
   * maxBytes가 지정되면 제한을 적용합니다.
   */
  async inflate(data: Uint8Array, maxBytes?: number): Promise<Uint8Array> {
    const format = requireCompressionFormat("deflate-raw", "decompress");
    const ds = new DecompressionStream(format);
    return this.writeAndReadStream(ds, data, maxBytes);
  }

  // ─── Brotli ──────────────────────────────────────────────────────────────

  /**
   * CompressionStream을 통해 Brotli로 데이터를 압축합니다.
   * 브라우저 Web API는 Brotli 품질 레벨을 받지 않으므로 level 값은 무시됩니다.
   */
  async brotliCompress(data: Uint8Array, _level?: number): Promise<Uint8Array> {
    const format = requireCompressionFormat("brotli", "compress");
    const cs = new CompressionStream(format);
    return this.writeAndReadStream(cs, data);
  }

  /**
   * DecompressionStream을 통해 Brotli 데이터를 압축 해제합니다.
   */
  async brotliDecompress(data: Uint8Array, maxBytes?: number): Promise<Uint8Array> {
    const format = requireCompressionFormat("brotli", "decompress");
    const ds = new DecompressionStream(format);
    return this.writeAndReadStream(ds, data, maxBytes);
  }

  private async writeAndReadStream(
    stream: CompressionStream | DecompressionStream,
    data: Uint8Array,
    maxBytes?: number,
  ): Promise<Uint8Array> {
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();

    const writePromise = (async () => {
      await writer.write(new Uint8Array(toArrayBuffer(data)));
      await writer.close();
    })();
    const readPromise = this.readAllChunks(reader, maxBytes);

    try {
      const [result] = await Promise.all([readPromise, writePromise]);
      return result;
    } catch (error) {
      await reader.cancel(error).catch(() => undefined);
      await writer.abort(error).catch(() => undefined);
      throw error;
    }
  }

  private async readAllChunks(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    maxBytes?: number,
  ): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalLength += value.length;
      if (maxBytes !== undefined && totalLength > maxBytes) {
        throw new Error(
          `[Ddu64 decompress] Decompressed size exceeds limit. ` +
            `Estimated ${totalLength}+ bytes exceeds maximum of ${maxBytes} bytes.`,
        );
      }
      chunks.push(value);
    }

    if (chunks.length === 1) {
      return chunks[0];
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }
}
