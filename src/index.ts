/**
 * 전체 Node.js 진입점.
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
  DduTextEncoding,
  KeyDerivationOptions,
  KeyDerivationAlgorithm,
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

// ─── Web Streams ─────────────────────────────────────────────────────────────

export { createReadableEncodeStream, createReadableDecodeStream } from "./streams/WebStreams.js";

// ─── 플랫폼 어댑터 ──────────────────────────────────────────────────────────

export { NodeAdapter } from "./adapters/NodeAdapter.js";
export { BrowserAdapter } from "./adapters/BrowserAdapter.js";
export { detectRuntime, getAdapter } from "./adapters/detect.js";

// ─── 난독화 ──────────────────────────────────────────────────────────────────

export {
  HangulObfuscationLayer,
  createObfuscationLayer,
  createEncoderObfuscationLayer,
} from "./obfuscation/ObfuscationLayer.js";
