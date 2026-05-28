/**
 * Native Base64 fast path helpers.
 *
 * These helpers are intentionally limited to the exact standard Base64
 * alphabet and `=` padding so custom DDU/V1 wire formats are never routed
 * through native Base64 by accident.
 *
 * @module core/internal/NativeBase64FastPath
 */

const STANDARD_BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_PADDING = "=";

export function canUseNativeBase64FastPath(
  charSet: readonly string[],
  paddingChar: string,
  usePowerOfTwo: boolean,
  bitLength: number,
): boolean {
  return (
    usePowerOfTwo &&
    bitLength === 6 &&
    paddingChar === BASE64_PADDING &&
    charSet.join("") === STANDARD_BASE64_ALPHABET
  );
}

export function encodeNativeBase64(
  data: Uint8Array,
): { payload: string; paddingBits: number } | null {
  const base64 = bytesToBase64(data);
  if (base64 === null) return null;

  let paddingChars = 0;
  let payloadLength = base64.length;
  while (payloadLength > 0 && base64[payloadLength - 1] === BASE64_PADDING) {
    paddingChars++;
    payloadLength--;
  }

  return {
    payload: base64.slice(0, payloadLength),
    paddingBits: paddingChars === 2 ? 4 : paddingChars === 1 ? 2 : 0,
  };
}

export function decodeNativeBase64(
  cleanedInput: string,
  paddingBits: number,
  isKnownChar: (codeUnit: number) => boolean,
): Uint8Array | null {
  const paddingChars = paddingBits === 4 ? 2 : paddingBits === 2 ? 1 : paddingBits === 0 ? 0 : -1;
  if (paddingChars < 0) return null;

  for (let i = 0; i < cleanedInput.length; i++) {
    if (!isKnownChar(cleanedInput.charCodeAt(i))) return null;
  }

  return base64ToBytes(cleanedInput + BASE64_PADDING.repeat(paddingChars));
}

function bytesToBase64(data: Uint8Array): string | null {
  const maybeBase64 = (data as Uint8Array & { toBase64?: () => string }).toBase64;
  if (typeof maybeBase64 === "function") {
    return maybeBase64.call(data);
  }

  const bufferCtor = (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer;
  if (bufferCtor?.from) {
    return bufferCtor.from(data.buffer, data.byteOffset, data.byteLength).toString("base64");
  }

  return null;
}

function base64ToBytes(input: string): Uint8Array | null {
  const uint8ArrayCtor = Uint8Array as typeof Uint8Array & {
    fromBase64?: (value: string) => Uint8Array;
  };
  if (typeof uint8ArrayCtor.fromBase64 === "function") {
    return uint8ArrayCtor.fromBase64(input);
  }

  const bufferCtor = (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer;
  if (bufferCtor?.from) {
    const buffer = bufferCtor.from(input, "base64");
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  return null;
}

