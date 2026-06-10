/**
 * 코어 전용 진입점.
 *
 * 플랫폼 독립적인 Ddu64 인코더/디코더와 CharsetBuilder만 내보냅니다.
 *
 * 압축이나 암호화 없이 기본 인코딩/디코딩만 필요할 때
 * 최소 번들 크기를 위해 이 진입점을 사용하세요.
 *
 * @module core
 * @packageDocumentation
 */

// ─── 코어 인코더 ─────────────────────────────────────────────────────────────

export { Ddu64Core as Ddu64 } from "./core/Ddu64Core.js";
export { Ddu64Core } from "./core/Ddu64Core.js";

// ─── Charset 빌더 ────────────────────────────────────────────────────────────

export { CharsetBuilder } from "./core/CharsetBuilder.js";
export {
  Ddu64Error,
  Ddu64ErrorCode,
  Ddu64EncodeError,
  Ddu64DecodeError,
  Ddu64CompressionError,
  Ddu64DecompressionError,
  Ddu64EncryptionError,
  Ddu64DecryptionError,
  Ddu64ChecksumError,
  Ddu64CharsetError,
  Ddu64InvalidInputError,
  Ddu64LimitError,
  Ddu64AdapterError,
  Ddu64ObfuscationError,
  Ddu64StreamError,
  isDdu64Error,
} from "./core/errors.js";
export type { Ddu64Operation, Ddu64ErrorOptions } from "./core/errors.js";

// ─── WASM ───────────────────────────────────────────────────────────────────

export { preloadWasm, getWasmCodec, getWasmCodecSync } from "./wasm/WasmCodecBrowser.js";

// ─── 타입 및 열거형 ──────────────────────────────────────────────────────────

export { DduSetSymbol } from "./core/types.js";

export type {
  DduOptions,
  DduStreamOptions,
  DduConstructorOptions,
  DduEncodeStats,
  DduProgressInfo,
  CharSetConfig,
  CharSetInfo,
  EncodingProfile,
  PlatformAdapter,
  ObfuscationLayer,
  WasmCodec,
  KeyDerivationOptions,
  KeyDerivationAlgorithm,
  DduTextEncoding,
} from "./core/types.js";
