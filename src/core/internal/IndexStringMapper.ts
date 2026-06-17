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

/**
 * 2의 제곱수 charset 전용: 인코딩 문자열을 곧바로 바이트로 언팩합니다.
 * 중간 인덱스 배열(number[]/Uint16Array)을 만들지 않아 대형 입력의 할당/GC를 줄입니다.
 *
 * `decodePayload`의 (charCodeAt → 인덱스 배열) + `bitPackDecode`(pow2) 2단계를 한 패스로
 * 융합한 것으로, 비트 누산 연산은 `bitPackDecode`의 2의 제곱수 분기와 동일합니다(출력 바이트
 * 단위로 동일). 비-2의 제곱수 charset은 인덱스 쌍 표현이 필요하므로 이 경로를 쓰지 않습니다.
 *
 * @param input - 푸터가 제거된 인코딩 페이로드 문자열
 * @param paddingBits - 마지막 심볼의 패딩 비트 수
 * @param bitLength - 심볼당 비트 수 (charset 크기의 log2)
 * @param lookup - UTF-16 코드 유닛 → charset 인덱스 룩업 테이블
 * @param lookupOffset - 룩업 테이블 오프셋 (`lookup[code - offset]`)
 * @returns 디코딩된 바이트 배열
 * @throws charset에 없는 문자를 만나면 에러
 */
export function unpackPow2FromString(
  input: string,
  paddingBits: number,
  bitLength: number,
  lookup: Int32Array,
  lookupOffset: number,
): Uint8Array {
  const inputLen = input.length;
  if (inputLen === 0) return new Uint8Array(0);

  const estimatedBytes = Math.ceil((inputLen * bitLength - paddingBits) / 8);
  const buffer = new Uint8Array(estimatedBytes + 1);
  let bufIdx = 0;

  const lookupLen = lookup.length;
  let accumulator = 0;
  let accumulatorBits = 0;
  const lastIndex = inputLen - 1;

  for (let i = 0; i < inputLen; i++) {
    const code = input.charCodeAt(i);
    const li = code - lookupOffset;
    const val = li >= 0 && li < lookupLen ? lookup[li] : -1;
    if (val < 0) {
      throw new Error(`[Ddu64 decode] Invalid character "${input[i]}" at ${i}`);
    }

    accumulator = (accumulator << bitLength) | val;
    accumulatorBits += bitLength;

    // 마지막 심볼에서 패딩 비트 제거 (bitPackDecode pow2 분기와 동일)
    if (i === lastIndex && paddingBits > 0) {
      accumulator >>= paddingBits;
      accumulatorBits -= paddingBits;
    }

    while (accumulatorBits >= 8) {
      accumulatorBits -= 8;
      buffer[bufIdx++] = (accumulator >> accumulatorBits) & 0xff;
      accumulator &= (1 << accumulatorBits) - 1;
    }
  }

  return buffer.subarray(0, bufIdx);
}

/**
 * 비-2의 제곱수 charset 전용: 바이트를 비트팩하면서 곧바로 charset 코드 유닛 문자열로 변환합니다.
 * 각 논리 심볼은 인덱스 쌍 `[div, mod]`(value = div*charsetSize + mod)로 표현됩니다.
 *
 * `bitPackEncode`(non-pow2) + `indicesToString`을 한 패스로 융합한 것으로, 중간 인덱스 배열을
 * 만들지 않습니다. 비트 누산 연산은 `bitPackEncode`의 비-2의 제곱수 분기와 동일하므로 출력은
 * 바이트 단위로 같습니다.
 *
 * @param data - 인코딩할 바이트
 * @param bitLength - 논리 심볼당 비트 수
 * @param charsetSize - charset 크기(고유 문자 수)
 * @param charCodes - 인덱스 → UTF-16 코드 유닛 매핑
 * @returns 인코딩된 페이로드 문자열과 마지막 심볼의 패딩 비트 수
 */
export function packNonPow2ToString(
  data: Uint8Array,
  bitLength: number,
  charsetSize: number,
  charCodes: Uint16Array,
): { payload: string; paddingBits: number } {
  const inputLen = data.length;
  if (inputLen === 0) return { payload: "", paddingBits: 0 };

  const chunks: string[] = [];
  const buf = new Uint16Array(STRING_CHUNK_SIZE);
  let bufIdx = 0;
  let accumulator = 0;
  let accumulatorBits = 0;
  let paddingBits = 0;

  const pushCode = (code: number): void => {
    buf[bufIdx++] = code;
    if (bufIdx === STRING_CHUNK_SIZE) {
      chunks.push(String.fromCharCode.apply(null, buf as unknown as number[]));
      bufIdx = 0;
    }
  };

  for (let i = 0; i < inputLen; i++) {
    accumulator = (accumulator << 8) | data[i];
    accumulatorBits += 8;
    while (accumulatorBits >= bitLength) {
      accumulatorBits -= bitLength;
      const value = accumulator >> accumulatorBits;
      const div = (value / charsetSize) | 0;
      pushCode(charCodes[div]);
      pushCode(charCodes[value - div * charsetSize]);
      accumulator &= (1 << accumulatorBits) - 1;
    }
  }

  if (accumulatorBits > 0) {
    paddingBits = bitLength - accumulatorBits;
    const value = accumulator << paddingBits;
    const div = (value / charsetSize) | 0;
    pushCode(charCodes[div]);
    pushCode(charCodes[value - div * charsetSize]);
  }

  if (bufIdx > 0) {
    chunks.push(String.fromCharCode.apply(null, buf.subarray(0, bufIdx) as unknown as number[]));
  }

  return { payload: chunks.length === 1 ? chunks[0] : chunks.join(""), paddingBits };
}

/**
 * 비-2의 제곱수 charset 전용: 인코딩 문자열을 곧바로 바이트로 언팩합니다.
 * 각 논리 심볼은 인덱스 쌍 `[v1, v2]`(value = v1*charsetSize + v2)로 표현됩니다.
 *
 * `decodePayload`의 (charCodeAt→인덱스 배열) + `bitPackDecode`(non-pow2) 2단계를 한 패스로
 * 융합한 것으로, 비트 누산과 검증(값 범위·쌍 완결성)은 `bitPackDecode`의 비-2의 제곱수
 * 분기와 동치입니다. 중간 인덱스 배열 할당을 제거합니다.
 *
 * @param input - 푸터가 제거된 인코딩 페이로드 문자열
 * @param paddingBits - 마지막 심볼의 패딩 비트 수
 * @param bitLength - 논리 심볼당 비트 수
 * @param charsetSize - charset 크기(고유 문자 수)
 * @param lookup - UTF-16 코드 유닛 → charset 인덱스 룩업 테이블
 * @param lookupOffset - 룩업 테이블 오프셋 (`lookup[code - offset]`)
 * @returns 디코딩된 바이트 배열
 * @throws charset에 없는 문자, 잘린 심볼 쌍, 또는 범위를 벗어난 값에서 에러
 */
export function unpackNonPow2FromString(
  input: string,
  paddingBits: number,
  bitLength: number,
  charsetSize: number,
  lookup: Int32Array,
  lookupOffset: number,
): Uint8Array {
  const inputLen = input.length;
  if (inputLen === 0) return new Uint8Array(0);

  const numChunks = Math.ceil(inputLen / 2);
  const estimatedBytes = Math.ceil((numChunks * bitLength - paddingBits) / 8);
  const buffer = new Uint8Array(estimatedBytes + 1);
  let bufIdx = 0;

  const maxBinaryValue = bitLength < 31 ? 1 << bitLength : Math.pow(2, bitLength);
  const lookupLen = lookup.length;
  let accumulator = 0;
  let accumulatorBits = 0;

  for (let i = 0; i < inputLen; i += 2) {
    const li1 = input.charCodeAt(i) - lookupOffset;
    const v1 = li1 >= 0 && li1 < lookupLen ? lookup[li1] : -1;
    if (v1 < 0) {
      throw new Error(`[Ddu64 decode] Invalid character "${input[i]}" at ${i}`);
    }
    if (i + 1 >= inputLen) {
      throw new Error(`[Ddu64 decode] Truncated symbol pair at ${i + 1}`);
    }
    const li2 = input.charCodeAt(i + 1) - lookupOffset;
    const v2 = li2 >= 0 && li2 < lookupLen ? lookup[li2] : -1;
    if (v2 < 0) {
      throw new Error(`[Ddu64 decode] Invalid character "${input[i + 1]}" at ${i + 1}`);
    }

    const value = v1 * charsetSize + v2;
    if (value >= maxBinaryValue) {
      throw new Error(`[Ddu64 decode] Value ${value} exceeds range at position ${i}`);
    }

    accumulator = (accumulator << bitLength) | value;
    accumulatorBits += bitLength;

    if (i + 2 >= inputLen && paddingBits > 0) {
      accumulator >>= paddingBits;
      accumulatorBits -= paddingBits;
    }

    while (accumulatorBits >= 8) {
      accumulatorBits -= 8;
      buffer[bufIdx++] = (accumulator >> accumulatorBits) & 0xff;
      accumulator &= (1 << accumulatorBits) - 1;
    }
  }

  return buffer.subarray(0, bufIdx);
}
