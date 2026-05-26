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
  TestVector,
  KeyDerivationOptions,
  KeyDerivationAlgorithm,
} from "./core/types.js";

// ─── 유틸리티 ────────────────────────────────────────────────────────────────

export { CharsetBuilder } from "./core/CharsetBuilder.js";

// ─── Web Streams ─────────────────────────────────────────────────────────────

export { createReadableEncodeStream, createReadableDecodeStream } from "./streams/WebStreams.js";

// ─── 플랫폼 어댑터 ──────────────────────────────────────────────────────────

export { NodeAdapter } from "./adapters/NodeAdapter.js";
export { BrowserAdapter } from "./adapters/BrowserAdapter.js";
export { detectRuntime, getAdapter } from "./adapters/detect.js";

// ─── 난독화 ──────────────────────────────────────────────────────────────────

export { HangulObfuscationLayer, createObfuscationLayer } from "./obfuscation/ObfuscationLayer.js";

// ─── 워커 풀 ─────────────────────────────────────────────────────────────────

export { setWorkerPoolSize } from "./workers/WorkerPool.js";

// ─── WASM ───────────────────────────────────────────────────────────────────

export { preloadWasm, getWasmCodec, getWasmCodecSync } from "./wasm/WasmCodec.js";
