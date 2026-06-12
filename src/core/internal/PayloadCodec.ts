/**
 * Payload BitPack/native Base64 encode/decode helpers.
 *
 * @module core/internal/PayloadCodec
 */

import { bitPackDecode, bitPackEncode, type BitPackConfig } from "../BitPack.js";
import type { DduOptions } from "../types.js";
import { decodeNativeBase64, encodeNativeBase64 } from "./NativeBase64FastPath.js";
import { indicesToString } from "./IndexStringMapper.js";
import { buildEncodeFooter } from "./EncodeFinalize.js";
import { lookupCharIndex } from "./CharsetLookup.js";

type CompressionAlgorithm = "deflate" | "brotli";

/** 대형 입력에서 typed index 배열(Uint16Array)로 전환하는 임계값(문자 수). */
const TYPED_INDEX_THRESHOLD = 16384;

export interface PayloadCodecContext {
  bitPackConfig: BitPackConfig;
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
    const encoded = bitPackEncode(data, context.bitPackConfig);
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

  // 대형 payload는 typed indices(Uint16Array)로 메모리 형태를 통일합니다.
  const shouldUseTypedIndices = inputLen >= TYPED_INDEX_THRESHOLD;
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

  return bitPackDecode(indices, paddingBits, context.bitPackConfig);
}
