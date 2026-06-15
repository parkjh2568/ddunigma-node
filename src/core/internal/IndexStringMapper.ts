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

/**
 * 2의 제곱수 charset 전용: 바이트를 비트팩하면서 곧바로 charset 코드 유닛 문자열로 변환합니다.
 * 중간 인덱스 배열(number[]/Uint16Array)을 만들지 않아 대형 입력의 할당/GC를 줄입니다.
 *
 * `bitPackEncode`(pow2) + `indicesToString`을 한 패스로 융합한 것으로, 출력은 바이트 단위로
 * 동일합니다(누산기 비트 연산 동일). 비-2의 제곱수 charset은 인덱스 쌍 표현이 필요하므로
 * 이 경로를 쓰지 않습니다.
 *
 * @param data - 인코딩할 바이트
 * @param bitLength - 심볼당 비트 수 (charset 크기의 log2)
 * @param charCodes - 인덱스 → UTF-16 코드 유닛 매핑
 * @returns 인코딩된 페이로드 문자열과 마지막 심볼의 패딩 비트 수
 */
export function packPow2ToString(
  data: Uint8Array,
  bitLength: number,
  charCodes: Uint16Array,
): { payload: string; paddingBits: number } {
  const inputLen = data.length;
  if (inputLen === 0) return { payload: "", paddingBits: 0 };

  const mask = (1 << bitLength) - 1;
  const symbolCount = Math.ceil((inputLen * 8) / bitLength);
  const bufSize = Math.min(symbolCount, STRING_CHUNK_SIZE);
  const buf = new Uint16Array(bufSize);
  const chunks: string[] = [];
  let bufIdx = 0;
  let accumulator = 0;
  let accumulatorBits = 0;
  let paddingBits = 0;

  for (let i = 0; i < inputLen; i++) {
    accumulator = (accumulator << 8) | data[i];
    accumulatorBits += 8;
    while (accumulatorBits >= bitLength) {
      accumulatorBits -= bitLength;
      buf[bufIdx++] = charCodes[(accumulator >> accumulatorBits) & mask];
      if (bufIdx === bufSize) {
        chunks.push(String.fromCharCode.apply(null, buf as unknown as number[]));
        bufIdx = 0;
      }
      accumulator &= (1 << accumulatorBits) - 1;
    }
  }

  if (accumulatorBits > 0) {
    paddingBits = bitLength - accumulatorBits;
    buf[bufIdx++] = charCodes[(accumulator << paddingBits) & mask];
  }

  if (bufIdx > 0) {
    chunks.push(String.fromCharCode.apply(null, buf.subarray(0, bufIdx) as unknown as number[]));
  }

  return { payload: chunks.length === 1 ? chunks[0] : chunks.join(""), paddingBits };
}
