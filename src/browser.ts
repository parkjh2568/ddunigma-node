/**
 * 브라우저 최적화 진입점.
 *
 * 인코딩, 디코딩, CharsetBuilder, Web Streams, BrowserAdapter를 내보냅니다.
 *
 * Node.js 내장 모듈을 직접 임포트하지 않도록 BrowserAdapter 기반 구성만
 * 포함합니다.
 *
 * @module browser
 * @packageDocumentation
 */

import { BrowserAdapter } from "./adapters/BrowserAdapter.js";

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
  createObfuscationLayer,
  createEncoderObfuscationLayer,
} from "./obfuscation/ObfuscationLayer.js";

// ─── WASM ───────────────────────────────────────────────────────────────────

export { preloadWasm, getWasmCodec, getWasmCodecSync } from "./wasm/WasmCodec.js";

// ─── 타입 및 열거형 ──────────────────────────────────────────────────────────

export { DduSetSymbol } from "./core/types.js";

export type {
  DduOptions,
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
