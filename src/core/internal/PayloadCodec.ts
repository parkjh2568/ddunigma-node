/**
 * Payload BitPack/WASM/native Base64 encode/decode helpers.
 *
 * @module core/internal/PayloadCodec
 */

import { bitPackDecode, bitPackEncode, type BitPackConfig } from "../BitPack.js";
import type { DduOptions } from "../types.js";
import { getWasmCodecSync } from "../../wasm/WasmCodec.js";
import { decodeNativeBase64, encodeNativeBase64 } from "./NativeBase64FastPath.js";
import { indicesToString } from "./IndexStringMapper.js";
import { buildEncodeFooter } from "./EncodeFinalize.js";
import { lookupCharIndex } from "./CharsetLookup.js";

type CompressionAlgorithm = "deflate" | "brotli";

export interface PayloadCodecContext {
  bitLength: number;
  usePowerOfTwo: boolean;
  bitPackConfig: BitPackConfig;
  wasmThreshold: number;
  wasmMaxBytes: number;
  canUseNativeBase64: boolean;
  dduCharCodes: Uint16Array;
  dduCharCodeLookup: Int32Array;
  paddingChar: string;
  useRepeatPadding: boolean;
  bitsPerPadChar: number;
  /** 암호화 페이로드 파이프라인 버전. 인코더는 항상 V4를 생성합니다(V3 읽기는 parseFooter의 레거시 호환). */
  encryptedPipelineVersion: 4;
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
    pipelineVersion: context.encryptedPipelineVersion,
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
        (codeUnit) => lookupCharIndex(context.dduCharCodeLookup, codeUnit) >= 0,
      )
    : null;
  if (nativeDecoded) return nativeDecoded;

  // WASM 전환 임계값부터 typed indices를 써서 대형 payload 메모리 형태를 통일합니다.
  const shouldUseTypedIndices = inputLen >= context.wasmThreshold;
  const indices = shouldUseTypedIndices ? new Uint16Array(inputLen) : new Array<number>(inputLen);

  const lookup = context.dduCharCodeLookup;
  const lookupLen = lookup.length;
  for (let i = 0; i < inputLen; i++) {
    const code = cleanedInput.charCodeAt(i);
    const val = code < lookupLen ? lookup[code] : -1;
    if (val < 0) {
      throw new Error(`[Ddu64 decode] Invalid character "${cleanedInput[i]}" at ${i}`);
    }
    indices[i] = val;
  }

  const wasm = shouldUseWasmDecode(inputLen, context) ? getWasmCodecSync() : null;
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
  const wasm = shouldUseWasmEncode(data.length, context) ? getWasmCodecSync() : null;
  if (wasm?.ready && context.usePowerOfTwo) {
    return wasm.encode(data, context.bitLength);
  }
  return bitPackEncode(data, context.bitPackConfig);
}

function shouldUseWasmEncode(inputLength: number, context: PayloadCodecContext): boolean {
  return inputLength >= context.wasmThreshold && inputLength <= context.wasmMaxBytes;
}

function shouldUseWasmDecode(inputLength: number, context: PayloadCodecContext): boolean {
  const estimatedBytes = Math.ceil((inputLength * context.bitLength) / 8);
  return estimatedBytes >= context.wasmThreshold && estimatedBytes <= context.wasmMaxBytes;
}
