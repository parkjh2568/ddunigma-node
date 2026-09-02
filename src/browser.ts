/**
 * 브라우저 최적화 기본 진입점.
 *
 * 인코딩·체크섬·한글 난독화를 동기로 제공합니다. 비동기 압축/암복호화가 실제로
 * 사용될 때만 BrowserAdapter를 동적 import합니다. Web Streams와 명시적 어댑터는
 * 브라우저 조건에서 `@ddunigma/node/secure`를 사용하세요.
 *
 * Node.js 내장 모듈을 직접 임포트하지 않습니다.
 *
 * @module browser
 * @packageDocumentation
 */

// ─── 브라우저 인코더 ─────────────────────────────────────────────────────────

export { Ddu64Browser as Ddu64, Ddu64Browser } from "./Ddu64Browser.js";
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

// ─── 런타임 감지 ─────────────────────────────────────────────────────────────

export { detectRuntime } from "./adapters/runtime.js";

// ─── 난독화 ──────────────────────────────────────────────────────────────────

export {
  HangulObfuscationLayer,
  createEncoderObfuscationLayer,
} from "./obfuscation/ObfuscationLayer.js";

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
