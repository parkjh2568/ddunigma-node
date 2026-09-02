/**
 * 전체 Node.js 기본 진입점.
 *
 * 인코딩·체크섬·한글 난독화를 동기로 제공합니다. 비동기 압축/암복호화가 실제로
 * 사용될 때만 NodeAdapter를 동적 import합니다. Web Streams와 명시적 어댑터,
 * 동기 secure API는 `@ddunigma/node/secure`에서 제공합니다.
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
  DduSecureOptions,
  DduSecureConstructorOptions,
  DduOptions,
  DduConstructorOptions,
  DduEncodeStats,
  DduProgressInfo,
  CharSetConfig,
  CharSetInfo,
  EncodingProfile,
  ObfuscationLayer,
  PlatformAdapter,
  KeyDerivationOptions,
  KeyDerivationAlgorithm,
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
