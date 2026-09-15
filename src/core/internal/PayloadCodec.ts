/**
 * Payload BitPack/native Base64 encode/decode helpers.
 *
 * @module core/internal/PayloadCodec
 */

import type { BitPackConfig } from "../BitPack.js";
import type { DduInternalOptions } from "../types.js";
import { decodeNativeBase64, encodeNativeBase64 } from "./NativeBase64FastPath.js";
import {
  packPow2ToString,
  packNonPow2ToString,
  unpackPow2FromString,
  unpackNonPow2FromString,
} from "./IndexStringMapper.js";
import { buildFooter } from "../wireFormat.js";
import { lookupCharIndex } from "./CharsetLookup.js";

type CompressionAlgorithm = "deflate" | "brotli";

export interface PayloadCodecContext {
  bitPackConfig: BitPackConfig;
  canUseNativeBase64: boolean;
  dduCharCodes: Uint16Array;
  dduCharCodeLookup: Int32Array;
  dduCharCodeLookupOffset: number;
  paddingChar: string;
  useRepeatPadding: boolean;
  bitsPerPadChar: number;
}

export function encodePayload(
  data: Uint8Array,
  compressionAlgorithm: CompressionAlgorithm | undefined,
  isEncrypted: boolean,
  options: DduInternalOptions | undefined,
  context: PayloadCodecContext,
): string {
  if (data.length === 0) return "";

  const nativeEncoded = context.canUseNativeBase64 ? encodeNativeBase64(data) : null;
  let paddingBits: number;
  let payload: string;

  if (nativeEncoded) {
    paddingBits = nativeEncoded.paddingBits;
    payload = nativeEncoded.payload;
  } else if (context.bitPackConfig.usePowerOfTwo) {
    // 2의 제곱수: 비트팩 + charset 매핑을 한 패스로 융합(중간 인덱스 배열 제거)
    const fused = packPow2ToString(data, context.bitPackConfig.bitLength, context.dduCharCodes);
    paddingBits = fused.paddingBits;
    payload = fused.payload;
  } else {
    // 비-2의 제곱수: 인덱스 쌍 비트팩 + charset 매핑을 한 패스로 융합
    const fused = packNonPow2ToString(
      data,
      context.bitPackConfig.bitLength,
      context.bitPackConfig.charsetSize,
      context.dduCharCodes,
    );
    paddingBits = fused.paddingBits;
    payload = fused.payload;
  }

  if (options?.omitFooter) return payload;

  const footer = buildFooter({
    paddingBits,
    compressionAlgorithm,
    isEncrypted,
    paddingChar: context.paddingChar,
    useRepeatPadding: context.useRepeatPadding,
    bitsPerPadChar: context.bitsPerPadChar,
    pipelineVersion: isEncrypted ? 4 : 2,
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
        (codeUnit) =>
          lookupCharIndex(context.dduCharCodeLookup, codeUnit, context.dduCharCodeLookupOffset) >=
          0,
      )
    : null;
  if (nativeDecoded) return nativeDecoded;

  // 2의 제곱수: charCodeAt→인덱스 룩업과 비트 언팩을 한 패스로 융합(중간 인덱스 배열 제거)
  if (context.bitPackConfig.usePowerOfTwo) {
    return unpackPow2FromString(
      cleanedInput,
      paddingBits,
      context.bitPackConfig.bitLength,
      context.dduCharCodeLookup,
      context.dduCharCodeLookupOffset,
    );
  }

  // 비-2의 제곱수: 인덱스 쌍 비트 언팩을 한 패스로 융합(중간 인덱스 배열 제거)
  return unpackNonPow2FromString(
    cleanedInput,
    paddingBits,
    context.bitPackConfig.bitLength,
    context.bitPackConfig.charsetSize,
    context.dduCharCodeLookup,
    context.dduCharCodeLookupOffset,
  );
}
