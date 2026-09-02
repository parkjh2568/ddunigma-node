/** Decode validation and limit helpers. @module core/internal/DecodeValidation */

import { lookupCharIndex } from "./CharsetLookup.js";
import { Ddu64DecodeError, Ddu64InvalidInputError } from "../errors.js";

const BYTE_BITS = 8;

/**
 * 디코드 비트 수(`numChunks * bitLength - paddingBits`)를 계산합니다.
 * 파이프라인에서 입력은 항상 정렬(`assertEncodedInputAligned`)되므로 `Math.ceil`은
 * pow2(chunkSize=1)·정렬된 non-pow2(짝수 길이) 모두에서 정확합니다.
 */
function decodedBitCount(
  cleanedInputLen: number,
  paddingBits: number,
  bitLength: number,
  usePowerOfTwo: boolean,
): number {
  const chunkSize = usePowerOfTwo ? 1 : 2;
  const numChunks = Math.ceil(cleanedInputLen / chunkSize);
  return numChunks * bitLength - paddingBits;
}

export function normalizeLimit(
  value: number | undefined,
  fallback: number,
  shouldThrow: boolean,
  name: string,
): number {
  if (value === undefined) return fallback;
  if (value === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(value) || value <= 0) {
    if (shouldThrow) {
      throw new Ddu64InvalidInputError(
        `[Ddu64 options] Invalid ${name}. Must be a positive finite number or Infinity.`,
      );
    }
    return fallback;
  }
  return Math.floor(value);
}

export function estimateDecodedBytes(
  cleanedInputLen: number,
  paddingBits: number,
  bitLength: number,
  usePowerOfTwo: boolean,
): number {
  if (cleanedInputLen === 0) return 0;
  if (paddingBits < 0 || paddingBits >= bitLength) {
    throw new Ddu64DecodeError(`[Ddu64 decode] Invalid padding bits: ${paddingBits}`);
  }
  const bits = decodedBitCount(cleanedInputLen, paddingBits, bitLength, usePowerOfTwo);
  if (bits < 0) throw new Ddu64DecodeError(`[Ddu64 decode] Invalid decoded bit length`);
  return Math.ceil(bits / BYTE_BITS);
}

export function assertEncodedInputAligned(cleanedInput: string, usePowerOfTwo: boolean): void {
  if (!usePowerOfTwo) {
    const chunkSize = 2;
    if (cleanedInput.length % chunkSize !== 0) {
      throw new Ddu64DecodeError(
        `[Ddu64 decode] Invalid encoded length for variable charset. Expected multiple of ${chunkSize}, got ${cleanedInput.length}`,
      );
    }
  }
}

export function assertDecodedBitLength(
  cleanedInput: string,
  paddingBits: number,
  bitLength: number,
  usePowerOfTwo: boolean,
): void {
  if (cleanedInput.length === 0) return;

  const bitCount = decodedBitCount(cleanedInput.length, paddingBits, bitLength, usePowerOfTwo);

  if (bitCount < 0 || bitCount % BYTE_BITS !== 0) {
    throw new Ddu64DecodeError(
      `[Ddu64 decode] Invalid encoded bit length. Expected a whole number of bytes, got ${bitCount} bits.`,
    );
  }
}

export function assertCanonicalPadding(
  cleanedInput: string,
  paddingBits: number,
  usePowerOfTwo: boolean,
  dduCharCodeLookup: Int32Array,
  charSetSize: number,
  lookupOffset: number,
): void {
  if (paddingBits === 0) return;
  if (cleanedInput.length === 0) {
    throw new Ddu64DecodeError("[Ddu64 decode] Invalid padding bits without payload");
  }

  const paddingMask = (1 << paddingBits) - 1;
  let lastValue: number;

  if (usePowerOfTwo) {
    const lastChar = cleanedInput[cleanedInput.length - 1];
    const value = lookupCharIndex(dduCharCodeLookup, lastChar.charCodeAt(0), lookupOffset);
    if (value < 0) {
      throw new Ddu64DecodeError(
        `[Ddu64 decode] Invalid character "${lastChar}" at ${cleanedInput.length - 1}`,
      );
    }
    lastValue = value;
  } else {
    const first = cleanedInput[cleanedInput.length - 2];
    const second = cleanedInput[cleanedInput.length - 1];
    const firstValue = lookupCharIndex(dduCharCodeLookup, first.charCodeAt(0), lookupOffset);
    const secondValue = lookupCharIndex(dduCharCodeLookup, second.charCodeAt(0), lookupOffset);
    if (firstValue < 0 || secondValue < 0) {
      throw new Ddu64DecodeError("[Ddu64 decode] Invalid character in final encoded chunk");
    }
    lastValue = firstValue * charSetSize + secondValue;
  }

  if ((lastValue & paddingMask) !== 0) {
    throw new Ddu64DecodeError("[Ddu64 decode] Invalid non-zero padding bits in final symbol");
  }
}
