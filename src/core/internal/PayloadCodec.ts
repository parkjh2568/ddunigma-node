/**
 * Payload BitPack/WASM/native Base64 encode/decode helpers.
 *
 * @module core/internal/PayloadCodec
 */

import { bitPackDecode, bitPackEncode, type BitPackConfig } from "../BitPack.js";
import type { DduOptions } from "../types.js";
import { getWasmCodecSync } from "../../wasm/WasmCodec.js";
import {
  decodeNativeBase64,
  encodeNativeBase64,
} from "./NativeBase64FastPath.js";
import { indicesToString } from "./IndexStringMapper.js";
import { buildEncodeFooter } from "./EncodeFinalize.js";

type CompressionAlgorithm = "deflate" | "brotli";

/**
 * 인덱스 배열을 Uint16Array로 할당하기 시작하는 JS fallback 임계값.
 * wasmThreshold는 WASM 사용 여부, 이 값은 JS 경로의 컨테이너 선택만 담당합니다.
 */
const TYPED_INDICES_THRESHOLD = 4096;

export interface PayloadCodecContext {
  bitLength: number;
  usePowerOfTwo: boolean;
  bitPackConfig: BitPackConfig;
  wasmThreshold: number;
  canUseNativeBase64: boolean;
  dduCharCodes: Uint16Array;
  dduCharCodeLookup: Int32Array;
  paddingChar: string;
  useRepeatPadding: boolean;
  bitsPerPadChar: number;
}

export function encodePayload(
  data: Uint8Array,
  compressionAlgorithm: CompressionAlgorithm | undefined,
  isEncrypted: boolean,
  options: DduOptions | undefined,
  context: PayloadCodecContext,
): string {
  if (data.length === 0) return "";

  const nativeEncoded = context.canUseNativeBase64 ? encodeNativeBase64(data) : null;
  let paddingBits: number;
  let payload: string;

  if (nativeEncoded) {
    paddingBits = nativeEncoded.paddingBits;
    payload = nativeEncoded.payload;
  } else {
    const encoded = encodeWithBitPack(data, context);
    paddingBits = encoded.paddingBits;
    payload = indicesToString(encoded.indices, context.dduCharCodes);
  }

  const footer = buildEncodeFooter({
    paddingBits,
    compressionAlgorithm,
    isEncrypted,
    paddingChar: context.paddingChar,
    useRepeatPadding: context.useRepeatPadding,
    bitsPerPadChar: context.bitsPerPadChar,
    omitFooter: options?.omitFooter,
  });

  return payload + footer;
}

export function decodePayload(
  cleanedInput: string,
  paddingBits: number,
  context: PayloadCodecContext,
): Uint8Array {
  const inputLen = cleanedInput.length;
  if (inputLen === 0) return new Uint8Array(0);

  const nativeDecoded = context.canUseNativeBase64
    ? decodeNativeBase64(
        cleanedInput,
        paddingBits,
        (codeUnit) => context.dduCharCodeLookup[codeUnit] >= 0,
      )
    : null;
  if (nativeDecoded) return nativeDecoded;

  const shouldUseTypedIndices =
    shouldUseWasm(inputLen, context) || inputLen >= TYPED_INDICES_THRESHOLD;
  const indices = shouldUseTypedIndices
    ? new Uint16Array(inputLen)
    : new Array<number>(inputLen);

  for (let i = 0; i < inputLen; i++) {
    const val = context.dduCharCodeLookup[cleanedInput.charCodeAt(i)];
    if (val < 0) {
      throw new Error(`[Ddu64 decode] Invalid character "${cleanedInput[i]}" at ${i}`);
    }
    indices[i] = val;
  }

  const wasm = shouldUseWasm(inputLen, context) ? getWasmCodecSync() : null;
  if (wasm?.ready && context.usePowerOfTwo) {
    const wasmIndices = indices instanceof Uint16Array ? indices : Uint16Array.from(indices);
    return wasm.decode(wasmIndices, context.bitLength, paddingBits);
  }

  return bitPackDecode(indices, paddingBits, context.bitPackConfig);
}

function encodeWithBitPack(
  data: Uint8Array,
  context: PayloadCodecContext,
): { indices: ArrayLike<number>; paddingBits: number } {
  const wasm = shouldUseWasm(data.length, context) ? getWasmCodecSync() : null;
  if (wasm?.ready && context.usePowerOfTwo) {
    return wasm.encode(data, context.bitLength);
  }
  return bitPackEncode(data, context.bitPackConfig);
}

function shouldUseWasm(inputLength: number, context: PayloadCodecContext): boolean {
  return inputLength >= context.wasmThreshold;
}
