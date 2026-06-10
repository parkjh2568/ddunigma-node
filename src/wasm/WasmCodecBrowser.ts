/**
 * Browser/core WASM loader with the codec embedded as a data URL.
 *
 * Keeping the bytes in the JavaScript graph lets downstream bundlers relocate
 * or concatenate the package without losing a relative `codec.wasm` asset.
 *
 * @module wasm/WasmCodecBrowser
 */

import codecDataUrl from "./codec.wasm";
import type { WasmCodec } from "../core/types.js";
import {
  _setWasmByteLoader,
  getWasmCodec as getWasmCodecBase,
  getWasmCodecSync as getWasmCodecSyncBase,
  preloadWasm as preloadWasmBase,
} from "./WasmCodec.js";

async function loadEmbeddedWasm(): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(codecDataUrl);
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

function ensureBrowserWasmLoader(): void {
  _setWasmByteLoader(loadEmbeddedWasm);
}

export async function preloadWasm(): Promise<void> {
  ensureBrowserWasmLoader();
  return preloadWasmBase();
}

export function getWasmCodec(): WasmCodec | null {
  ensureBrowserWasmLoader();
  return getWasmCodecBase();
}

export function getWasmCodecSync(): WasmCodec | null {
  ensureBrowserWasmLoader();
  return getWasmCodecSyncBase();
}

export {
  validateWasmThreshold,
  validateWasmMaxBytes,
  DEFAULT_WASM_THRESHOLD,
  DEFAULT_WASM_MAX_BYTES,
  MIN_WASM_THRESHOLD,
  MAX_WASM_THRESHOLD,
} from "./WasmCodec.js";
