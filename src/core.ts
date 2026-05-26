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
