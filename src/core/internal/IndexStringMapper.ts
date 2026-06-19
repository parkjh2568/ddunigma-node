/**
 * Fuses BitPack bit-packing with charset code-unit mapping in a single pass.
 *
 * Large inputs reuse a fixed-size chunk buffer (no full-length codes allocation)
 * and chunk the String.fromCharCode calls to stay within V8's stack-safe limit.
 *
 * 성능: `bitLength === 6`(기본 DDU 64-charset)과 `=== 8`은 누산기 루프 대신 직접 매핑 언롤
 * (6비트 3바이트→4심볼, 8비트 1바이트→1심볼)을 사용합니다. 이 언롤의 비트 분해식은 `BitPack`의
 * `bitPackEncode6`/`bitPackEncode8`와 **동일**하며(중복이지만 의도된 것 — BitPack은 동치 오라클로
 * 유지), 두 곳의 출력이 바이트 동치임을 `test/bitpack-fusion-equivalence.test.ts`가 고정합니다.
 * 비트 레이아웃 변경 시 BitPack과 이 모듈을 함께 갱신해야 합니다. `STRING_CHUNK_SIZE`는 측정상
 * sweet spot(더 키우면 `String.fromCharCode.apply` 인자 오버헤드로 역효과)입니다.
 *
 * @module core/internal/IndexStringMapper
 */

import { maxValueForBitLength } from "../BitPack.js";
import { Ddu64DecodeError } from "../errors.js";

const STRING_CHUNK_SIZE = 8192;

/**
 * 2의 제곱수 charset 전용: 바이트를 비트팩하면서 곧바로 charset 코드 유닛 문자열로 변환합니다.
 * 중간 인덱스 배열(number[]/Uint16Array)을 만들지 않아 대형 입력의 할당/GC를 줄입니다.
 *
 * `bitPackEncode`(pow2)의 비트 누산과 charset 코드 유닛 매핑을 한 패스로 융합한 것으로,
 * 출력은 바이트 단위로 동일합니다(누산기 비트 연산 동일). 비-2의 제곱수 charset은 인덱스 쌍
 * 표현이 필요하므로 이 경로를 쓰지 않습니다. (동치성은 BitPack 융합 오라클 테스트로 고정됩니다.)
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

  const symbolCount = Math.ceil((inputLen * 8) / bitLength);
  const bufSize = Math.min(symbolCount, STRING_CHUNK_SIZE);
  const buf = new Uint16Array(bufSize);
  const chunks: string[] = [];
  let bufIdx = 0;
  let paddingBits = 0;

  // L2 언롤 융합 분기: bitLength 6/8은 누산기 없이 직접 매핑한다.
  // 인덱스 배열을 만들지 않고 곧바로 charCodes[...]로 코드 유닛을 산출하며,
  // 비트 분해식은 bitPackEncode6/bitPackEncode8과 동일하므로 raw 경로와 바이트 동치다.
  if (bitLength === 6) {
    // 3바이트 → 4심볼 직접 매핑 (bitPackEncode6와 동일한 비트 분해)
    let i = 0;
    for (; i + 2 < inputLen; i += 3) {
      const b0 = data[i];
      const b1 = data[i + 1];
      const b2 = data[i + 2];

      buf[bufIdx++] = charCodes[b0 >>> 2];
      if (bufIdx === bufSize) {
        chunks.push(String.fromCharCode.apply(null, buf as unknown as number[]));
        bufIdx = 0;
      }
      buf[bufIdx++] = charCodes[((b0 & 0x03) << 4) | (b1 >>> 4)];
      if (bufIdx === bufSize) {
        chunks.push(String.fromCharCode.apply(null, buf as unknown as number[]));
        bufIdx = 0;
      }
      buf[bufIdx++] = charCodes[((b1 & 0x0f) << 2) | (b2 >>> 6)];
      if (bufIdx === bufSize) {
        chunks.push(String.fromCharCode.apply(null, buf as unknown as number[]));
        bufIdx = 0;
      }
      buf[bufIdx++] = charCodes[b2 & 0x3f];
      if (bufIdx === bufSize) {
        chunks.push(String.fromCharCode.apply(null, buf as unknown as number[]));
        bufIdx = 0;
      }
    }

    const remaining = inputLen - i;
    if (remaining === 1) {
      // 잔여 1바이트 → 심볼 2개, paddingBits = 4
      const b0 = data[i];
      buf[bufIdx++] = charCodes[b0 >>> 2];
      if (bufIdx === bufSize) {
        chunks.push(String.fromCharCode.apply(null, buf as unknown as number[]));
        bufIdx = 0;
      }
      buf[bufIdx++] = charCodes[(b0 & 0x03) << 4];
      if (bufIdx === bufSize) {
        chunks.push(String.fromCharCode.apply(null, buf as unknown as number[]));
        bufIdx = 0;
      }
      paddingBits = 4;
    } else if (remaining === 2) {
      // 잔여 2바이트 → 심볼 3개, paddingBits = 2
      const b0 = data[i];
      const b1 = data[i + 1];
      buf[bufIdx++] = charCodes[b0 >>> 2];
      if (bufIdx === bufSize) {
        chunks.push(String.fromCharCode.apply(null, buf as unknown as number[]));
        bufIdx = 0;
      }
      buf[bufIdx++] = charCodes[((b0 & 0x03) << 4) | (b1 >>> 4)];
      if (bufIdx === bufSize) {
        chunks.push(String.fromCharCode.apply(null, buf as unknown as number[]));
        bufIdx = 0;
      }
      buf[bufIdx++] = charCodes[(b1 & 0x0f) << 2];
      if (bufIdx === bufSize) {
        chunks.push(String.fromCharCode.apply(null, buf as unknown as number[]));
        bufIdx = 0;
      }
      paddingBits = 2;
    }
  } else if (bitLength === 8) {
    // 1바이트 → 1심볼 직접 매핑, paddingBits = 0 (bitPackEncode8과 동일)
    for (let i = 0; i < inputLen; i++) {
      buf[bufIdx++] = charCodes[data[i]];
      if (bufIdx === bufSize) {
        chunks.push(String.fromCharCode.apply(null, buf as unknown as number[]));
        bufIdx = 0;
      }
    }
  } else {
    // 기타 bitLength: 기존 제네릭 누산 분기 유지
    const mask = (1 << bitLength) - 1;
    let accumulator = 0;
    let accumulatorBits = 0;

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

  // L2 대칭 언롤 융합 분기: bitLength 6/8은 누산기 없이 직접 역매핑한다.
  // 비트 합성식은 packPow2ToString(인코드 언롤) 및 bitPackDecode pow2 분기와 동일하므로
  // raw 경로와 바이트 동치다. 마지막 심볼의 패딩 비트 제거가 필요한 그룹은 제네릭 누산으로
  // 처리하여 동치를 보존한다(잔여 1·2바이트, paddingBits 4·2).
  if (bitLength === 6) {
    // 완전한 4문자 그룹 → 3바이트 직접 역매핑.
    // 마지막 심볼이 들어가는 그룹은 paddingBits 제거를 위해 fast-path에서 제외하고 제네릭 처리.
    let groupEnd = inputLen - (inputLen % 4);
    if (groupEnd === inputLen && paddingBits > 0) {
      groupEnd -= 4;
    }

    let i = 0;
    for (; i < groupEnd; i += 4) {
      const c0 = input.charCodeAt(i) - lookupOffset;
      const v0 = c0 >= 0 && c0 < lookupLen ? lookup[c0] : -1;
      if (v0 < 0) {
        throw new Ddu64DecodeError(`[Ddu64 decode] Invalid character "${input[i]}" at ${i}`);
      }
      const c1 = input.charCodeAt(i + 1) - lookupOffset;
      const v1 = c1 >= 0 && c1 < lookupLen ? lookup[c1] : -1;
      if (v1 < 0) {
        throw new Ddu64DecodeError(
          `[Ddu64 decode] Invalid character "${input[i + 1]}" at ${i + 1}`,
        );
      }
      const c2 = input.charCodeAt(i + 2) - lookupOffset;
      const v2 = c2 >= 0 && c2 < lookupLen ? lookup[c2] : -1;
      if (v2 < 0) {
        throw new Ddu64DecodeError(
          `[Ddu64 decode] Invalid character "${input[i + 2]}" at ${i + 2}`,
        );
      }
      const c3 = input.charCodeAt(i + 3) - lookupOffset;
      const v3 = c3 >= 0 && c3 < lookupLen ? lookup[c3] : -1;
      if (v3 < 0) {
        throw new Ddu64DecodeError(
          `[Ddu64 decode] Invalid character "${input[i + 3]}" at ${i + 3}`,
        );
      }

      buffer[bufIdx++] = (v0 << 2) | (v1 >>> 4);
      buffer[bufIdx++] = ((v1 & 0x0f) << 4) | (v2 >>> 2);
      buffer[bufIdx++] = ((v2 & 0x03) << 6) | v3;
    }

    // 잔여 심볼(마지막 그룹): 제네릭 누산으로 패딩 비트 제거를 동일하게 적용
    let accumulator = 0;
    let accumulatorBits = 0;
    const lastIndex = inputLen - 1;
    for (; i < inputLen; i++) {
      const code = input.charCodeAt(i);
      const li = code - lookupOffset;
      const val = li >= 0 && li < lookupLen ? lookup[li] : -1;
      if (val < 0) {
        throw new Ddu64DecodeError(`[Ddu64 decode] Invalid character "${input[i]}" at ${i}`);
      }

      accumulator = (accumulator << 6) | val;
      accumulatorBits += 6;

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

  if (bitLength === 8 && paddingBits === 0) {
    // 1문자 → 1바이트 직접 역매핑 (bitPackDecode pow2 8비트와 동일, paddingBits 0)
    for (let i = 0; i < inputLen; i++) {
      const code = input.charCodeAt(i);
      const li = code - lookupOffset;
      const val = li >= 0 && li < lookupLen ? lookup[li] : -1;
      if (val < 0) {
        throw new Ddu64DecodeError(`[Ddu64 decode] Invalid character "${input[i]}" at ${i}`);
      }
      buffer[bufIdx++] = val;
    }

    return buffer.subarray(0, bufIdx);
  }

  // 기타 bitLength(및 예외적 8비트 패딩): 기존 제네릭 누산 분기 그대로 유지
  let accumulator = 0;
  let accumulatorBits = 0;
  const lastIndex = inputLen - 1;

  for (let i = 0; i < inputLen; i++) {
    const code = input.charCodeAt(i);
    const li = code - lookupOffset;
    const val = li >= 0 && li < lookupLen ? lookup[li] : -1;
    if (val < 0) {
      throw new Ddu64DecodeError(`[Ddu64 decode] Invalid character "${input[i]}" at ${i}`);
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
 * `bitPackEncode`(non-pow2)의 비트 누산과 charset 코드 유닛 매핑을 한 패스로 융합한 것으로,
 * 중간 인덱스 배열을 만들지 않습니다. 비트 누산 연산은 `bitPackEncode`의 비-2의 제곱수
 * 분기와 동일하므로 출력은 바이트 단위로 같습니다. (동치성은 BitPack 융합 오라클 테스트로 고정.)
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

  const maxBinaryValue = maxValueForBitLength(bitLength);
  const lookupLen = lookup.length;
  let accumulator = 0;
  let accumulatorBits = 0;

  for (let i = 0; i < inputLen; i += 2) {
    const li1 = input.charCodeAt(i) - lookupOffset;
    const v1 = li1 >= 0 && li1 < lookupLen ? lookup[li1] : -1;
    if (v1 < 0) {
      throw new Ddu64DecodeError(`[Ddu64 decode] Invalid character "${input[i]}" at ${i}`);
    }
    if (i + 1 >= inputLen) {
      throw new Ddu64DecodeError(`[Ddu64 decode] Truncated symbol pair at ${i + 1}`);
    }
    const li2 = input.charCodeAt(i + 1) - lookupOffset;
    const v2 = li2 >= 0 && li2 < lookupLen ? lookup[li2] : -1;
    if (v2 < 0) {
      throw new Ddu64DecodeError(`[Ddu64 decode] Invalid character "${input[i + 1]}" at ${i + 1}`);
    }

    const value = v1 * charsetSize + v2;
    if (value >= maxBinaryValue) {
      throw new Ddu64DecodeError(`[Ddu64 decode] Value ${value} exceeds range at position ${i}`);
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
