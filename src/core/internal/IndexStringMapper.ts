/**
 * Converts BitPack charset indices into an encoded string.
 *
 * Small inputs use a single String.fromCharCode call; large inputs reuse a
 * fixed-size chunk buffer (no full-length codes allocation) and chunk the
 * String.fromCharCode calls to stay within V8's stack-safe limit.
 *
 * @module core/internal/IndexStringMapper
 */

const STRING_CHUNK_SIZE = 8192;
const PLAIN_ARRAY_STRING_SIZE = 4096;

export function indicesToString(indices: ArrayLike<number>, charCodes: Uint16Array): string {
  const len = indices.length;

  if (len <= PLAIN_ARRAY_STRING_SIZE) {
    const codes = new Array<number>(len);
    for (let i = 0; i < len; i++) {
      codes[i] = charCodes[indices[i]];
    }
    return String.fromCharCode.apply(null, codes);
  }

  if (len <= STRING_CHUNK_SIZE) {
    // 작은 입력: 단일 Uint16Array + 단일 fromCharCode 호출
    const codes = new Uint16Array(len);
    for (let i = 0; i < len; i++) {
      codes[i] = charCodes[indices[i]];
    }
    return String.fromCharCode.apply(null, codes as unknown as number[]);
  }

  // 큰 입력: 청크 버퍼를 재사용해 전체 codes 배열을 추가로 만들지 않습니다.
  const chunks = new Array<string>(Math.ceil(len / STRING_CHUNK_SIZE));
  const codes = new Uint16Array(STRING_CHUNK_SIZE);
  let chunkIndex = 0;
  for (let offset = 0; offset < len; offset += STRING_CHUNK_SIZE) {
    const chunkLen = Math.min(STRING_CHUNK_SIZE, len - offset);
    for (let i = 0; i < chunkLen; i++) {
      codes[i] = charCodes[indices[offset + i]];
    }
    const slice = codes.subarray(0, chunkLen);
    chunks[chunkIndex++] = String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return chunks.join("");
}
