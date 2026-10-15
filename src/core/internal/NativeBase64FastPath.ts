/**
 * Native Base64 fast paths.
 *
 * These paths are intentionally limited to the exact standard Base64
 * alphabet and `=` padding so custom DDU/V1 wire formats are never routed
 * through native Base64 by accident.
 *
 * @module core/internal/NativeBase64FastPath
 */

const STANDARD_BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_PADDING = "=";
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")!.get!;
const typedArrayByteOffset = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteOffset",
)!.get!;

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
  let base64: string;
  const maybeBase64 = (data as Uint8Array & { toBase64?: () => string }).toBase64;
  if (typeof maybeBase64 === "function") {
    base64 = maybeBase64.call(data);
  } else {
    const bufferCtor = (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer;
    if (!bufferCtor?.from) return null;
    // 재정의 가능한 메타데이터 대신 실제 view를 사용하며 바이트 복사는 추가하지 않습니다.
    base64 = bufferCtor
      .from(typedArrayBuffer.call(data), typedArrayByteOffset.call(data), data.length)
      .toString("base64");
  }

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

  const uint8ArrayCtor = Uint8Array as typeof Uint8Array & {
    fromBase64?: (value: string) => Uint8Array;
  };
  const fromBase64 = uint8ArrayCtor.fromBase64;
  const bufferCtor =
    typeof fromBase64 === "function"
      ? undefined
      : (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer;
  // 네이티브 decoder가 없으면 fallback의 문자 검증·언팩을 바로 사용합니다.
  if (typeof fromBase64 !== "function" && !bufferCtor?.from) return null;

  for (let i = 0; i < cleanedInput.length; i++) {
    if (!isKnownChar(cleanedInput.charCodeAt(i))) return null;
  }

  const input = cleanedInput + BASE64_PADDING.repeat(paddingChars);
  if (typeof fromBase64 === "function") {
    return fromBase64.call(uint8ArrayCtor, input);
  }

  if (!bufferCtor?.from) return null;
  const buffer = bufferCtor.from(input, "base64");
  return new Uint8Array(buffer);
}
