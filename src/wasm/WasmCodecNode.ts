/**
 * Node.js 파일시스템 기반 WASM 로더.
 *
 * 브라우저/core 엔트리에서 Node.js 내장 모듈이 번들에 섞이지 않도록
 * Node 전용 진입점(`@ddunigma/node`)에서만 이 모듈을 가져옵니다.
 *
 * @module wasm/WasmCodecNode
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { _setWasmByteLoader } from "./WasmCodec.js";

async function readWasmFile(path: string): Promise<ArrayBuffer | null> {
  try {
    const buffer = await readFile(path);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } catch {
    return null;
  }
}

async function loadWasmBytesFromNodeFs(): Promise<ArrayBuffer | null> {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(currentDir, "wasm", "codec.wasm"),
    join(currentDir, "codec.wasm"),
    join(currentDir, "..", "wasm", "codec.wasm"),
  ];

  for (const candidate of candidates) {
    const bytes = await readWasmFile(candidate);
    if (bytes) return bytes;
  }

  return null;
}

_setWasmByteLoader(loadWasmBytesFromNodeFs);

export {
  preloadWasm,
  getWasmCodec,
  getWasmCodecSync,
  validateWasmThreshold,
  DEFAULT_WASM_THRESHOLD,
  MIN_WASM_THRESHOLD,
  MAX_WASM_THRESHOLD,
} from "./WasmCodec.js";
