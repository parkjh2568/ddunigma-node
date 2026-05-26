/**
 * 브라우저 최적화 진입점.
 *
 * 인코딩, 디코딩, CharsetBuilder, Web Streams, BrowserAdapter를 내보냅니다.
 *
 * 참고: DduPipeline은 Node.js `zlib` 모듈을 직접 임포트하므로
 * 이 진입점에서 제외됩니다. 브라우저 기반 인코딩/디코딩 파이프라인에는
 * BrowserAdapter와 함께 Ddu64Core를 사용하세요.
 *
 * @module browser
 * @packageDocumentation
 */

// ─── 코어 인코더 ─────────────────────────────────────────────────────────────

export { Ddu64Core as Ddu64 } from "./core/Ddu64Core.js";
export { Ddu64Core } from "./core/Ddu64Core.js";

// ─── Charset 빌더 ────────────────────────────────────────────────────────────

export { CharsetBuilder } from "./core/CharsetBuilder.js";

// ─── 브라우저 어댑터 ─────────────────────────────────────────────────────────

export { BrowserAdapter } from "./adapters/BrowserAdapter.js";

// ─── 런타임 감지 ─────────────────────────────────────────────────────────────

export { detectRuntime, getAdapter } from "./adapters/detect.js";

// ─── Web Streams ─────────────────────────────────────────────────────────────

export { createReadableEncodeStream, createReadableDecodeStream } from "./streams/WebStreams.js";

// ─── 난독화 ──────────────────────────────────────────────────────────────────

export { HangulObfuscationLayer, createObfuscationLayer } from "./obfuscation/ObfuscationLayer.js";

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
  PlatformAdapter,
  ObfuscationLayer,
  WasmCodec,
  WorkerPool,
  EncoderConfig,
  KeyDerivationOptions,
  KeyDerivationAlgorithm,
} from "./core/types.js";
