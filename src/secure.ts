/**
 * Secure 진입점 (Node.js 기본).
 *
 * 압축(deflate/brotli)·암호화(AES-256-GCM)·체크섬(CRC32)·Web Streams를 포함한
 * 배터리 풀세트를 제공합니다. NodeAdapter(zlib/crypto)를 주입하므로 Node.js 내장
 * 모듈에 의존합니다. 브라우저 빌드는 `secure.browser.ts`(조건부 매핑)가 담당합니다.
 *
 * @module secure
 * @packageDocumentation
 */

// ─── Secure 인코더 ───────────────────────────────────────────────────────────

export { Ddu64Secure as Ddu64 } from "./Ddu64Secure.js";
export { Ddu64Secure } from "./Ddu64Secure.js";
export { Ddu64SecureBrowser } from "./Ddu64SecureBrowser.js";
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

// ─── 플랫폼 어댑터 ──────────────────────────────────────────────────────────

export { NodeAdapter } from "./adapters/NodeAdapter.js";
export { BrowserAdapter } from "./adapters/BrowserAdapter.js";
export { detectRuntime, getAdapter } from "./adapters/detect.js";

// ─── Web Streams ─────────────────────────────────────────────────────────────

export { createReadableEncodeStream, createReadableDecodeStream } from "./streams/WebStreams.js";

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
  DduStreamOptions,
  DduEncodeStats,
  DduProgressInfo,
  CharSetConfig,
  CharSetInfo,
  EncodingProfile,
  PlatformAdapter,
  ObfuscationLayer,
  KeyDerivationOptions,
  KeyDerivationAlgorithm,
  DduSetSymbolInput,
} from "./core/types.js";
