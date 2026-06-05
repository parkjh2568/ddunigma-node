/**
 * ddunigma custom error hierarchy.
 *
 * Public encode/decode APIs wrap internal/runtime failures in these typed
 * errors so callers can branch on a stable code without parsing messages.
 *
 * @module core/errors
 */

import { isAdapterCapabilityErrorMessage } from "./internal/AdapterCapability.js";

export type Ddu64Operation =
  | "construct"
  | "encode"
  | "decode"
  | "compress"
  | "decompress"
  | "encrypt"
  | "decrypt"
  | "checksum"
  | "charset"
  | "adapter"
  | "obfuscation"
  | "stream";

export enum Ddu64ErrorCode {
  EncodeFailed = "DDU64_ENCODE_FAILED",
  DecodeFailed = "DDU64_DECODE_FAILED",
  CompressionFailed = "DDU64_COMPRESSION_FAILED",
  DecompressionFailed = "DDU64_DECOMPRESSION_FAILED",
  EncryptionFailed = "DDU64_ENCRYPTION_FAILED",
  DecryptionFailed = "DDU64_DECRYPTION_FAILED",
  ChecksumMismatch = "DDU64_CHECKSUM_MISMATCH",
  InvalidCharset = "DDU64_INVALID_CHARSET",
  InvalidInput = "DDU64_INVALID_INPUT",
  LimitExceeded = "DDU64_LIMIT_EXCEEDED",
  AdapterUnavailable = "DDU64_ADAPTER_UNAVAILABLE",
  ObfuscationFailed = "DDU64_OBFUSCATION_FAILED",
  StreamFailed = "DDU64_STREAM_FAILED",
}

export interface Ddu64ErrorOptions {
  code: Ddu64ErrorCode;
  operation: Ddu64Operation;
  cause?: unknown;
}

export class Ddu64Error extends Error {
  readonly code: Ddu64ErrorCode;
  readonly operation: Ddu64Operation;

  constructor(message: string, options: Ddu64ErrorOptions) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
    this.operation = options.operation;
  }
}

export class Ddu64EncodeError extends Ddu64Error {
  constructor(message: string, cause?: unknown) {
    super(message, { code: Ddu64ErrorCode.EncodeFailed, operation: "encode", cause });
  }
}

export class Ddu64DecodeError extends Ddu64Error {
  constructor(message: string, cause?: unknown) {
    super(message, { code: Ddu64ErrorCode.DecodeFailed, operation: "decode", cause });
  }
}

export class Ddu64CompressionError extends Ddu64Error {
  constructor(message: string, cause?: unknown) {
    super(message, { code: Ddu64ErrorCode.CompressionFailed, operation: "compress", cause });
  }
}

export class Ddu64DecompressionError extends Ddu64Error {
  constructor(message: string, cause?: unknown) {
    super(message, { code: Ddu64ErrorCode.DecompressionFailed, operation: "decompress", cause });
  }
}

export class Ddu64EncryptionError extends Ddu64Error {
  constructor(message: string, cause?: unknown) {
    super(message, { code: Ddu64ErrorCode.EncryptionFailed, operation: "encrypt", cause });
  }
}

export class Ddu64DecryptionError extends Ddu64Error {
  constructor(message: string, cause?: unknown) {
    super(message, { code: Ddu64ErrorCode.DecryptionFailed, operation: "decrypt", cause });
  }
}

export class Ddu64ChecksumError extends Ddu64Error {
  constructor(message: string, cause?: unknown) {
    super(message, { code: Ddu64ErrorCode.ChecksumMismatch, operation: "checksum", cause });
  }
}

export class Ddu64CharsetError extends Ddu64Error {
  constructor(message: string, cause?: unknown) {
    super(message, { code: Ddu64ErrorCode.InvalidCharset, operation: "charset", cause });
  }
}

export class Ddu64LimitError extends Ddu64Error {
  constructor(message: string, operation: Ddu64Operation, cause?: unknown) {
    super(message, { code: Ddu64ErrorCode.LimitExceeded, operation, cause });
  }
}

export class Ddu64AdapterError extends Ddu64Error {
  constructor(message: string, operation: Ddu64Operation, cause?: unknown) {
    super(message, { code: Ddu64ErrorCode.AdapterUnavailable, operation, cause });
  }
}

export class Ddu64ObfuscationError extends Ddu64Error {
  constructor(message: string, cause?: unknown) {
    super(message, { code: Ddu64ErrorCode.ObfuscationFailed, operation: "obfuscation", cause });
  }
}

export class Ddu64StreamError extends Ddu64Error {
  constructor(message: string, cause?: unknown) {
    super(message, { code: Ddu64ErrorCode.StreamFailed, operation: "stream", cause });
  }
}

export function isDdu64Error(error: unknown): error is Ddu64Error {
  return error instanceof Ddu64Error;
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export function wrapDdu64Error(
  error: unknown,
  fallbackOperation: "encode" | "decode" | "stream",
): Ddu64Error {
  if (isDdu64Error(error)) return error;

  const message = toErrorMessage(error);
  const lower = message.toLowerCase();

  // 내부 에러([Ddu64 ...] prefix)만 키워드 기반 분류 적용.
  // 외부/사용자 에러는 키워드 매칭 없이 fallback operation으로 분류.
  const isInternalError = lower.startsWith("[ddu64") || lower.startsWith("[bitpack");

  if (isInternalError) {
    if (lower.includes("checksum")) return new Ddu64ChecksumError(message, error);
    if (lower.includes("obfuscation")) return new Ddu64ObfuscationError(message, error);
    if (isAdapterCapabilityErrorMessage(message)) {
      return new Ddu64AdapterError(message, fallbackOperation, error);
    }
    if (lower.includes("encryptionkey") || lower.includes("encrypted payload requires")) {
      return fallbackOperation === "encode"
        ? new Ddu64EncryptionError(message, error)
        : new Ddu64DecryptionError(message, error);
    }
    if (
      lower.includes("decrypt") ||
      lower.includes("decryption") ||
      lower.includes("incorrect key")
    ) {
      return new Ddu64DecryptionError(message, error);
    }
    if (lower.includes("encrypt")) {
      return new Ddu64EncryptionError(message, error);
    }
    if (lower.includes("decompress") || lower.includes("inflate")) {
      return new Ddu64DecompressionError(message, error);
    }
    if (lower.includes("compress") || lower.includes("brotli")) {
      return new Ddu64CompressionError(message, error);
    }
    if (lower.includes("limit") || lower.includes("exceeds")) {
      return new Ddu64LimitError(message, fallbackOperation, error);
    }
    if (lower.includes("charset") || lower.includes("character") || lower.includes("invalid")) {
      return new Ddu64CharsetError(message, error);
    }
  }

  if (fallbackOperation === "stream") return new Ddu64StreamError(message, error);
  return fallbackOperation === "encode"
    ? new Ddu64EncodeError(message, error)
    : new Ddu64DecodeError(message, error);
}
