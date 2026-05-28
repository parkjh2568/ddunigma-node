/**
 * Converts BitPack charset indices into an encoded string.
 *
 * The existing chunking thresholds are kept here to preserve current V8
 * performance characteristics while removing this hot-path detail from
 * Ddu64Core.
 *
 * @module core/internal/IndexStringMapper
 */

const STRING_CHUNK_SIZE = 8192;
const FULL_CODE_BUFFER_THRESHOLD = 1 << 20;

export function indicesToString(
  indices: ArrayLike<number>,
  charCodes: Uint16Array,
): string {
  const len = indices.length;
  if (len <= FULL_CODE_BUFFER_THRESHOLD) {
    const codes = new Uint16Array(len);
    for (let i = 0; i < len; i++) {
      codes[i] = charCodes[indices[i]];
    }

    if (len <= STRING_CHUNK_SIZE) {
      return String.fromCharCode.apply(null, codes as unknown as number[]);
    }

    const chunks = new Array<string>(Math.ceil(len / STRING_CHUNK_SIZE));
    let chunkIndex = 0;
    for (let offset = 0; offset < len; offset += STRING_CHUNK_SIZE) {
      const slice = codes.subarray(offset, Math.min(offset + STRING_CHUNK_SIZE, len));
      chunks[chunkIndex++] = String.fromCharCode.apply(null, slice as unknown as number[]);
    }
    return chunks.join("");
  }

  const codes = new Uint16Array(STRING_CHUNK_SIZE);
  const chunks = new Array<string>(Math.ceil(len / STRING_CHUNK_SIZE));
  let chunkIndex = 0;
  for (let offset = 0; offset < len; offset += STRING_CHUNK_SIZE) {
    const chunkLen = Math.min(STRING_CHUNK_SIZE, len - offset);
    for (let i = 0; i < chunkLen; i++) {
      codes[i] = charCodes[indices[offset + i]];
    }
    const view = chunkLen === codes.length ? codes : codes.subarray(0, chunkLen);
    chunks[chunkIndex++] = String.fromCharCode.apply(null, view as unknown as number[]);
  }
  return chunks.join("");
}

