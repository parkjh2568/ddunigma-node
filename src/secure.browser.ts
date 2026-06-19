/**
 * Secure 진입점 (브라우저 조건 빌드).
 *
 * 압축(CompressionStream)·암호화(WebCrypto)·체크섬·Web Streams를 포함한 배터리
 * 풀세트를 BrowserAdapter 기반으로 제공합니다. Node.js 내장 모듈(zlib/crypto)을
 * 정적으로 import하지 않으므로 브라우저 번들에 끌려오지 않습니다.
 *
 * @module secure.browser
 * @packageDocumentation
 */

import { BrowserAdapter } from "./adapters/BrowserAdapter.js";

// ─── Secure 인코더 ───────────────────────────────────────────────────────────

export { Ddu64SecureBrowser as Ddu64 } from "./Ddu64SecureBrowser.js";
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

// ─── 브라우저 어댑터 ─────────────────────────────────────────────────────────

export { BrowserAdapter } from "./adapters/BrowserAdapter.js";

// ─── 런타임 감지 ─────────────────────────────────────────────────────────────

export { detectRuntime } from "./adapters/runtime.js";

export async function getAdapter(): Promise<BrowserAdapter> {
  return new BrowserAdapter();
}

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
