/**
 * ddunigma 비트 패킹 가속을 위한 WASM 로더 및 통합.
 *
 * 순수 JavaScript 구현과 바이트 단위로 동일한 선택적 WASM 가속
 * 인코딩/디코딩을 제공합니다. WASM을 사용할 수 없거나 실패하면
 * 조용히 JS로 폴백합니다.
 *
 * @module wasm/WasmCodec
 */

import type { WasmCodec } from "../core/types.js";

// ─── Constants ───────────────────────────────────────────────────────────────

/** WASM을 사용하는 기본 임계값 (바이트 단위, 16384바이트) */
export const DEFAULT_WASM_THRESHOLD = 16 * 1024;

/** 설정 가능한 최소 WASM 임계값 */
export const MIN_WASM_THRESHOLD = 1024;

/** 설정 가능한 최대 WASM 임계값 */
export const MAX_WASM_THRESHOLD = 1048576;

/** WASM linear memory 보유량을 제한하기 위한 기본 최대 payload 크기 */
export const DEFAULT_WASM_MAX_BYTES = 8 * 1024 * 1024;

/** preloadWasm() 타임아웃 (밀리초) */
const PRELOAD_TIMEOUT_MS = 10_000;

/** 온디맨드 WASM 초기화 타임아웃 (밀리초) */
const ON_DEMAND_TIMEOUT_MS = 5_000;

/** WASM 바이너리 바이트 로더 */
export type WasmByteLoader = () => Promise<ArrayBuffer | null>;

// ─── WASM 인스턴스 내보내기 인터페이스 ───────────────────────────────────────

/**
 * 컴파일된 WASM 모듈에서 기대하는 내보내기.
 */
interface WasmExports {
  memory: WebAssembly.Memory;
  alloc(size: number): number;
  dealloc(ptr: number, size: number): void;
  encode(
    inputPtr: number,
    inputLen: number,
    bitLength: number,
    charsetSize: number,
    usePowerOfTwo: number,
  ): number;
  decode(
    indicesPtr: number,
    indicesLen: number,
    bitLength: number,
    charsetSize: number,
    usePowerOfTwo: number,
    paddingBits: number,
  ): number;
  get_result_ptr(): number;
  get_padding_bits(): number;
  release_result(): void;
}

// ─── 모듈 상태 ──────────────────────────────────────────────────────────────

/** 싱글톤 WASM 코덱 인스턴스 (초기화되지 않으면 null) */
let wasmCodecInstance: WasmCodecImpl | null = null;

/** 초기화가 시도되었는지 여부 */
let initAttempted = false;

/** 초기화가 실패했는지 여부 (반복 시도 방지) */
let initFailed = false;

/** 진행 중인 초기화 Promise (동시 호출 중복 제거) */
let initPromise: Promise<void> | null = null;

/** 현재 런타임에서 사용할 WASM 바이트 로더 */
let wasmByteLoader: WasmByteLoader = loadWasmBytesViaFetch;

// ─── WasmCodecImpl ───────────────────────────────────────────────────────────

/**
 * WebAssembly 모듈로 지원되는 WasmCodec 인터페이스 구현.
 */
class WasmCodecImpl implements WasmCodec {
  private readonly exports: WasmExports;

  constructor(exports: WasmExports) {
    this.exports = exports;
  }

  get ready(): boolean {
    return true;
  }

  /**
   * WASM 비트 패킹을 사용하여 바이트를 charset 인덱스로 인코딩합니다.
   */
  encode(input: Uint8Array, bitLength: number): { indices: Uint16Array; paddingBits: number } {
    const { exports } = this;
    assertWasmBitLength(bitLength);

    if (input.length === 0) {
      return { indices: new Uint16Array(0), paddingBits: 0 };
    }

    // WASM에 입력용 메모리 할당
    const inputPtr = exports.alloc(input.length);
    const wasmMemory = new Uint8Array(exports.memory.buffer);
    wasmMemory.set(input, inputPtr);

    // WASM 인코딩 호출 (bitLength 기반 2의 제곱수 감지 사용)
    // 표준 DDU charset(64자)의 경우, charsetSize = 2^bitLength
    const charsetSize = 1 << bitLength;
    const usePowerOfTwo = 1; // DDU charset은 항상 2의 제곱수

    try {
      const resultLen = exports.encode(
        inputPtr,
        input.length,
        bitLength,
        charsetSize,
        usePowerOfTwo,
      );
      const expectedLength = Math.ceil((input.length * 8) / bitLength);
      if (resultLen === 0xffffffff || resultLen !== expectedLength) {
        throw new Error("[WasmCodec encode] Invalid result length");
      }

      // WASM 메모리에서 결과 읽기
      const resultPtr = exports.get_result_ptr();
      const resultMemory = new Uint16Array(exports.memory.buffer, resultPtr, resultLen);

      // 결과 복사 (다음 alloc에서 WASM 메모리가 무효화될 수 있음)
      const result = new Uint16Array(resultLen);
      result.set(resultMemory);

      return { indices: result, paddingBits: exports.get_padding_bits() };
    } finally {
      exports.release_result();
      // 입력 메모리 해제
      exports.dealloc(inputPtr, input.length);
    }
  }

  /**
   * WASM 비트 언패킹을 사용하여 charset 인덱스를 바이트로 디코딩합니다.
   */
  decode(indices: Uint16Array, bitLength: number, paddingBits: number): Uint8Array {
    const { exports } = this;
    assertWasmBitLength(bitLength);
    if (!Number.isInteger(paddingBits) || paddingBits < 0 || paddingBits >= bitLength) {
      throw new RangeError(
        `[WasmCodec decode] paddingBits must be an integer in [0, ${bitLength - 1}], got ${paddingBits}`,
      );
    }

    if (indices.length === 0) {
      if (paddingBits !== 0) {
        throw new RangeError("[WasmCodec decode] Empty input requires paddingBits=0");
      }
      return new Uint8Array(0);
    }

    // WASM에 인덱스용 메모리 할당 (u16 = 각 2바이트)
    const byteLen = indices.length * 2;
    const indicesPtr = exports.alloc(byteLen);
    const wasmMemory = new Uint16Array(exports.memory.buffer, indicesPtr, indices.length);
    wasmMemory.set(indices);

    const charsetSize = 1 << bitLength;
    const usePowerOfTwo = 1;

    try {
      const resultLen = exports.decode(
        indicesPtr,
        indices.length,
        bitLength,
        charsetSize,
        usePowerOfTwo,
        paddingBits,
      );

      // 에러 센티넬 확인
      if (resultLen === 0xffffffff) {
        throw new Error("[WasmCodec decode] Invalid index in input");
      }
      const expectedLength = Math.floor((indices.length * bitLength - paddingBits) / 8);
      if (resultLen !== expectedLength) {
        throw new Error("[WasmCodec decode] Invalid result length");
      }

      // WASM 메모리에서 결과 읽기
      const resultPtr = exports.get_result_ptr();
      const resultMemory = new Uint8Array(exports.memory.buffer, resultPtr, resultLen);

      // 결과 복사
      const result = new Uint8Array(resultLen);
      result.set(resultMemory);

      return result;
    } finally {
      exports.release_result();
      exports.dealloc(indicesPtr, byteLen);
    }
  }
}

function assertWasmBitLength(bitLength: number): void {
  if (!Number.isInteger(bitLength) || bitLength < 1 || bitLength > 16) {
    throw new RangeError(`[WasmCodec] bitLength must be an integer in [1, 16], got ${bitLength}`);
  }
}

// ─── WASM 로딩 ───────────────────────────────────────────────────────────────

/**
 * fetch 기반 WASM 바이너리 바이트 로더.
 *
 * 브라우저, Deno, Workers처럼 URL 기반 모듈 로딩을 지원하는 런타임에서 사용합니다.
 * Node.js 파일시스템 로더는 `WasmCodecNode.ts`에서 별도로 주입합니다.
 */
async function loadWasmBytesViaFetch(): Promise<ArrayBuffer | null> {
  try {
    if (typeof fetch !== "function") return null;
    const response = await fetch(new URL("./wasm/codec.wasm", import.meta.url));
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * 바이너리 바이트에서 WASM 모듈을 인스턴스화합니다.
 * 인스턴스화에 실패하면 null을 반환합니다.
 */
async function instantiateWasm(bytes: ArrayBuffer): Promise<WasmExports | null> {
  try {
    // 최소 WASM 모듈 크기 검증 (유효한 모듈은 매직 헤더 이상이 필요)
    if (bytes.byteLength < 16) {
      return null;
    }

    // WASM 매직 넘버 검증
    const magic = new Uint8Array(bytes, 0, 4);
    if (magic[0] !== 0x00 || magic[1] !== 0x61 || magic[2] !== 0x73 || magic[3] !== 0x6d) {
      return null;
    }

    // 모듈 검증을 위해 먼저 컴파일 시도
    let module: WebAssembly.Module;
    try {
      module = await WebAssembly.compile(bytes);
    } catch {
      return null;
    }

    const instance = await WebAssembly.instantiate(module, {});
    const exports = instance.exports as unknown as WasmExports;

    // 필수 내보내기 존재 여부 검증
    if (
      typeof exports.alloc !== "function" ||
      typeof exports.dealloc !== "function" ||
      typeof exports.encode !== "function" ||
      typeof exports.decode !== "function" ||
      typeof exports.get_result_ptr !== "function" ||
      typeof exports.get_padding_bits !== "function" ||
      typeof exports.release_result !== "function" ||
      !exports.memory
    ) {
      return null;
    }

    return exports;
  } catch {
    return null;
  }
}

/**
 * 내부 초기화 로직.
 * WASM 모듈을 로드하고 인스턴스화합니다.
 * throw하지 않음 — 성공 시 true, 실패 시 false를 반환합니다.
 */
async function initWasm(): Promise<boolean> {
  try {
    if (wasmCodecInstance) return true;
    if (initFailed) return false;

    const bytes = await wasmByteLoader();
    if (!bytes) {
      initFailed = true;
      return false;
    }

    const exports = await instantiateWasm(bytes);
    if (!exports) {
      initFailed = true;
      return false;
    }

    wasmCodecInstance = new WasmCodecImpl(exports);
    return true;
  } catch {
    initFailed = true;
    return false;
  }
}

/**
 * 지정된 시간 후 reject하는 타임아웃 Promise를 생성합니다.
 * Promise와 타이머를 정리하는 함수를 모두 반환합니다.
 */
function createTimeout(
  ms: number,
  message: string,
): { promise: Promise<never>; clear: () => void } {
  let timeoutId: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  const clear = () => clearTimeout(timeoutId);
  return { promise, clear };
}

// ─── 공개 API ────────────────────────────────────────────────────────────────

/**
 * WASM 모듈을 사전 로드하고 초기화합니다.
 *
 * 첫 번째 인코딩/디코딩 연산 전에 WASM이 준비되도록 애플리케이션 초기에
 * 호출하세요. WASM이 초기화되면 resolve되고, 10초 내에 초기화에 실패하면
 * reject됩니다.
 *
 * @throws WASM 초기화가 실패하거나 타임아웃(10초)된 경우 에러
 */
export async function preloadWasm(): Promise<void> {
  // 이미 초기화되었으면 즉시 resolve
  if (wasmCodecInstance) return;

  // 초기화가 진행 중이면 대기
  if (initPromise) return initPromise;

  const timeout = createTimeout(
    PRELOAD_TIMEOUT_MS,
    "[Ddu64 wasm] WASM initialization timed out (10s)",
  );

  const doInit = async (): Promise<void> => {
    try {
      const success = await initWasm();
      if (!success) {
        throw new Error("[Ddu64 wasm] WASM initialization failed");
      }
    } finally {
      timeout.clear();
    }
  };

  initPromise = Promise.race([doInit(), timeout.promise]).finally(() => {
    initPromise = null;
    initAttempted = true;
  });

  return initPromise;
}

/**
 * WASM 코덱이 준비되었으면 반환하거나, 온디맨드 초기화를 시도합니다.
 *
 * `preloadWasm()`이 호출되지 않았으면 5초 타임아웃으로 초기화를 시도합니다.
 * WASM을 사용할 수 없으면 null을 반환합니다.
 *
 * 이 함수는 throw하지 않음 — 실패 시 null을 반환합니다.
 */
export function getWasmCodec(): WasmCodec | null {
  // 이미 초기화되었으면 즉시 반환
  if (wasmCodecInstance) return wasmCodecInstance;

  // 초기화가 시도되었고 실패했으면 재시도하지 않음
  if (initFailed) return null;

  // preloadWasm()이 호출되지 않았으면 온디맨드 초기화 트리거
  if (!initAttempted && !initPromise) {
    initAttempted = true;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // 온디맨드 초기화는 reject하지 않음 — 모든 에러를 삼킴
    initPromise = new Promise<void>((resolve) => {
      timeoutId = setTimeout(() => {
        initFailed = true;
        resolve();
      }, ON_DEMAND_TIMEOUT_MS);

      initWasm()
        .then((success) => {
          if (!success) initFailed = true;
        })
        .catch(() => {
          initFailed = true;
        })
        .finally(() => {
          if (timeoutId !== undefined) clearTimeout(timeoutId);
          resolve();
        });
    }).finally(() => {
      initPromise = null;
    });
  }

  // 온디맨드 초기화는 비동기이므로 이번 호출에서는 WASM이 아직 준비되지 않음
  return null;
}

/**
 * WASM 코덱이 이미 초기화된 경우에만 반환합니다.
 * 온디맨드 초기화를 트리거하지 않습니다.
 * WASM이 준비되지 않았으면 null을 반환합니다.
 */
export function getWasmCodecSync(): WasmCodec | null {
  return wasmCodecInstance;
}

/**
 * WASM 임계값을 검증합니다.
 * 유효 범위 [1024, 1048576] 내로 클램핑된 값을 반환합니다.
 * Infinity를 전달하면 WASM hot path를 비활성화합니다.
 *
 * @param threshold - 검증할 임계값
 * @returns 검증된 임계값
 * @throws 값이 유한한 숫자 또는 Infinity가 아닌 경우 에러
 */
export function validateWasmThreshold(threshold: number): number {
  if (threshold === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(threshold)) {
    throw new Error(
      `[Ddu64 config] wasmThreshold must be a finite number or Infinity, got ${threshold}`,
    );
  }
  return Math.max(MIN_WASM_THRESHOLD, Math.min(MAX_WASM_THRESHOLD, Math.round(threshold)));
}

export function validateWasmMaxBytes(maxBytes: number): number {
  if (maxBytes === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(maxBytes) || maxBytes < MIN_WASM_THRESHOLD) {
    throw new Error(
      `[Ddu64 config] wasmMaxBytes must be at least ${MIN_WASM_THRESHOLD} or Infinity, got ${maxBytes}`,
    );
  }
  return Math.floor(maxBytes);
}

/**
 * WASM 바이트 로더를 교체합니다. 플랫폼별 진입점에서만 사용합니다.
 * @internal
 */
export function _setWasmByteLoader(loader: WasmByteLoader): void {
  if (wasmByteLoader === loader) return;
  wasmByteLoader = loader;
  if (!wasmCodecInstance && !initPromise) {
    initAttempted = false;
    initFailed = false;
  }
}

/**
 * WASM 모듈 상태를 초기화합니다. 테스트 목적으로만 사용.
 * @internal
 */
export function _resetWasmState(): void {
  wasmCodecInstance = null;
  initAttempted = false;
  initFailed = false;
  initPromise = null;
  wasmByteLoader = loadWasmBytesViaFetch;
}
