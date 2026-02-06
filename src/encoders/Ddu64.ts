import { deflateSync, inflateSync } from "zlib";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { BaseDdu } from "../base/BaseDdu";
import {
  DduConstructorOptions,
  DduOptions,
  DduSetSymbol,
  DduEncodeStats,
  DduProgressInfo,
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

/** 체크섬 마커 */
const CHECKSUM_MARKER = "CHK";

/** 암호화 마커 */
const ENCRYPT_MARKER = "ENC";

/** 기본 최대 디코딩 바이트 수 (64MB) */
const DEFAULT_MAX_DECODED_BYTES = 64 * 1024 * 1024;

/** 기본 최대 압축해제 바이트 수 (64MB) */
const DEFAULT_MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;

/** CRC32 룩업 테이블 (바이트 단위 연산으로 비트 루프 대비 4~8배 빠름) */
const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    table[i] = crc;
  }
  return table;
})();

/** URL-Safe 문자 매핑 */
const URL_SAFE_MAP: Record<string, string> = {
  "+": "-",
  "/": "_",
  "=": ".",
};

/** URL-Safe 역방향 매핑 */
const URL_SAFE_REVERSE_MAP: Record<string, string> = {
  "-": "+",
  "_": "/",
  ".": "=",
};

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

  /** URL-Safe 모드 여부 */
  private readonly urlSafe: boolean;

  /** 암호화 키 */
  private readonly encryptionKey: string | undefined;

  /** 기본 체크섬 사용 여부 */
  private readonly defaultChecksum: boolean;

  /** 기본 청크 크기 */
  private readonly defaultChunkSize: number | undefined;

  /** 기본 청크 구분자 */
  private readonly defaultChunkSeparator: string;

  /** 기본 압축 레벨 (1~9) */
  private readonly defaultCompressionLevel: number;

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
    // throwOnError 우선, useBuildErrorReturn은 하위 호환
    const shouldThrow = dduOptions?.throwOnError ?? dduOptions?.useBuildErrorReturn ?? false;

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

    // 새로운 옵션들 초기화
    this.urlSafe = dduOptions?.urlSafe ?? false;
    this.encryptionKey = dduOptions?.encryptionKey;
    this.defaultChecksum = dduOptions?.checksum ?? false;
    this.defaultChunkSize = dduOptions?.chunkSize;
    this.defaultChunkSeparator = dduOptions?.chunkSeparator ?? "\n";
    this.defaultCompressionLevel = Math.min(9, Math.max(1, Math.floor(dduOptions?.compressionLevel ?? 6)));

    // URL-Safe 모드 시 charset/padding 충돌 검증
    if (this.urlSafe) {
      this.validateUrlSafeCharSet(this.dduChar, this.paddingChar, shouldThrow);
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
   * @param options.checksum - 체크섬 추가 여부
   * @param options.chunkSize - 청크 분할 크기
   * @param options.chunkSeparator - 청크 구분자
   * @param options.onProgress - 진행률 콜백
   * @returns 인코딩된 문자열
   *
   * @example
   * encoder.encode("Hello World!");
   * encoder.encode(buffer, { compress: true });
   * encoder.encode(data, { checksum: true, chunkSize: 76 });
   */
  encode(input: Buffer | string, options?: DduOptions): string {
    const shouldCompress = options?.compress ?? this.defaultCompress;
    const shouldChecksum = options?.checksum ?? this.defaultChecksum;
    const chunkSize = options?.chunkSize ?? this.defaultChunkSize;
    const chunkSeparator = options?.chunkSeparator ?? this.defaultChunkSeparator;
    const onProgress = options?.onProgress;

    let workingBuffer =
      typeof input === "string" ? Buffer.from(input, this.encoding) : input;
    const totalBytes = workingBuffer.length;

    // 진행률 콜백 호출 (시작)
    if (onProgress) {
      onProgress({ processedBytes: 0, totalBytes, percent: 0, stage: "start" });
    }

    // 암호화 처리
    let isEncrypted = false;
    if (this.encryptionKey) {
      workingBuffer = this.encryptData(workingBuffer);
      isEncrypted = true;
      if (onProgress) {
        onProgress({ processedBytes: 0, totalBytes, percent: 15, stage: "encrypt" });
      }
    }

    // 체크섬 계산
    let checksum = "";
    if (shouldChecksum) {
      checksum = this.calculateCRC32(workingBuffer);
      if (onProgress) {
        onProgress({ processedBytes: 0, totalBytes, percent: 20, stage: "checksum" });
      }
    }

    // 압축 처리
    let useCompression = false;
    if (shouldCompress) {
      const level = options?.compressionLevel ?? this.defaultCompressionLevel;
      const compressedBuffer = deflateSync(workingBuffer, { level: Math.min(9, Math.max(1, level)) });
      if (compressedBuffer.length < workingBuffer.length) {
        workingBuffer = compressedBuffer;
        useCompression = true;
      }
      if (onProgress) {
        onProgress({ processedBytes: Math.floor(totalBytes * 0.4), totalBytes, percent: 40, stage: "compress" });
      }
    }

    // 인코딩 수행
    if (onProgress) {
      onProgress({ processedBytes: Math.floor(totalBytes * 0.5), totalBytes, percent: 50, stage: "encode" });
    }

    let result = this.effectiveBitLength <= MAX_FAST_BITS
      ? this.encodeFast(workingBuffer, useCompression, isEncrypted)
      : this.encodeBigInt(workingBuffer, useCompression, isEncrypted);

    // 체크섬 추가
    if (shouldChecksum && checksum) {
      result = result + CHECKSUM_MARKER + checksum;
    }

    // URL-Safe 변환
    if (this.urlSafe) {
      result = this.toUrlSafe(result);
    }

    // 청크 분할
    if (chunkSize && chunkSize > 0) {
      result = this.splitIntoChunks(result, chunkSize, chunkSeparator);
    }

    // 진행률 콜백 호출 (완료)
    if (onProgress) {
      onProgress({ processedBytes: totalBytes, totalBytes, percent: 100, stage: "done" });
    }

    return result;
  }

  /**
   * 인코딩된 문자열을 Buffer로 디코딩합니다.
   *
   * @param input - 디코딩할 인코딩된 문자열
   * @param options - 디코딩 옵션
   * @param options.maxDecodedBytes - 최대 디코딩 바이트 수
   * @param options.maxDecompressedBytes - 최대 압축해제 바이트 수
   * @param options.onProgress - 진행률 콜백
   * @returns 디코딩된 Buffer
   *
   * @throws 잘못된 문자가 포함된 경우
   * @throws 패딩 형식이 잘못된 경우
   * @throws 크기 제한 초과 시
   * @throws 체크섬 불일치 시
   */
  decodeToBuffer(input: string, options?: DduOptions): Buffer {
    const shouldChecksum = options?.checksum ?? this.defaultChecksum;
    const onProgress = options?.onProgress;
    let workingInput = input;

    const inputLength = input.length;

    // 진행률 콜백 호출 (시작)
    if (onProgress) {
      onProgress({ processedBytes: 0, totalBytes: inputLength, percent: 0, stage: "start" });
    }

    // 청크 제거 (줄바꿈 등 구분자 제거)
    workingInput = this.removeChunks(workingInput);

    // URL-Safe 역변환
    if (this.urlSafe) {
      workingInput = this.fromUrlSafe(workingInput);
    }

    // 체크섬 추출 (체크섬이 활성화된 경우에만 수행하여 오탐지 방지)
    let extractedChecksum: string | null = null;
    if (shouldChecksum) {
      const result = this.extractChecksum(workingInput);
      extractedChecksum = result.checksum;
      workingInput = result.data;
    }

    const { cleanedInput, paddingBits, isCompressed, isEncrypted } = this.parseFooter(workingInput);

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
    if (onProgress) {
      onProgress({ processedBytes: Math.floor(inputLength * 0.2), totalBytes: inputLength, percent: 20, stage: "decode" });
    }

    let decoded =
      this.effectiveBitLength <= MAX_FAST_BITS
        ? this.decodeFast(cleanedInput, paddingBits)
        : this.decodeBigInt(cleanedInput, paddingBits);

    // 압축 해제
    if (isCompressed) {
      if (onProgress) {
        onProgress({ processedBytes: Math.floor(inputLength * 0.5), totalBytes: inputLength, percent: 50, stage: "decompress" });
      }
      const maxDecompressedBytes = this.normalizeLimit(
        options?.maxDecompressedBytes,
        this.defaultMaxDecompressedBytes,
        true,
        "maxDecompressedBytes"
      );
      decoded = this.inflateWithLimit(decoded, maxDecompressedBytes);
    }

    // 체크섬 검증
    if (extractedChecksum) {
      if (onProgress) {
        onProgress({ processedBytes: Math.floor(inputLength * 0.7), totalBytes: inputLength, percent: 70, stage: "checksum" });
      }
      const calculatedChecksum = this.calculateCRC32(decoded);
      if (calculatedChecksum !== extractedChecksum) {
        throw new Error(
          `[Ddu64 decode] Checksum mismatch. Expected: ${extractedChecksum}, Got: ${calculatedChecksum}`
        );
      }
    }

    // 복호화
    if (isEncrypted && this.encryptionKey) {
      if (onProgress) {
        onProgress({ processedBytes: Math.floor(inputLength * 0.85), totalBytes: inputLength, percent: 85, stage: "decrypt" });
      }
      decoded = this.decryptData(decoded);
    }

    // 진행률 콜백 호출 (완료)
    if (onProgress) {
      onProgress({ processedBytes: inputLength, totalBytes: inputLength, percent: 100, stage: "done" });
    }

    return decoded;
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
      urlSafe: this.urlSafe,
      hasEncryptionKey: !!this.encryptionKey,
      defaultChecksum: this.defaultChecksum,
      defaultChunkSize: this.defaultChunkSize,
    };
  }

  /**
   * 인코딩 통계 정보를 반환합니다.
   *
   * @param input - 분석할 데이터
   * @param options - 인코딩 옵션
   * @returns 통계 정보 객체
   */
  getStats(input: Buffer | string, options?: DduOptions): DduEncodeStats {
    const shouldCompress = options?.compress ?? this.defaultCompress;
    const originalBuffer =
      typeof input === "string" ? Buffer.from(input, this.encoding) : input;
    const originalSize = originalBuffer.length;

    // encode를 먼저 호출하여 입력 유효성 검증을 선행합니다.
    // 압축 통계는 compressedSize 보고를 위해 별도 계산이 필요하지만,
    // 동일한 compressionLevel을 사용하여 일관성을 유지합니다.
    const encoded = this.encode(input, options);
    const encodedSize = encoded.length;
    const expansionRatio = originalSize > 0 ? encodedSize / originalSize : 0;

    let compressedSize: number | undefined;
    let compressionRatio: number | undefined;

    if (shouldCompress) {
      const level = options?.compressionLevel ?? this.defaultCompressionLevel;
      const compressedBuffer = deflateSync(originalBuffer, { level: Math.min(9, Math.max(1, level)) });
      compressedSize = compressedBuffer.length;
      compressionRatio = originalSize > 0 ? compressedSize / originalSize : 0;
    }

    return {
      originalSize,
      encodedSize,
      compressedSize,
      compressionRatio,
      expansionRatio,
      charsetSize: this.dduChar.length,
      bitLength: this.bitLength,
    };
  }

  /**
   * 비동기 인코딩을 수행합니다.
   *
   * 내부적으로 동기 encode()를 setImmediate로 이벤트 루프에 양보한 뒤 실행합니다.
   * 호출자가 즉시 블로킹되지 않도록 보장하지만, 인코딩 자체는 단일 동기 작업으로
   * 수행되므로 대용량 데이터(수 MB 이상) 처리 시 이벤트 루프가 블로킹될 수 있습니다.
   * 대용량 처리가 필요한 경우 스트림 API(createEncodeStream) 사용을 권장합니다.
   *
   * @param input - 인코딩할 데이터
   * @param options - 인코딩 옵션
   * @returns 인코딩된 문자열 Promise
   */
  async encodeAsync(input: Buffer | string, options?: DduOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          resolve(this.encode(input, options));
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /**
   * 비동기 디코딩을 수행합니다.
   *
   * 내부적으로 동기 decode()를 setImmediate로 이벤트 루프에 양보한 뒤 실행합니다.
   * 대용량 처리가 필요한 경우 스트림 API(createDecodeStream) 사용을 권장합니다.
   *
   * @param input - 디코딩할 인코딩된 문자열
   * @param options - 디코딩 옵션
   * @returns 디코딩된 문자열 Promise
   */
  async decodeAsync(input: string, options?: DduOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          resolve(this.decode(input, options));
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /**
   * 비동기 디코딩을 Buffer로 수행합니다.
   *
   * 내부적으로 동기 decodeToBuffer()를 setImmediate로 이벤트 루프에 양보한 뒤 실행합니다.
   * 대용량 처리가 필요한 경우 스트림 API(createDecodeStream) 사용을 권장합니다.
   *
   * @param input - 디코딩할 인코딩된 문자열
   * @param options - 디코딩 옵션
   * @returns 디코딩된 Buffer Promise
   */
  async decodeToBufferAsync(input: string, options?: DduOptions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          resolve(this.decodeToBuffer(input, options));
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  // --------------------------------------------------------------------------
  // URL-Safe 메서드
  // --------------------------------------------------------------------------

  /**
   * 문자열을 URL-Safe 형식으로 변환합니다.
   * 단일 정규식 패스로 처리하여 split/join 3회 반복 대비 메모리/속도 개선
   */
  private toUrlSafe(input: string): string {
    return input.replace(/[+/=]/g, (c) => URL_SAFE_MAP[c]);
  }

  /**
   * URL-Safe 형식에서 원래 형식으로 복원합니다.
   */
  private fromUrlSafe(input: string): string {
    return input.replace(/[-_.]/g, (c) => URL_SAFE_REVERSE_MAP[c]);
  }

  // --------------------------------------------------------------------------
  // 체크섬 메서드
  // --------------------------------------------------------------------------

  /**
   * CRC32 체크섬을 계산합니다. (룩업 테이블 사용)
   */
  private calculateCRC32(data: Buffer): string {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xff];
    }
    return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
  }

  /**
   * 인코딩된 문자열에서 체크섬을 추출합니다.
   */
  private extractChecksum(input: string): { data: string; checksum: string | null } {
    const markerIndex = input.lastIndexOf(CHECKSUM_MARKER);
    if (markerIndex === -1) {
      return { data: input, checksum: null };
    }
    const checksum = input.slice(markerIndex + CHECKSUM_MARKER.length);
    if (checksum.length !== 8 || !/^[0-9a-f]+$/i.test(checksum)) {
      return { data: input, checksum: null };
    }
    return {
      data: input.slice(0, markerIndex),
      checksum: checksum.toLowerCase(),
    };
  }

  // --------------------------------------------------------------------------
  // 청크 분할 메서드
  // --------------------------------------------------------------------------

  /**
   * 문자열을 청크로 분할합니다.
   */
  private splitIntoChunks(input: string, chunkSize: number, separator: string): string {
    if (chunkSize <= 0) return input;
    const chunks: string[] = [];
    for (let i = 0; i < input.length; i += chunkSize) {
      chunks.push(input.slice(i, i + chunkSize));
    }
    return chunks.join(separator);
  }

  /**
   * 청크 구분자를 제거합니다.
   * 줄바꿈(\r, \n)과 인스턴스에 설정된 청크 구분자만 제거합니다.
   * 공백/탭 등은 charset에 포함될 수 있으므로 제거하지 않습니다.
   */
  private removeChunks(input: string): string {
    // 줄바꿈 문자(\r, \n)는 항상 제거 (기본 구분자 및 일반적 라인 구분)
    let result = input.replace(/[\r\n]/g, "");

    // 커스텀 구분자가 줄바꿈이 아닌 경우 추가로 제거
    const sep = this.defaultChunkSeparator;
    if (sep && sep !== "\n" && sep !== "\r\n" && sep !== "\r") {
      result = result.split(sep).join("");
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // 암호화 메서드
  // --------------------------------------------------------------------------

  /**
   * 데이터를 AES-256-GCM으로 암호화합니다.
   */
  private encryptData(data: Buffer): Buffer {
    if (!this.encryptionKey) {
      throw new Error("[Ddu64 encrypt] Encryption key is not set");
    }

    // 키를 32바이트로 해시
    const key = createHash("sha256").update(this.encryptionKey).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);

    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // iv (12) + authTag (16) + encrypted
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * AES-256-GCM으로 암호화된 데이터를 복호화합니다.
   */
  private decryptData(data: Buffer): Buffer {
    if (!this.encryptionKey) {
      throw new Error("[Ddu64 decrypt] Encryption key is not set");
    }

    if (data.length < 28) {
      throw new Error("[Ddu64 decrypt] Invalid encrypted data");
    }

    const key = createHash("sha256").update(this.encryptionKey).digest();
    const iv = data.subarray(0, 12);
    const authTag = data.subarray(12, 28);
    const encrypted = data.subarray(28);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
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
   *
   * 푸터 형식: {encodedData}{paddingChar}[ELYSIA][ENC]{digits}
   * 끝에서부터 역순으로 파싱하여 paddingChar가 숫자인 경우도 안전하게 처리합니다.
   */
  private parseFooter(input: string): {
    cleanedInput: string;
    paddingBits: number;
    isCompressed: boolean;
    isEncrypted: boolean;
  } {
    const inputLen = input.length;
    const pad = this.paddingChar;
    const padLen = pad.length;
    const noFooter = { cleanedInput: input, paddingBits: 0, isCompressed: false, isEncrypted: false };

    if (inputLen < padLen) return noFooter;

    const maxPaddingBits = Math.max(0, this.effectiveBitLength - 1);
    const maxDigits = maxPaddingBits.toString().length;

    // 끝에서부터 역순 파싱: digits → ENC → ELYSIA → paddingChar
    for (let digitCount = Math.min(maxDigits, inputLen); digitCount >= 1; digitCount--) {
      const digitsStart = inputLen - digitCount;

      // 1) trailing digits 확인
      let allDigits = true;
      for (let i = digitsStart; i < inputLen; i++) {
        const c = input.charCodeAt(i);
        if (c < 48 || c > 57) { allDigits = false; break; }
      }
      if (!allDigits) continue;

      const digitStr = input.substring(digitsStart);
      const paddingBits = parseInt(digitStr, 10);
      if (
        Number.isNaN(paddingBits) ||
        paddingBits < 0 ||
        paddingBits >= this.effectiveBitLength ||
        digitStr !== paddingBits.toString()
      ) continue;

      // 2) digits 앞에서 마커들 역순 확인
      let pos = digitsStart;
      let isEncrypted = false;
      let isCompressed = false;

      if (pos >= ENCRYPT_MARKER.length && input.substring(pos - ENCRYPT_MARKER.length, pos) === ENCRYPT_MARKER) {
        isEncrypted = true;
        pos -= ENCRYPT_MARKER.length;
      }

      if (pos >= COMPRESS_MARKER.length && input.substring(pos - COMPRESS_MARKER.length, pos) === COMPRESS_MARKER) {
        isCompressed = true;
        pos -= COMPRESS_MARKER.length;
      }

      // 3) 마커 앞에서 padding 문자 확인
      const padStart = pos - padLen;
      if (padStart >= 0 && input.substring(padStart, pos) === pad) {
        if (padStart % this.charLength !== 0) {
          throw new Error(
            `[Ddu64 decode] Invalid padding format. Misaligned padding marker`
          );
        }
        return {
          cleanedInput: input.substring(0, padStart),
          paddingBits,
          isCompressed,
          isEncrypted,
        };
      }
    }

    // Fallback: 역순 탐색이 유효한 패딩을 찾지 못한 경우,
    // padding 문자가 존재하지만 tail이 잘못된 형식인지 확인하여 에러 보고
    const lastPadIdx = input.lastIndexOf(pad);
    if (lastPadIdx >= 0 && lastPadIdx % this.charLength === 0) {
      const tailStart = lastPadIdx + padLen;
      if (tailStart >= inputLen) {
        throw new Error(
          `[Ddu64 decode] Invalid padding format. Missing padding length`
        );
      }
      const tail = input.substring(tailStart);
      throw new Error(`[Ddu64 decode] Invalid padding format. Got: "${tail}"`);
    }

    return noFooter;
  }

  // --------------------------------------------------------------------------
  // 인코딩 (Fast 모드 - 16비트 이하)
  // --------------------------------------------------------------------------

  /**
   * 일반 정수 연산을 사용한 빠른 인코딩
   */
  private encodeFast(bufferInput: Buffer, compress?: boolean, encrypt?: boolean): string {
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
    const buildMarker = (bits: number) => {
      let marker = "";
      if (compress) marker += COMPRESS_MARKER;
      if (encrypt) marker += ENCRYPT_MARKER;
      return marker + bits.toString();
    };

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
      resultParts[resultIdx++] = buildMarker(paddingBits);
    } else if (compress || encrypt) {
      resultParts[resultIdx++] = paddingChar;
      resultParts[resultIdx++] = buildMarker(0);
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
  private encodeBigInt(bufferInput: Buffer, compress?: boolean, encrypt?: boolean): string {
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
    const buildMarker = (bits: number) => {
      let marker = "";
      if (compress) marker += COMPRESS_MARKER;
      if (encrypt) marker += ENCRYPT_MARKER;
      return marker + bits.toString();
    };

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
      resultParts[resultIdx++] = buildMarker(paddingBits);
    } else if (compress || encrypt) {
      resultParts[resultIdx++] = this.paddingChar;
      resultParts[resultIdx++] = buildMarker(0);
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
   * URL-Safe 모드 시 charset/padding이 역변환 대상 문자를 포함하지 않는지 검증합니다.
   * 역변환 대상 문자("-", "_", ".")가 charset이나 padding에 있으면
   * fromUrlSafe 시 해당 문자가 "+", "/", "="로 변환되어 데이터가 손상됩니다.
   */
  private validateUrlSafeCharSet(
    charSet: string[],
    paddingChar: string,
    shouldThrow: boolean
  ): void {
    const conflictChars = Object.keys(URL_SAFE_REVERSE_MAP); // ["-", "_", "."]

    for (const ch of conflictChars) {
      // charset 문자 내에 역변환 대상 문자가 포함되어 있는지 확인
      for (const c of charSet) {
        if (c.includes(ch)) {
          const msg = `[Ddu64 Constructor] URL-Safe mode conflict: charset character "${c}" contains "${ch}" which would be transformed to "${URL_SAFE_REVERSE_MAP[ch]}" during decoding.`;
          if (shouldThrow) throw new Error(msg);
          // shouldThrow가 아닌 경우 urlSafe를 비활성화
          (this as any).urlSafe = false;
          return;
        }
      }
      // padding 문자에 역변환 대상 문자가 포함되어 있는지 확인
      if (paddingChar.includes(ch)) {
        const msg = `[Ddu64 Constructor] URL-Safe mode conflict: padding character "${paddingChar}" contains "${ch}" which would be transformed to "${URL_SAFE_REVERSE_MAP[ch]}" during decoding.`;
        if (shouldThrow) throw new Error(msg);
        (this as any).urlSafe = false;
        return;
      }
    }
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
