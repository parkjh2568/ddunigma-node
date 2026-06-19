/**
 * 전체 Node.js 기본(lean) 진입점.
 *
 * 인코딩 + 한글 난독화(라이브러리 주목적: 재미 + 시각적 난독화)를 제공합니다.
 * 압축/암호화/체크섬/Web Streams는 secure 진입점(`@ddunigma/node/secure`)으로
 * 이전되었습니다. 어댑터(zlib/crypto)를 주입하지 않으므로 기본 번들에서
 * crypto/zlib/CRC32가 트리셰이킹됩니다.
 *
 * @module index
 * @packageDocumentation
 */

// ─── 메인 인코더 ────────────────────────────────────────────────────────────

export { Ddu64Node as Ddu64 } from "./Ddu64Node.js";
export { Ddu64Node } from "./Ddu64Node.js";
export { Ddu64Core } from "./core/Ddu64Core.js";

// ─── 타입 및 열거형 ──────────────────────────────────────────────────────────

export { DduSetSymbol } from "./core/types.js";
export type {
  DduBaseOptions,
  DduBaseConstructorOptions,
  DduEncodeStats,
  DduProgressInfo,
  CharSetConfig,
  CharSetInfo,
  EncodingProfile,
  ObfuscationLayer,
  DduSetSymbolInput,
} from "./core/types.js";

// ─── 유틸리티 ────────────────────────────────────────────────────────────────

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

// ─── 런타임 감지 ─────────────────────────────────────────────────────────────

export { detectRuntime } from "./adapters/runtime.js";

// ─── 난독화 ──────────────────────────────────────────────────────────────────

export {
  HangulObfuscationLayer,
  createEncoderObfuscationLayer,
} from "./obfuscation/ObfuscationLayer.js";
