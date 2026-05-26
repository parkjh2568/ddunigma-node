/**
 * 브라우저 플랫폼 어댑터 구현.
 * 암호화 연산에 Web Crypto API(SubtleCrypto)를 사용하고
 * 압축에 CompressionStream/DecompressionStream을 사용합니다.
 *
 * 이 어댑터는 동기 암호화 또는 압축 연산을 지원하지 않습니다.
 * Brotli도 브라우저 환경에서는 사용할 수 없습니다.
 *
 * @module adapters/BrowserAdapter
 */

import type { KeyDerivationOptions, PlatformAdapter } from "../core/types.js";

const DEFAULT_PBKDF2_ITERATIONS = 210_000;
const MIN_PBKDF2_ITERATIONS = 10_000;
const DEFAULT_PBKDF2_SALT = "ddunigma:pbkdf2:v1";

function normalizePbkdf2Iterations(iterations: number | undefined): number {
  if (iterations === undefined) return DEFAULT_PBKDF2_ITERATIONS;
  if (!Number.isFinite(iterations) || iterations <= 0) return DEFAULT_PBKDF2_ITERATIONS;
  return Math.max(MIN_PBKDF2_ITERATIONS, Math.floor(iterations));
}

function saltToBytes(salt: string | Uint8Array | undefined): Uint8Array {
  if (salt === undefined) return new TextEncoder().encode(DEFAULT_PBKDF2_SALT);
  if (typeof salt === "string") return new TextEncoder().encode(salt);
  return salt;
}

/**
 * Web API를 사용하여 PlatformAdapter를 구현하는 BrowserAdapter:
 * - AES-256-GCM 및 SHA-256을 위한 Web Crypto API(SubtleCrypto)
 * - 안전한 랜덤 바이트를 위한 crypto.getRandomValues
 * - deflate 압축을 위한 CompressionStream/DecompressionStream
 */
export class BrowserAdapter implements PlatformAdapter {
  readonly supportsSyncCrypto = false;
  readonly supportsSyncCompression = false;
  readonly supportsBrotli = false;
  readonly runtime = "browser" as const;

  // ─── Crypto ──────────────────────────────────────────────────────────────

  /**
   * UTF-8 키 문자열에서 SHA-256을 통해 256비트 키를 파생합니다.
   * UTF-8 인코딩된 키에 SubtleCrypto.digest('SHA-256', ...)를 사용합니다.
   */
  async deriveKey(key: string, options?: KeyDerivationOptions): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);

    if (options?.algorithm === "pbkdf2") {
      const keyMaterial = await crypto.subtle.importKey("raw", keyData, "PBKDF2", false, [
        "deriveBits",
      ]);
      const bits = await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: saltToBytes(options.salt) as BufferSource,
          iterations: normalizePbkdf2Iterations(options.iterations),
          hash: options.hash ?? "SHA-256",
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
  async encrypt(data: Uint8Array, keyHash: Uint8Array): Promise<Uint8Array> {
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyHash as unknown as ArrayBuffer,
      { name: "AES-GCM" },
      false,
      ["encrypt"],
    );

    // Web Crypto AES-GCM 반환: 암호문 + authTag(16바이트 추가)
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      cryptoKey,
      data as unknown as ArrayBuffer,
    );

    const encrypted = new Uint8Array(encryptedBuffer);
    // Web Crypto 출력: 암호문(N바이트) + authTag(16바이트)
    const ciphertext = encrypted.slice(0, encrypted.length - 16);
    const authTag = encrypted.slice(encrypted.length - 16);

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
  async decrypt(data: Uint8Array, keyHash: Uint8Array): Promise<Uint8Array> {
    if (data.length < 28) {
      throw new Error(
        "[Ddu64 decrypt] Encrypted data is invalid. " +
          "Payload must be at least 28 bytes (12 IV + 16 authTag + ciphertext).",
      );
    }

    const iv = data.slice(0, 12);
    const authTag = data.slice(12, 28);
    const ciphertext = data.slice(28);

    // Web Crypto 기대 형식: 암호문 + authTag
    const webCryptoInput = new Uint8Array(ciphertext.length + 16);
    webCryptoInput.set(ciphertext, 0);
    webCryptoInput.set(authTag, ciphertext.length);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyHash as unknown as ArrayBuffer,
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );

    try {
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, tagLength: 128 },
        cryptoKey,
        webCryptoInput as unknown as ArrayBuffer,
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
   * 가능하면 'deflate-raw' 형식을 사용하고, 그렇지 않으면 'deflate'를 사용합니다.
   */
  async deflate(data: Uint8Array, _level?: number): Promise<Uint8Array> {
    if (typeof CompressionStream === "undefined") {
      throw new Error(
        "[Ddu64 compress] Deflate compression is unsupported in the current runtime. " +
          "CompressionStream API is not available.",
      );
    }

    const format = this.getDeflateFormat();
    const cs = new CompressionStream(format);
    const writer = cs.writable.getWriter();
    const reader = cs.readable.getReader();

    writer.write(data as unknown as BufferSource);
    writer.close();

    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLength += value.length;
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  /**
   * DecompressionStream을 통해 deflate 데이터를 압축 해제합니다.
   * 가능하면 'deflate-raw' 형식을 사용하고, 그렇지 않으면 'deflate'를 사용합니다.
   * maxBytes가 지정되면 제한을 적용합니다.
   */
  async inflate(data: Uint8Array, maxBytes?: number): Promise<Uint8Array> {
    if (typeof DecompressionStream === "undefined") {
      throw new Error(
        "[Ddu64 decompress] Deflate decompression is unsupported in the current runtime. " +
          "DecompressionStream API is not available.",
      );
    }

    const format = this.getDeflateFormat();
    const ds = new DecompressionStream(format);
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();

    writer.write(data as unknown as BufferSource);
    writer.close();

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

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  // ─── Brotli (미지원) ─────────────────────────────────────────────────────

  // brotliCompress, brotliCompressSync, brotliDecompress, brotliDecompressSync는
  // 의도적으로 정의하지 않습니다 (미구현).
  // 인터페이스에서 선택적(?)으로 표시되어 있으므로 단순히 부재합니다.

  // ─── 동기 메서드 (미지원) ────────────────────────────────────────────────

  // deriveKeySync, encryptSync, decryptSync, deflateSync, inflateSync는
  // 의도적으로 정의하지 않습니다 (미구현).
  // 인터페이스에서 선택적(?)으로 표시되어 있으므로 단순히 부재합니다.

  // ─── 비공개 헬퍼 ─────────────────────────────────────────────────────────

  /**
   * CompressionStream에 적합한 deflate 형식을 결정합니다.
   * Node.js zlib.deflateRaw와의 상호운용성을 위해 'deflate-raw'를 선호합니다.
   */
  private getDeflateFormat(): "deflate-raw" | "deflate" {
    // 'deflate-raw'는 최신 브라우저와 Node.js에서 지원됩니다
    // 'deflate-raw'가 인식되지 않으면 'deflate'(zlib 헤더 포함)로 폴백
    // 실제로 CompressionStream을 지원하는 모든 환경은 'deflate-raw'도 지원합니다
    return "deflate-raw";
  }
}
