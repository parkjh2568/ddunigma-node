/**
 * ddunigma custom error hierarchy.
 *
 * Public encode/decode APIs wrap internal/runtime failures in these typed
 * errors so callers can branch on a stable code without parsing messages.
 *
 * @module core/errors
 */

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

export class Ddu64InvalidInputError extends Ddu64Error {
  constructor(message: string, operation: Ddu64Operation = "construct", cause?: unknown) {
    super(message, { code: Ddu64ErrorCode.InvalidInput, operation, cause });
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
  // 도메인 에러는 발생 지점에서 분류하고, 외부 또는 예기치 못한 에러만 operation 기준으로 감쌉니다.
  if (isDdu64Error(error)) return error;

  const message = toErrorMessage(error);

  if (fallbackOperation === "stream") return new Ddu64StreamError(message, error);
  return fallbackOperation === "encode"
    ? new Ddu64EncodeError(message, error)
    : new Ddu64DecodeError(message, error);
}
