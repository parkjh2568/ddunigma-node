/**
 * 바이트를 charset 인덱스로 변환하고 역변환하는 독립형 비트 패킹 엔진.
 *
 * @module core/BitPack
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** 바이트당 비트 수 */
const BYTE_BITS = 8;

/** 바이트 마스크 (0xFF) */
const BYTE_MASK = 0xff;

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * 비트 패킹 엔진 설정.
 */
export interface BitPackConfig {
  /** 인코딩된 심볼당 비트 수 (2의 제곱수 charset의 경우 charset 크기의 log2) */
  bitLength: number;
  /** charset 크기가 2의 제곱수인지 여부 */
  usePowerOfTwo: boolean;
  /** charset 크기 (고유 문자 수) */
  charsetSize: number;
}

/**
 * 바이트를 charset 인덱스로 인코딩한 결과.
 */
export interface BitPackEncodeResult {
  /** 인코딩된 데이터를 나타내는 charset 인덱스 배열 */
  indices: number[];
  /** 마지막 심볼에 추가된 패딩 비트 수 (패딩 불필요 시 0) */
  paddingBits: number;
}

// ─── Encode ──────────────────────────────────────────────────────────────────

/**
 * 비트 패킹을 사용하여 바이트 배열을 charset 인덱스로 인코딩합니다.
 *
 * 2의 제곱수 charset의 경우, 각 인덱스는 charset 문자에 직접 매핑됩니다.
 * 비-2의 제곱수 charset의 경우, 각 논리 심볼은 인덱스 쌍으로 표현됩니다:
 * [highIndex, lowIndex] 여기서 value = highIndex * charsetSize + lowIndex.
 *
 * @param input - 인코딩할 바이트 배열
 * @param config - 비트 패킹 설정
 * @returns 인덱스와 패딩 비트 수를 포함하는 인코딩 결과
 */
export function bitPackEncode(input: Uint8Array, config: BitPackConfig): BitPackEncodeResult {
  const { bitLength, usePowerOfTwo, charsetSize } = config;
  const inputLen = input.length;

  if (inputLen === 0) {
    return { indices: [], paddingBits: 0 };
  }

  const totalBits = inputLen * BYTE_BITS;
  const estimatedChunks = Math.ceil(totalBits / bitLength);
  // 비-2의 제곱수의 경우, 각 청크가 2개의 인덱스를 생성
  const estimatedIndices = usePowerOfTwo ? estimatedChunks : estimatedChunks * 2;
  const indices: number[] = new Array(estimatedIndices);
  let idx = 0;

  let accumulator = 0;
  let accumulatorBits = 0;

  if (usePowerOfTwo) {
    const mask = (1 << bitLength) - 1;

    for (let i = 0; i < inputLen; i++) {
      accumulator = (accumulator << BYTE_BITS) | input[i];
      accumulatorBits += BYTE_BITS;

      while (accumulatorBits >= bitLength) {
        accumulatorBits -= bitLength;
        indices[idx++] = (accumulator >> accumulatorBits) & mask;
        accumulator &= (1 << accumulatorBits) - 1;
      }
    }
  } else {
    for (let i = 0; i < inputLen; i++) {
      accumulator = (accumulator << BYTE_BITS) | input[i];
      accumulatorBits += BYTE_BITS;

      while (accumulatorBits >= bitLength) {
        accumulatorBits -= bitLength;
        const value = accumulator >> accumulatorBits;
        const div = (value / charsetSize) | 0;
        indices[idx++] = div;
        indices[idx++] = value - div * charsetSize;
        accumulator &= (1 << accumulatorBits) - 1;
      }
    }
  }

  // 남은 비트 처리 (패딩)
  let paddingBits = 0;
  if (accumulatorBits > 0) {
    paddingBits = bitLength - accumulatorBits;
    const value = accumulator << paddingBits;

    if (usePowerOfTwo) {
      indices[idx++] = value;
    } else {
      const div = (value / charsetSize) | 0;
      indices[idx++] = div;
      indices[idx++] = value - div * charsetSize;
    }
  }

  // 실제 길이로 자르기
  indices.length = idx;

  return { indices, paddingBits };
}

// ─── Decode ──────────────────────────────────────────────────────────────────

/**
 * 비트 언패킹을 사용하여 charset 인덱스를 바이트 배열로 디코딩합니다.
 *
 * 2의 제곱수 charset의 경우, 각 인덱스는 bitLength 비트 값을 직접 나타냅니다.
 * 비-2의 제곱수 charset의 경우, 인덱스 쌍이 결합됩니다:
 * value = indices[i] * charsetSize + indices[i+1].
 *
 * @param indices - 디코딩할 charset 인덱스 배열
 * @param paddingBits - 마지막 심볼의 패딩 비트 수
 * @param config - 비트 패킹 설정
 * @returns 디코딩된 바이트 배열
 * @throws 인덱스가 charset 범위를 벗어난 경우 에러
 */
export function bitPackDecode(
  indices: ArrayLike<number>,
  paddingBits: number,
  config: BitPackConfig,
): Uint8Array {
  const { bitLength, usePowerOfTwo, charsetSize } = config;
  const inputLen = indices.length;

  if (inputLen === 0) {
    return new Uint8Array(0);
  }

  const chunkSize = usePowerOfTwo ? 1 : 2;
  const numChunks = Math.ceil(inputLen / chunkSize);
  const maxBinaryValue = bitLength < 31 ? 1 << bitLength : Math.pow(2, bitLength);
  const estimatedBytes = Math.ceil((numChunks * bitLength - paddingBits) / BYTE_BITS);
  const buffer = new Uint8Array(estimatedBytes + 1);
  let bufIdx = 0;

  let accumulator = 0;
  let accumulatorBits = 0;

  if (usePowerOfTwo) {
    for (let i = 0; i < inputLen; i += chunkSize) {
      const val = indices[i];

      if (val < 0 || val >= charsetSize) {
        throw new Error(`[BitPack decode] Invalid index ${val} at position ${i}`);
      }

      accumulator = (accumulator << bitLength) | val;
      accumulatorBits += bitLength;

      // 마지막 청크에서 패딩 제거 적용
      if (i + chunkSize >= inputLen && paddingBits > 0) {
        accumulator >>= paddingBits;
        accumulatorBits -= paddingBits;
      }

      while (accumulatorBits >= BYTE_BITS) {
        accumulatorBits -= BYTE_BITS;
        buffer[bufIdx++] = (accumulator >> accumulatorBits) & BYTE_MASK;
        accumulator &= (1 << accumulatorBits) - 1;
      }
    }
  } else {
    for (let i = 0; i < inputLen; i += chunkSize) {
      const v1 = indices[i];
      const v2 = indices[i + 1];

      if (v1 < 0 || v1 >= charsetSize) {
        throw new Error(`[BitPack decode] Invalid index ${v1} at position ${i}`);
      }
      if (v2 === undefined || v2 < 0 || v2 >= charsetSize) {
        throw new Error(`[BitPack decode] Invalid index ${v2} at position ${i + 1}`);
      }

      const value = v1 * charsetSize + v2;
      if (value >= maxBinaryValue) {
        throw new Error(`[BitPack decode] Value ${value} exceeds range at position ${i}`);
      }

      accumulator = (accumulator << bitLength) | value;
      accumulatorBits += bitLength;

      // 마지막 청크에서 패딩 제거 적용
      if (i + chunkSize >= inputLen && paddingBits > 0) {
        accumulator >>= paddingBits;
        accumulatorBits -= paddingBits;
      }

      while (accumulatorBits >= BYTE_BITS) {
        accumulatorBits -= BYTE_BITS;
        buffer[bufIdx++] = (accumulator >> accumulatorBits) & BYTE_MASK;
        accumulator &= (1 << accumulatorBits) - 1;
      }
    }
  }

  return buffer.subarray(0, bufIdx);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * 주어진 charset 크기에 대한 유효 비트 길이를 계산합니다.
 *
 * 2의 제곱수 charset의 경우 log2(charsetSize)를 반환합니다.
 * 비-2의 제곱수 charset의 경우 ceil(log2(charsetSize))를 반환합니다.
 *
 * @param charsetSize - charset의 문자 수
 * @param usePowerOfTwo - charset 크기가 2의 제곱수인지 여부
 * @returns 유효 비트 길이
 */
export function calculateBitLength(charsetSize: number, usePowerOfTwo: boolean): number {
  if (charsetSize <= 1) return 0;
  if (usePowerOfTwo) {
    return Math.floor(Math.log2(charsetSize));
  }
  return Math.ceil(Math.log2(charsetSize));
}

/**
 * charset 크기가 2의 제곱수인지 판별합니다.
 *
 * @param charsetSize - charset의 문자 수
 * @returns charsetSize가 2의 제곱수이면 true
 */
export function isPowerOfTwo(charsetSize: number): boolean {
  return charsetSize > 0 && (charsetSize & (charsetSize - 1)) === 0;
}
