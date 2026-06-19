/**
 * 동기 암호화/압축 게이트웨이 호출의 에러 타입화 래퍼.
 *
 * `Ddu64Core`의 sync 경로(`encryptSync`/`decryptSync`/`compressSync`/`decompressSync`)가
 * 공유하던 try-catch 패턴(`isDdu64Error`면 그대로 throw, 아니면 도메인 에러로 래핑)을
 * 한곳으로 모읍니다. 게이트웨이 호출·에러 매핑·거동은 추출 이전과 동일합니다.
 *
 * @module core/internal/SyncCryptoHelpers
 */

import type { PlatformAdapter } from "../types.js";
import type { AdapterGatewayContext } from "./AdapterGatewayContext.js";
import {
  compressSyncWithAdapter,
  decompressSyncWithAdapter,
  decryptSyncWithAdapter,
  encryptSyncWithAdapter,
} from "./SyncAdapterGateway.js";
import {
  Ddu64CompressionError,
  Ddu64DecompressionError,
  Ddu64DecryptionError,
  Ddu64EncryptionError,
  isDdu64Error,
  toErrorMessage,
} from "../errors.js";

/** 도메인 Ddu64 에러 생성자(메시지 + 원인)를 받는 최소 시그니처. */
type Ddu64ErrorCtor = new (message: string, cause?: unknown) => Error;

/**
 * 이미 Ddu64Error면 원형 그대로 다시 던지고, 그 외에는 지정한 도메인 에러로 래핑합니다.
 * 항상 throw하므로 반환 타입은 `never`입니다.
 */
function rethrowTyped(err: unknown, ErrorCtor: Ddu64ErrorCtor): never {
  if (isDdu64Error(err)) throw err;
  throw new ErrorCtor(toErrorMessage(err), err);
}

export function runEncryptSync(
  ctx: AdapterGatewayContext,
  data: Uint8Array,
  aad?: Uint8Array,
): Uint8Array {
  try {
    return encryptSyncWithAdapter(ctx, data, aad);
  } catch (err) {
    rethrowTyped(err, Ddu64EncryptionError);
  }
}

export function runDecryptSync(
  ctx: AdapterGatewayContext,
  data: Uint8Array,
  aad?: Uint8Array,
): Uint8Array {
  try {
    return decryptSyncWithAdapter(ctx, data, aad);
  } catch (err) {
    rethrowTyped(err, Ddu64DecryptionError);
  }
}

export function runCompressSync(
  adapter: PlatformAdapter | undefined,
  data: Uint8Array,
  algorithm: "deflate" | "brotli",
  level: number,
): Uint8Array {
  try {
    return compressSyncWithAdapter(adapter, data, algorithm, level);
  } catch (err) {
    rethrowTyped(err, Ddu64CompressionError);
  }
}

export function runDecompressSync(
  adapter: PlatformAdapter | undefined,
  data: Uint8Array,
  algorithm: "deflate" | "brotli",
  maxBytes: number,
): Uint8Array {
  try {
    return decompressSyncWithAdapter(adapter, data, algorithm, maxBytes);
  } catch (err) {
    rethrowTyped(err, Ddu64DecompressionError);
  }
}
