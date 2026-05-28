/**
 * Converts BitPack charset indices into an encoded string.
 *
 * Uses a single Uint16Array for the full index set and chunks the
 * String.fromCharCode calls to stay within V8's stack-safe limit.
 *
 * @module core/internal/IndexStringMapper
 */

const STRING_CHUNK_SIZE = 8192;

export function indicesToString(indices: ArrayLike<number>, charCodes: Uint16Array): string {
  const len = indices.length;

  if (len <= STRING_CHUNK_SIZE) {
    // 작은 입력: 단일 Uint16Array + 단일 fromCharCode 호출
    const codes = new Uint16Array(len);
    for (let i = 0; i < len; i++) {
      codes[i] = charCodes[indices[i]];
    }
    return String.fromCharCode.apply(null, codes as unknown as number[]);
  }

  // 큰 입력: 전체 Uint16Array 할당 후 청크 단위로 문자열 변환
  const codes = new Uint16Array(len);
  for (let i = 0; i < len; i++) {
    codes[i] = charCodes[indices[i]];
  }

  const chunks = new Array<string>(Math.ceil(len / STRING_CHUNK_SIZE));
  let chunkIndex = 0;
  for (let offset = 0; offset < len; offset += STRING_CHUNK_SIZE) {
    const slice = codes.subarray(offset, Math.min(offset + STRING_CHUNK_SIZE, len));
    chunks[chunkIndex++] = String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return chunks.join("");
}
