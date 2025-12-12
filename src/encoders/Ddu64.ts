import { deflateSync, inflateSync } from "zlib";
import { BaseDdu } from "../base/BaseDdu";
import {
  DduConstructorOptions,
  DduOptions,
  DduSetSymbol,
  dduDefaultConstructorOptions,
} from "../types";
import { getCharSet } from "../charSets";

// ============================================================================
// 상수 정의
// ============================================================================

/** 바이트당 비트 수 */
const BYTE_BITS = 8;

/** 일반 정수 연산이 가능한 최대 비트 길이 (초과 시 BigInt 사용) */
const MAX_FAST_BITS = 16;

/** 바이트 마스크 (0xFF) */
const BYTE_MASK = 0xff;

/** 압축 데이터 식별 마커 */
const COMPRESS_MARKER = "ELYSIA";

/** 기본 최대 디코딩 바이트 수 (64MB) */
const DEFAULT_MAX_DECODED_BYTES = 64 * 1024 * 1024;

/** 기본 최대 압축해제 바이트 수 (64MB) */
const DEFAULT_MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;

// ============================================================================
// Ddu64 클래스
// ============================================================================

/**
 * 커스텀 charset을 사용하는 Base64 스타일 인코더
 *
 * @description
 * 바이너리 데이터를 지정된 charset으로 인코딩/디코딩합니다.
 * 2의 제곱수 charset과 가변 길이 charset 모두 지원하며,
 * 압축 옵션을 통해 데이터 크기를 줄일 수 있습니다.
 *
 * @example
 * // 기본 사용
 * const encoder = new Ddu64("우따야", "뭐");
 * const encoded = encoder.encode("Hello");
 * const decoded = encoder.decode(encoded);
 *
 * @example
 * // 압축 사용
 * const encoder = new Ddu64(undefined, undefined, { compress: true });
 * const encoded = encoder.encode(longText);
 */
export class Ddu64 extends BaseDdu {
  // --------------------------------------------------------------------------
  // 멤버 변수
  // --------------------------------------------------------------------------

  /** 인코딩에 사용할 문자 배열 */
  protected readonly dduChar: string[];

  /** 패딩 문자 */
  protected readonly paddingChar: string;

  /** 각 charset 문자의 길이 */
  protected readonly charLength: number;

  /** 비트 길이 (log2) */
  protected readonly bitLength: number;

  /** 2의 제곱수 charset 여부 */
  protected readonly usePowerOfTwo: boolean;

  /** 문자열 인코딩 방식 */
  protected readonly encoding: BufferEncoding;

  /** 기본 압축 사용 여부 */
  protected readonly defaultCompress: boolean;

  /** 기본 최대 디코딩 바이트 수 */
  private readonly defaultMaxDecodedBytes: number;

  /** 기본 최대 압축해제 바이트 수 */
  private readonly defaultMaxDecompressedBytes: number;

  /** 문자 → 인덱스 역방향 룩업 맵 */
  protected readonly dduBinaryLookup: Map<string, number> = new Map();

  /** 미리 정의된 charset 사용 여부 */
  private readonly isPredefinedCharSet: boolean;

  /** 실제 사용되는 비트 길이 */
  private readonly effectiveBitLength: number;

  /** 최대 바이너리 값 */
  private readonly maxBinaryValue: number;

  /** ASCII 문자 빠른 룩업 테이블 */
  private readonly fastAsciiLookup: Int16Array | null = null;

  /** ASCII 룩업 사용 여부 */
  private readonly useAsciiLookup: boolean = false;

  // --------------------------------------------------------------------------
  // 생성자
  // --------------------------------------------------------------------------

  /**
   * Ddu64 인코더 인스턴스를 생성합니다.
   *
   * @param dduChar - charset 문자열 또는 배열 (미지정 시 옵션의 dduSetSymbol 사용)
   * @param paddingChar - 패딩 문자 (dduChar 지정 시 필수)
   * @param dduOptions - 생성자 옵션
   *
   * @throws dduChar 지정 시 paddingChar가 없으면 에러
   * @throws charset 문자 수가 부족하면 에러
   *
   * @example
   * // 커스텀 charset
   * new Ddu64("우따야", "뭐");
   *
   * @example
   * // 미리 정의된 charset
   * new Ddu64(undefined, undefined, { dduSetSymbol: DduSetSymbol.ONECHARSET });
   */
  constructor(
    dduChar?: string[] | string,
    paddingChar?: string,
    dduOptions?: DduConstructorOptions
  ) {
    super();
    const shouldThrow = dduOptions?.useBuildErrorReturn ?? false;

    // charset 초기화
    const initial = this.resolveInitialCharSet(
      dduChar,
      paddingChar,
      dduOptions,
      shouldThrow
    );
    const normalized = this.normalizeCharSet(initial, shouldThrow, dduOptions);

    this.dduChar = normalized.charSet;
    this.paddingChar = normalized.padding;
    this.charLength = normalized.charLength;
    this.isPredefinedCharSet = normalized.isPredefined;
    this.encoding = dduOptions?.encoding ?? this.defaultEncoding;
    this.defaultCompress = dduOptions?.compress ?? false;

    // 제한값 설정
    this.defaultMaxDecodedBytes = this.normalizeLimit(
      dduOptions?.maxDecodedBytes,
      DEFAULT_MAX_DECODED_BYTES,
      shouldThrow,
      "maxDecodedBytes"
    );
    this.defaultMaxDecompressedBytes = this.normalizeLimit(
      dduOptions?.maxDecompressedBytes,
      DEFAULT_MAX_DECOMPRESSED_BYTES,
      shouldThrow,
      "maxDecompressedBytes"
    );

    // 비트 길이 계산
    const dduLength = this.dduChar.length;
    this.usePowerOfTwo =
      dduLength > 0 && (dduLength & (dduLength - 1)) === 0;

    const computedBitLength = this.getBitLength(dduLength);
    this.bitLength = this.usePowerOfTwo
      ? this.getLargestPowerOfTwoExponent(dduLength)
      : computedBitLength;
    this.effectiveBitLength = this.usePowerOfTwo
      ? this.bitLength
      : computedBitLength;
    this.maxBinaryValue =
      this.effectiveBitLength < 31
        ? 1 << this.effectiveBitLength
        : Math.pow(2, this.effectiveBitLength);

    // ASCII 룩업 테이블 초기화 (성능 최적화)
    if (this.charLength === 1) {
      let allAscii = true;
      for (let i = 0; i < dduLength; i++) {
        if (this.dduChar[i].charCodeAt(0) >= 128) {
          allAscii = false;
          break;
        }
      }

      if (allAscii) {
        this.fastAsciiLookup = new Int16Array(128).fill(-1);
        for (let i = 0; i < dduLength; i++) {
          this.fastAsciiLookup[this.dduChar[i].charCodeAt(0)] = i;
        }
        this.useAsciiLookup = true;
      }
    }

    // 역방향 룩업 맵 생성
    for (let i = 0; i < dduLength; i++) {
      this.dduBinaryLookup.set(this.dduChar[i], i);
    }

    // 커스텀 charset 중복 조합 검증
    if (this.charLength === 1 && !this.isPredefinedCharSet) {
      this.validateCombinationDuplicates(
        this.dduChar,
        this.paddingChar,
        dduLength
      );
    }
  }

  // --------------------------------------------------------------------------
  // 공개 메서드
  // --------------------------------------------------------------------------

  /**
   * 입력 데이터를 인코딩합니다.
   *
   * @param input - 인코딩할 문자열 또는 Buffer
   * @param options - 인코딩 옵션
   * @param options.compress - 압축 사용 여부 (기본값: 생성자 설정)
   * @returns 인코딩된 문자열
   *
   * @example
   * encoder.encode("Hello World!");
   * encoder.encode(buffer, { compress: true });
   */
  encode(input: Buffer | string, options?: DduOptions): string {
    const shouldCompress = options?.compress ?? this.defaultCompress;
    const originalBuffer =
      typeof input === "string" ? Buffer.from(input, this.encoding) : input;

    // 비압축 인코딩
    if (!shouldCompress) {
      return this.effectiveBitLength <= MAX_FAST_BITS
        ? this.encodeFast(originalBuffer, false)
        : this.encodeBigInt(originalBuffer, false);
    }

    // 압축 시도
    const compressedBuffer = deflateSync(originalBuffer, { level: 9 });

    // 압축 효과가 없으면 원본 사용
    if (compressedBuffer.length >= originalBuffer.length) {
      return this.effectiveBitLength <= MAX_FAST_BITS
        ? this.encodeFast(originalBuffer, false)
        : this.encodeBigInt(originalBuffer, false);
    }

    return this.effectiveBitLength <= MAX_FAST_BITS
      ? this.encodeFast(compressedBuffer, true)
      : this.encodeBigInt(compressedBuffer, true);
  }

  /**
   * 인코딩된 문자열을 Buffer로 디코딩합니다.
   *
   * @param input - 디코딩할 인코딩된 문자열
   * @param options - 디코딩 옵션
   * @param options.maxDecodedBytes - 최대 디코딩 바이트 수
   * @param options.maxDecompressedBytes - 최대 압축해제 바이트 수
   * @returns 디코딩된 Buffer
   *
   * @throws 잘못된 문자가 포함된 경우
   * @throws 패딩 형식이 잘못된 경우
   * @throws 크기 제한 초과 시
   */
  decodeToBuffer(input: string, options?: DduOptions): Buffer {
    const { cleanedInput, paddingBits, isCompressed } = this.parseFooter(input);

    this.assertEncodedInputAligned(cleanedInput);

    // 디코딩 크기 검증
    const maxDecodedBytes = this.normalizeLimit(
      options?.maxDecodedBytes,
      this.defaultMaxDecodedBytes,
      true,
      "maxDecodedBytes"
    );
    const estimatedDecodedBytes = this.estimateDecodedBytes(
      cleanedInput.length,
      paddingBits
    );
    if (estimatedDecodedBytes > maxDecodedBytes) {
      throw new Error(
        `[Ddu64 decode] Decoded output exceeds limit. Estimated: ${estimatedDecodedBytes} bytes, Limit: ${maxDecodedBytes} bytes`
      );
    }

    // 디코딩 수행
    const decoded =
      this.effectiveBitLength <= MAX_FAST_BITS
        ? this.decodeFast(cleanedInput, paddingBits)
        : this.decodeBigInt(cleanedInput, paddingBits);

    if (!isCompressed) return decoded;

    // 압축 해제
    const maxDecompressedBytes = this.normalizeLimit(
      options?.maxDecompressedBytes,
      this.defaultMaxDecompressedBytes,
      true,
      "maxDecompressedBytes"
    );
    return this.inflateWithLimit(decoded, maxDecompressedBytes);
  }

  /**
   * 인코딩된 문자열을 원본 문자열로 디코딩합니다.
   *
   * @param input - 디코딩할 인코딩된 문자열
   * @param options - 디코딩 옵션
   * @returns 디코딩된 문자열
   *
   * @throws 잘못된 문자나 패딩 형식일 경우 에러
   */
  decode(input: string, options?: DduOptions): string {
    return this.decodeToBuffer(input, options).toString(this.encoding);
  }

  /**
   * 현재 인코더의 charset 정보를 반환합니다.
   *
   * @returns charset 설정 정보 객체
   */
  getCharSetInfo() {
    return {
      charSet: [...this.dduChar],
      paddingChar: this.paddingChar,
      charLength: this.charLength,
      bitLength: this.bitLength,
      usePowerOfTwo: this.usePowerOfTwo,
      encoding: this.encoding,
      defaultCompress: this.defaultCompress,
      defaultMaxDecodedBytes: this.defaultMaxDecodedBytes,
      defaultMaxDecompressedBytes: this.defaultMaxDecompressedBytes,
    };
  }

  // --------------------------------------------------------------------------
  // 유틸리티 메서드
  // --------------------------------------------------------------------------

  /**
   * 옵션 값을 정규화합니다.
   */
  private normalizeLimit(
    value: number | undefined,
    fallback: number,
    shouldThrow: boolean,
    name: string
  ): number {
    if (value === undefined) return fallback;
    if (value === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
    if (!Number.isFinite(value) || value <= 0) {
      if (shouldThrow) {
        throw new Error(
          `[Ddu64 options] Invalid ${name}. Must be a positive finite number or Infinity.`
        );
      }
      return fallback;
    }
    return Math.floor(value);
  }

  /**
   * 디코딩 결과 바이트 수를 추정합니다.
   */
  private estimateDecodedBytes(
    cleanedInputLen: number,
    paddingBits: number
  ): number {
    if (cleanedInputLen === 0) return 0;
    if (paddingBits < 0 || paddingBits >= this.effectiveBitLength) {
      throw new Error(`[Ddu64 decode] Invalid padding bits: ${paddingBits}`);
    }
    const chunkSize = this.usePowerOfTwo ? this.charLength : this.charLength * 2;
    const numChunks = Math.ceil(cleanedInputLen / chunkSize);
    const bits = numChunks * this.effectiveBitLength - paddingBits;
    if (bits < 0) throw new Error(`[Ddu64 decode] Invalid decoded bit length`);
    return Math.ceil(bits / BYTE_BITS);
  }

  /**
   * 인코딩된 입력의 정렬을 검증합니다.
   */
  private assertEncodedInputAligned(cleanedInput: string): void {
    const { charLength } = this;
    if (charLength <= 0) return;
    if (cleanedInput.length % charLength !== 0) {
      throw new Error(
        `[Ddu64 decode] Invalid encoded length. Expected multiple of ${charLength}, got ${cleanedInput.length}`
      );
    }
    if (!this.usePowerOfTwo) {
      const chunkSize = charLength * 2;
      if (cleanedInput.length % chunkSize !== 0) {
        throw new Error(
          `[Ddu64 decode] Invalid encoded length for variable charset. Expected multiple of ${chunkSize}, got ${cleanedInput.length}`
        );
      }
    }
  }

  /**
   * 크기 제한을 적용하여 압축을 해제합니다.
   */
  private inflateWithLimit(data: Buffer, maxBytes: number): Buffer {
    if (maxBytes === Number.POSITIVE_INFINITY) return inflateSync(data);

    try {
      return inflateSync(data, { maxOutputLength: maxBytes } as any);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      const code = String(e?.code ?? "");

      // maxOutputLength 미지원 시 fallback
      if (
        msg.toLowerCase().includes("maxoutputlength") ||
        msg.toLowerCase().includes("unknown option") ||
        code === "ERR_INVALID_ARG_VALUE"
      ) {
        const inflated = inflateSync(data);
        if (inflated.length > maxBytes) {
          throw new Error(
            `[Ddu64 decode] Decompressed data exceeds limit. Size: ${inflated.length} bytes, Limit: ${maxBytes} bytes`
          );
        }
        return inflated;
      }

      // 출력 제한 초과
      if (
        code === "ERR_BUFFER_TOO_LARGE" ||
        msg.toLowerCase().includes("output length") ||
        msg.toLowerCase().includes("buffer too large")
      ) {
        throw new Error(
          `[Ddu64 decode] Decompressed data exceeds limit. Limit: ${maxBytes} bytes`
        );
      }
      throw e;
    }
  }

  // --------------------------------------------------------------------------
  // 푸터 파싱
  // --------------------------------------------------------------------------

  /**
   * 인코딩된 문자열의 푸터(패딩 정보)를 파싱합니다.
   */
  private parseFooter(input: string): {
    cleanedInput: string;
    paddingBits: number;
    isCompressed: boolean;
  } {
    const inputLen = input.length;
    const pad = this.paddingChar;
    const padLen = pad.length;

    if (inputLen < padLen)
      return { cleanedInput: input, paddingBits: 0, isCompressed: false };

    const markerLen = COMPRESS_MARKER.length;
    const maxPaddingBits = Math.max(0, this.effectiveBitLength - 1);
    const maxDigits = maxPaddingBits.toString().length;

    // 인덱스 기반 문자열 비교
    const matchesAt = (str: string, pattern: string, start: number): boolean => {
      const pLen = pattern.length;
      if (start < 0 || start + pLen > str.length) return false;
      for (let i = 0; i < pLen; i++) {
        if (str.charCodeAt(start + i) !== pattern.charCodeAt(i)) return false;
      }
      return true;
    };

    const isDigitCode = (code: number) => code >= 48 && code <= 57;

    // 푸터 패턴 탐색
    for (
      let digitCount = Math.min(maxDigits, inputLen);
      digitCount >= 1;
      digitCount--
    ) {
      const digitsStart = inputLen - digitCount;
      const firstCode = input.charCodeAt(digitsStart);
      if (!isDigitCode(firstCode)) continue;

      let allDigits = true;
      for (let i = digitsStart + 1; i < inputLen; i++) {
        if (!isDigitCode(input.charCodeAt(i))) {
          allDigits = false;
          break;
        }
      }
      if (!allDigits) continue;

      const digitSuffix = input.substring(digitsStart);
      const paddingBits = parseInt(digitSuffix, 10);
      if (
        Number.isNaN(paddingBits) ||
        paddingBits < 0 ||
        paddingBits >= this.effectiveBitLength ||
        digitSuffix !== paddingBits.toString()
      )
        continue;

      // 압축 푸터: pad + marker + digits
      if (digitsStart >= padLen + markerLen) {
        const markerStart = digitsStart - markerLen;
        const padStart = markerStart - padLen;
        if (
          matchesAt(input, COMPRESS_MARKER, markerStart) &&
          matchesAt(input, pad, padStart)
        ) {
          if (padStart % this.charLength !== 0) {
            throw new Error(
              `[Ddu64 decode] Invalid padding format. Misaligned padding marker`
            );
          }
          return {
            cleanedInput: input.substring(0, padStart),
            paddingBits,
            isCompressed: true,
          };
        }
      }

      // 일반 푸터: pad + digits
      const padStart = digitsStart - padLen;
      if (padStart >= 0 && matchesAt(input, pad, padStart)) {
        if (padStart % this.charLength !== 0) {
          throw new Error(
            `[Ddu64 decode] Invalid padding format. Misaligned padding marker`
          );
        }
        return {
          cleanedInput: input.substring(0, padStart),
          paddingBits,
          isCompressed: false,
        };
      }
    }

    // Fallback: lastIndexOf 기반
    const lastPadIdx = input.lastIndexOf(pad);
    if (lastPadIdx >= 0 && lastPadIdx % this.charLength === 0) {
      const tailStart = lastPadIdx + padLen;
      if (tailStart >= inputLen) {
        throw new Error(
          `[Ddu64 decode] Invalid padding format. Missing padding length`
        );
      }

      let tail = input.substring(tailStart);
      const hasMarker =
        tail.length >= markerLen && matchesAt(tail, COMPRESS_MARKER, 0);
      if (hasMarker) {
        tail = tail.substring(markerLen);
        if (!tail) {
          throw new Error(
            `[Ddu64 decode] Invalid padding format. Missing padding length`
          );
        }
      }

      const paddingBits = parseInt(tail, 10);
      if (
        Number.isNaN(paddingBits) ||
        tail !== paddingBits.toString() ||
        paddingBits < 0 ||
        paddingBits >= this.effectiveBitLength
      ) {
        throw new Error(`[Ddu64 decode] Invalid padding format. Got: "${tail}"`);
      }

      const isCompressed = input
        .slice(lastPadIdx + padLen)
        .startsWith(COMPRESS_MARKER);
      return {
        cleanedInput: input.substring(0, lastPadIdx),
        paddingBits,
        isCompressed,
      };
    }

    return { cleanedInput: input, paddingBits: 0, isCompressed: false };
  }

  // --------------------------------------------------------------------------
  // 인코딩 (Fast 모드 - 16비트 이하)
  // --------------------------------------------------------------------------

  /**
   * 일반 정수 연산을 사용한 빠른 인코딩
   */
  private encodeFast(bufferInput: Buffer, compress?: boolean): string {
    const inputLen = bufferInput.length;
    if (inputLen === 0) return "";

    const { dduChar, effectiveBitLength: bitLength, paddingChar } = this;
    const dduLength = dduChar.length;

    const totalBits = inputLen * BYTE_BITS;
    const estimatedChunks = Math.ceil(totalBits / bitLength);
    const estimatedSymbols = this.usePowerOfTwo
      ? estimatedChunks
      : estimatedChunks * 2;
    const resultParts: string[] = new Array(estimatedSymbols + 3);
    let resultIdx = 0;

    let accumulator = 0;
    let accumulatorBits = 0;

    if (this.usePowerOfTwo) {
      const mask = (1 << bitLength) - 1;
      for (let i = 0; i < inputLen; i++) {
        accumulator = (accumulator << BYTE_BITS) | bufferInput[i];
        accumulatorBits += BYTE_BITS;

        while (accumulatorBits >= bitLength) {
          accumulatorBits -= bitLength;
          resultParts[resultIdx++] =
            dduChar[(accumulator >> accumulatorBits) & mask];
          accumulator &= (1 << accumulatorBits) - 1;
        }
      }
    } else {
      for (let i = 0; i < inputLen; i++) {
        accumulator = (accumulator << BYTE_BITS) | bufferInput[i];
        accumulatorBits += BYTE_BITS;

        while (accumulatorBits >= bitLength) {
          accumulatorBits -= bitLength;
          const index = accumulator >> accumulatorBits;
          const div = (index / dduLength) | 0;
          resultParts[resultIdx++] = dduChar[div];
          resultParts[resultIdx++] = dduChar[index - div * dduLength];
          accumulator &= (1 << accumulatorBits) - 1;
        }
      }
    }

    // 남은 비트 처리 (패딩)
    if (accumulatorBits > 0) {
      const paddingBits = bitLength - accumulatorBits;
      const index = accumulator << paddingBits;

      if (this.usePowerOfTwo) {
        resultParts[resultIdx++] = dduChar[index];
      } else {
        const div = (index / dduLength) | 0;
        resultParts[resultIdx++] = dduChar[div];
        resultParts[resultIdx++] = dduChar[index - div * dduLength];
      }
      resultParts[resultIdx++] = paddingChar;
      resultParts[resultIdx++] = compress
        ? COMPRESS_MARKER + paddingBits.toString()
        : paddingBits.toString();
    } else if (compress) {
      resultParts[resultIdx++] = paddingChar;
      resultParts[resultIdx++] = COMPRESS_MARKER + "0";
    }

    resultParts.length = resultIdx;
    return resultParts.join("");
  }

  // --------------------------------------------------------------------------
  // 디코딩 (Fast 모드 - 16비트 이하)
  // --------------------------------------------------------------------------

  /**
   * 일반 정수 연산을 사용한 빠른 디코딩
   */
  private decodeFast(cleanedInput: string, paddingBits: number): Buffer {
    const inputLen = cleanedInput.length;

    if (inputLen === 0) return Buffer.alloc(0);

    const { effectiveBitLength: bitLength, charLength } = this;
    const dduLength = this.dduChar.length;
    const chunkSize = this.usePowerOfTwo ? charLength : charLength * 2;

    const numChunks = Math.ceil(inputLen / chunkSize);
    const estimatedBytes = Math.ceil(
      (numChunks * bitLength - paddingBits) / BYTE_BITS
    );
    const buffer = new Uint8Array(estimatedBytes + 1);
    let bufIdx = 0;

    let accumulator = 0;
    let accumulatorBits = 0;

    if (this.usePowerOfTwo) {
      if (this.useAsciiLookup && this.fastAsciiLookup) {
        // ASCII 최적화 경로
        const lookup = this.fastAsciiLookup;
        for (let i = 0; i < inputLen; i += chunkSize) {
          const code = cleanedInput.charCodeAt(i);
          const val = code < 128 ? lookup[code] : -1;

          if (val < 0) {
            throw new Error(
              `[Ddu64 decode] Invalid character "${cleanedInput[i]}" at ${i}`
            );
          }

          accumulator = (accumulator << bitLength) | val;
          accumulatorBits += bitLength;

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
        // 일반 룩업 경로
        const lookup = this.dduBinaryLookup;
        for (let i = 0; i < inputLen; i += chunkSize) {
          const chunk = cleanedInput.slice(i, i + charLength);
          const val = lookup.get(chunk);

          if (val === undefined) {
            throw new Error(
              `[Ddu64 decode] Invalid character "${chunk}" at ${i}`
            );
          }

          accumulator = (accumulator << bitLength) | val;
          accumulatorBits += bitLength;

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
    } else {
      // 가변 길이 charset
      const lookup = this.dduBinaryLookup;
      for (let i = 0; i < inputLen; i += chunkSize) {
        const c1 = cleanedInput.slice(i, i + charLength);
        const c2 = cleanedInput.slice(i + charLength, i + chunkSize);
        const v1 = lookup.get(c1);
        const v2 = lookup.get(c2);

        if (v1 === undefined) {
          throw new Error(`[Ddu64 decode] Invalid character "${c1}" at ${i}`);
        }
        if (v2 === undefined) {
          throw new Error(
            `[Ddu64 decode] Invalid character "${c2}" at ${i + charLength}`
          );
        }

        const value = v1 * dduLength + v2;
        if (value >= this.maxBinaryValue) {
          throw new Error(`[Ddu64 decode] Value ${value} exceeds range`);
        }

        accumulator = (accumulator << bitLength) | value;
        accumulatorBits += bitLength;

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

    return Buffer.from(buffer.subarray(0, bufIdx));
  }

  // --------------------------------------------------------------------------
  // 인코딩 (BigInt 모드 - 17비트 이상)
  // --------------------------------------------------------------------------

  /**
   * BigInt를 사용한 대형 비트 인코딩
   */
  private encodeBigInt(bufferInput: Buffer, compress?: boolean): string {
    const inputLen = bufferInput.length;
    if (inputLen === 0) return "";

    const { dduChar, effectiveBitLength: bitLength } = this;
    const dduLength = dduChar.length;

    const estimatedChunks = Math.ceil((inputLen * BYTE_BITS) / bitLength);
    const estimatedSymbols = this.usePowerOfTwo
      ? estimatedChunks
      : estimatedChunks * 2;
    const resultParts: string[] = new Array(estimatedSymbols + 3);
    let resultIdx = 0;

    let accumulator = 0n;
    let accumulatorBits = 0;

    if (this.usePowerOfTwo) {
      for (let i = 0; i < inputLen; i++) {
        accumulator = (accumulator << 8n) | BigInt(bufferInput[i]);
        accumulatorBits += BYTE_BITS;

        while (accumulatorBits >= bitLength) {
          const shift = accumulatorBits - bitLength;
          resultParts[resultIdx++] =
            dduChar[Number(accumulator >> BigInt(shift))];
          accumulator &= (1n << BigInt(shift)) - 1n;
          accumulatorBits -= bitLength;
        }
      }
    } else {
      for (let i = 0; i < inputLen; i++) {
        accumulator = (accumulator << 8n) | BigInt(bufferInput[i]);
        accumulatorBits += BYTE_BITS;

        while (accumulatorBits >= bitLength) {
          const shift = accumulatorBits - bitLength;
          const idx = Number(accumulator >> BigInt(shift));
          const div = Math.floor(idx / dduLength);
          resultParts[resultIdx++] = dduChar[div];
          resultParts[resultIdx++] = dduChar[idx - div * dduLength];
          accumulator &= (1n << BigInt(shift)) - 1n;
          accumulatorBits -= bitLength;
        }
      }
    }

    // 남은 비트 처리 (패딩)
    if (accumulatorBits > 0) {
      const paddingBits = bitLength - accumulatorBits;
      const index = Number(accumulator << BigInt(paddingBits));

      if (this.usePowerOfTwo) {
        resultParts[resultIdx++] = dduChar[index];
      } else {
        const div = Math.floor(index / dduLength);
        resultParts[resultIdx++] = dduChar[div];
        resultParts[resultIdx++] = dduChar[index - div * dduLength];
      }
      resultParts[resultIdx++] = this.paddingChar;
      resultParts[resultIdx++] = compress
        ? COMPRESS_MARKER + paddingBits.toString()
        : paddingBits.toString();
    } else if (compress) {
      resultParts[resultIdx++] = this.paddingChar;
      resultParts[resultIdx++] = COMPRESS_MARKER + "0";
    }

    resultParts.length = resultIdx;
    return resultParts.join("");
  }

  // --------------------------------------------------------------------------
  // 디코딩 (BigInt 모드 - 17비트 이상)
  // --------------------------------------------------------------------------

  /**
   * BigInt를 사용한 대형 비트 디코딩
   */
  private decodeBigInt(cleanedInput: string, paddingBits: number): Buffer {
    const inputLen = cleanedInput.length;

    if (inputLen === 0) return Buffer.alloc(0);

    const {
      effectiveBitLength: bitLength,
      dduBinaryLookup: lookup,
      charLength,
    } = this;
    const bigBitLength = BigInt(bitLength);
    const dduLength = this.dduChar.length;
    const chunkSize = this.usePowerOfTwo ? charLength : charLength * 2;

    const numChunks = Math.ceil(inputLen / chunkSize);
    const estimatedBytes = Math.ceil(
      (numChunks * bitLength - paddingBits) / BYTE_BITS
    );
    const buffer = new Uint8Array(estimatedBytes + 1);
    let bufIdx = 0;

    let accumulator = 0n;
    let accumulatorBits = 0;

    if (this.usePowerOfTwo) {
      for (let i = 0; i < inputLen; i += chunkSize) {
        const chunk = cleanedInput.slice(i, i + charLength);
        const val = lookup.get(chunk);
        if (val === undefined) {
          throw new Error(
            `[Ddu64 decode] Invalid character "${chunk}" at ${i}`
          );
        }

        accumulator = (accumulator << bigBitLength) | BigInt(val);
        accumulatorBits += bitLength;

        if (i + chunkSize >= inputLen && paddingBits > 0) {
          accumulator >>= BigInt(paddingBits);
          accumulatorBits -= paddingBits;
        }

        while (accumulatorBits >= BYTE_BITS) {
          const shift = accumulatorBits - BYTE_BITS;
          buffer[bufIdx++] = Number((accumulator >> BigInt(shift)) & 0xffn);
          accumulator &= (1n << BigInt(shift)) - 1n;
          accumulatorBits -= BYTE_BITS;
        }
      }
    } else {
      for (let i = 0; i < inputLen; i += chunkSize) {
        const c1 = cleanedInput.slice(i, i + charLength);
        const c2 = cleanedInput.slice(i + charLength, i + chunkSize);
        const v1 = lookup.get(c1);
        const v2 = lookup.get(c2);

        if (v1 === undefined) {
          throw new Error(`[Ddu64 decode] Invalid character "${c1}" at ${i}`);
        }
        if (v2 === undefined) {
          throw new Error(
            `[Ddu64 decode] Invalid character "${c2}" at ${i + charLength}`
          );
        }

        const value = v1 * dduLength + v2;
        if (value >= this.maxBinaryValue) {
          throw new Error(`[Ddu64 decode] Value ${value} exceeds range`);
        }

        accumulator = (accumulator << bigBitLength) | BigInt(value);
        accumulatorBits += bitLength;

        if (i + chunkSize >= inputLen && paddingBits > 0) {
          accumulator >>= BigInt(paddingBits);
          accumulatorBits -= paddingBits;
        }

        while (accumulatorBits >= BYTE_BITS) {
          const shift = accumulatorBits - BYTE_BITS;
          buffer[bufIdx++] = Number((accumulator >> BigInt(shift)) & 0xffn);
          accumulator &= (1n << BigInt(shift)) - 1n;
          accumulatorBits -= BYTE_BITS;
        }
      }
    }

    return Buffer.from(buffer.subarray(0, bufIdx));
  }

  // --------------------------------------------------------------------------
  // Charset 초기화 메서드
  // --------------------------------------------------------------------------

  /**
   * Charset을 정규화합니다.
   */
  private normalizeCharSet(
    current: {
      charSet: string[];
      padding: string;
      requiredLength: number;
      bitLength: number;
      isPredefined: boolean;
    },
    shouldThrow: boolean,
    dduOptions?: DduConstructorOptions
  ): {
    charSet: string[];
    padding: string;
    charLength: number;
    isPredefined: boolean;
  } {
    let state = { ...current };
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        // 중복 문자 제거
        const uniqueChars = Array.from(new Set(state.charSet));
        if (uniqueChars.length !== state.charSet.length) {
          if (shouldThrow) {
            const duplicates = state.charSet.filter(
              (c, i) => state.charSet.indexOf(c) !== i
            );
            throw new Error(
              `[Ddu64 normalizeCharSet] Character set contains duplicate characters: [${[...new Set(duplicates)].join(", ")}]`
            );
          }
          state.charSet = uniqueChars;
          if (!state.isPredefined) state.requiredLength = state.charSet.length;
        }

        // 문자 수 검증
        if (state.charSet.length < state.requiredLength) {
          throw new Error(
            `[Ddu64 normalizeCharSet] Insufficient characters. Required: ${state.requiredLength}, Has: ${state.charSet.length}`
          );
        }
        if (state.requiredLength < 2) {
          throw new Error(
            `[Ddu64 normalizeCharSet] At least 2 unique characters required.`
          );
        }
        if (state.charSet.length === 0) {
          throw new Error(`[Ddu64 normalizeCharSet] Empty charset.`);
        }

        // 문자 길이 일관성 검증
        const charLength = state.charSet[0].length;
        const invalidChar = state.charSet.find((c) => c.length !== charLength);
        if (invalidChar) {
          if (shouldThrow) {
            throw new Error(
              `[Ddu64 normalizeCharSet] Inconsistent char length. Expected ${charLength}, found "${invalidChar}" (${invalidChar.length})`
            );
          }
          throw new Error("internal retry");
        }

        // 패딩 검증
        if (state.padding.length !== charLength) {
          throw new Error(
            `[Ddu64 normalizeCharSet] Padding length mismatch. Expected ${charLength}, got ${state.padding.length}`
          );
        }
        if (state.charSet.includes(state.padding)) {
          if (shouldThrow) {
            throw new Error(
              `[Ddu64 normalizeCharSet] Padding character "${state.padding}" conflicts with charset.`
            );
          }
          state.charSet = state.charSet.filter((c) => c !== state.padding);
        }

        // 불필요한 배열 복사 방지
        const finalSet =
          state.charSet.length === state.requiredLength
            ? state.charSet
            : state.charSet.slice(0, state.requiredLength);

        return {
          charSet: finalSet,
          padding: state.padding,
          charLength,
          isPredefined: state.isPredefined,
        };
      } catch (e: any) {
        if (shouldThrow && !e.message.includes("internal retry")) throw e;
        state = this.getFallbackCharSet(dduOptions);
        retryCount++;
      }
    }

    // 최종 fallback
    const fallback = this.getFallbackCharSet(dduOptions);
    return {
      charSet: fallback.charSet.slice(0, fallback.requiredLength),
      padding: fallback.padding,
      charLength: fallback.charSet[0]?.length ?? 1,
      isPredefined: true,
    };
  }

  /**
   * 초기 charset을 결정합니다.
   */
  private resolveInitialCharSet(
    dduChar: string[] | string | undefined,
    paddingChar: string | undefined,
    dduOptions: DduConstructorOptions | undefined,
    shouldThrow: boolean
  ) {
    const buildMeta = (
      set: string[],
      padding: string,
      length: number,
      isPredefined: boolean
    ) => {
      const usePow2 = this.shouldUsePowerOfTwo(length, dduOptions?.usePowerOfTwo);
      if (usePow2 && length > 0) {
        const exponent = this.getLargestPowerOfTwoExponent(length);
        const pow2Length = 1 << exponent;
        const selected = set.length === pow2Length ? set : set.slice(0, pow2Length);
        return {
          charSet: selected,
          padding,
          requiredLength: pow2Length,
          bitLength: exponent,
          isPredefined,
        };
      }
      const selected = set.length === length ? set : set.slice(0, length);
      return {
        charSet: selected,
        padding,
        requiredLength: length,
        bitLength: length > 0 ? this.getBitLength(length) : 0,
        isPredefined,
      };
    };

    try {
      const finalDduChar = dduChar ?? dduOptions?.dduChar;
      const finalPadding = paddingChar ?? dduOptions?.paddingChar;

      if (finalDduChar) {
        if (!finalPadding) {
          throw new Error(
            `[Ddu64 Constructor] paddingChar is required when dduChar is provided.`
          );
        }

        const arr =
          typeof finalDduChar === "string"
            ? [...finalDduChar.trim()]
            : [...finalDduChar];
        if (shouldThrow) {
          const uniqueSize = new Set(arr).size;
          if (uniqueSize !== arr.length) {
            const duplicates = arr.filter((c, i) => arr.indexOf(c) !== i);
            throw new Error(
              `[Ddu64 Constructor] Character set contains duplicate characters: [${[...new Set(duplicates)].join(", ")}]`
            );
          }
        }

        const reqLen = dduOptions?.requiredLength ?? arr.length;
        if (arr.length < reqLen) {
          throw new Error(`[Ddu64 Constructor] Insufficient characters.`);
        }

        return buildMeta(arr, finalPadding, reqLen, false);
      }

      const symbol =
        dduOptions?.dduSetSymbol ??
        dduDefaultConstructorOptions.dduSetSymbol ??
        DduSetSymbol.DDU;
      const cs = this.getCharSetOrThrow(symbol);
      return buildMeta(cs.charSet, cs.paddingChar, cs.maxRequiredLength, true);
    } catch (error) {
      if (shouldThrow) throw error;
      return this.getFallbackCharSet(dduOptions);
    }
  }

  /**
   * Fallback charset을 반환합니다.
   */
  private getFallbackCharSet(dduOptions?: DduConstructorOptions) {
    const symbol =
      dduOptions?.dduSetSymbol ??
      dduDefaultConstructorOptions.dduSetSymbol ??
      DduSetSymbol.ONECHARSET;
    const cs = getCharSet(symbol) ?? getCharSet(DduSetSymbol.ONECHARSET);
    if (!cs) throw new Error(`Critical: No fallback CharSet available`);
    return {
      charSet: cs.charSet,
      padding: cs.paddingChar,
      requiredLength: cs.maxRequiredLength,
      bitLength: cs.bitLength,
      isPredefined: true,
    };
  }

  /**
   * 2의 제곱수 사용 여부를 결정합니다.
   */
  private shouldUsePowerOfTwo(length: number, preference?: boolean): boolean {
    if (preference !== undefined) return preference ? length > 0 : false;
    return length > 0 && (length & (length - 1)) === 0;
  }

  /**
   * charset을 가져오거나 에러를 발생시킵니다.
   */
  private getCharSetOrThrow(symbol: DduSetSymbol) {
    const cs = getCharSet(symbol);
    if (!cs) throw new Error(`CharSet with symbol ${symbol} not found`);
    return cs;
  }

  /**
   * 커스텀 charset의 조합 중복을 검증합니다.
   */
  private validateCombinationDuplicates(
    charSet: string[],
    paddingChar: string,
    requiredLength: number
  ): void {
    if (charSet[0].length !== 1 || requiredLength > 256) return;

    const limit = Math.min(charSet.length, requiredLength);
    const targetChars = charSet.slice(0, limit);
    const combinations = new Set<string>();

    const add = (s: string, context: string) => {
      if (combinations.has(s))
        throw new Error(`Combination conflict: ${context}`);
      combinations.add(s);
    };

    for (let i = 0; i < targetChars.length; i++) {
      combinations.add(targetChars[i]);
    }
    combinations.add(paddingChar);

    for (let i = 0; i < targetChars.length; i++) {
      const c1 = targetChars[i];
      for (let j = 0; j < targetChars.length; j++) {
        add(c1 + targetChars[j], `"${c1}" + "${targetChars[j]}"`);
      }
      add(c1 + paddingChar, `"${c1}" + padding`);
      add(paddingChar + c1, `padding + "${c1}"`);
    }
    add(paddingChar + paddingChar, "double padding");
  }
}
