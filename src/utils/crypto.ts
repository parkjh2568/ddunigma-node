import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { inflateSync, ZlibOptions } from "zlib";

/**
 * 문자열 키를 AES-256용 32바이트 키로 변환합니다.
 */
export function deriveKey(key: string): Buffer {
  return createHash("sha256").update(key).digest();
}

/**
 * AES-256-GCM으로 데이터를 암호화합니다.
 *
 * @param data - 암호화할 데이터
 * @param keyHash - 32바이트 해시된 키 (deriveKey로 생성)
 * @returns iv (12) + authTag (16) + encrypted
 */
export function encryptAes256Gcm(data: Buffer, keyHash: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyHash, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * AES-256-GCM으로 암호화된 데이터를 복호화합니다.
 *
 * @param data - 암호화된 데이터 (iv + authTag + encrypted)
 * @param keyHash - 32바이트 해시된 키 (deriveKey로 생성)
 * @returns 복호화된 데이터
 * @throws 데이터가 28바이트 미만이면 에러
 */
export function decryptAes256Gcm(data: Buffer, keyHash: Buffer): Buffer {
  if (data.length < 28) {
    throw new Error("[decrypt] Invalid encrypted data: too short");
  }
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", keyHash, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * 크기 제한을 적용하여 zlib 압축을 해제합니다.
 *
 * @param data - 압축된 데이터
 * @param maxBytes - 최대 압축해제 바이트 수
 * @param context - 에러 메시지에 표시할 컨텍스트 (예: "Ddu64 decode", "DduPipeline decompress")
 * @returns 압축 해제된 데이터
 */
export function inflateWithLimit(data: Buffer, maxBytes: number, context: string = "inflate"): Buffer {
  if (maxBytes === Number.POSITIVE_INFINITY) return inflateSync(data);

  try {
    return inflateSync(data, { maxOutputLength: maxBytes } as ZlibOptions);
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string };
    const msg = String(err?.message ?? "");
    const code = String(err?.code ?? "");

    // maxOutputLength 미지원 시 fallback
    if (
      msg.toLowerCase().includes("maxoutputlength") ||
      msg.toLowerCase().includes("unknown option") ||
      code === "ERR_INVALID_ARG_VALUE"
    ) {
      const inflated = inflateSync(data);
      if (inflated.length > maxBytes) {
        throw new Error(
          `[${context}] Decompressed data exceeds limit. Size: ${inflated.length} bytes, Limit: ${maxBytes} bytes`
        );
      }
      return inflated;
    }

    // 출력 제한 초과
    if (
      code === "ERR_BUFFER_TOO_LARGE" ||
      msg.toLowerCase().includes("output length") ||
      msg.toLowerCase().includes("buffer too large")
    ) {
      throw new Error(
        `[${context}] Decompressed data exceeds limit. Limit: ${maxBytes} bytes`
      );
    }
    throw e;
  }
}
