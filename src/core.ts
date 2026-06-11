/**
 * 코어 전용 진입점.
 *
 * 플랫폼 독립적인 Ddu64 인코더/디코더와 CharsetBuilder만 내보냅니다.
 *
 * Node 전용 어댑터(zlib/crypto)를 제외하므로 압축·암호화는 호출 측에서 `adapter`를
 * 주입해야 동작합니다. 압축/암호화가 필요 없는 순수 인코딩/디코딩에 적합한 진입점입니다.
 *
 * 참고: 이 진입점은 WASM 가속 API(`preloadWasm` 등)를 재노출하며, WASM 바이너리를
 * data URL로 번들에 임베드합니다(약 20KB). 따라서 "압축/암호화 코드 제외"라는 의미의
 * 최소 진입점이지, WASM까지 0바이트인 초경량 번들은 아닙니다. WASM이 전혀 필요 없다면
 * `new Ddu64({ wasmThreshold: Infinity })`로 비활성화하고 `preloadWasm`을 호출하지
 * 않으면 됩니다.
 *
 * @module core
 * @packageDocumentation
 */

// ─── 코어 인코더 ─────────────────────────────────────────────────────────────

export { Ddu64Core as Ddu64 } from "./core/Ddu64Core.js";
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

// ─── WASM ───────────────────────────────────────────────────────────────────

export { preloadWasm, getWasmCodec, getWasmCodecSync } from "./wasm/WasmCodecBrowser.js";

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
  WasmCodec,
  WasmCodecConfig,
  KeyDerivationOptions,
  KeyDerivationAlgorithm,
  DduTextEncoding,
} from "./core/types.js";
