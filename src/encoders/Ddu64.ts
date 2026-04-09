import { deflateSync, brotliCompressSync, brotliDecompressSync, constants } from "zlib";
import { createDecipheriv } from "crypto";
import { BaseDdu } from "../base/BaseDdu";
import {
  DduConstructorOptions,
  DduOptions,
  DduSetSymbol,
  DduEncodeStats,
  dduDefaultConstructorOptions,
} from "../types";
import { getCharSet } from "../charSets";
import {
  deriveKey,
  encryptAes256Gcm,
  decryptAes256Gcm,
  inflateWithLimit as inflateWithLimitUtil,
  GcmEncryptStream,
  GcmDecryptStream,
} from "../utils/crypto";
import {
  toUrlSafeFast,
  fromUrlSafeFast,
  splitIntoChunksFast,
  removeChunksFast,
  calculateCRC32,
  extractChecksum,
  URL_SAFE_REVERSE_MAP,
  CHECKSUM_MARKER,
  COMPRESS_MARKER,
  BROTLI_MARKER,
  ENCRYPT_MARKER
} from "../utils/codecUtils";

// ============================================================================
// 상수 정의
// ============================================================================

/** 바이트당 비트 수 */
const BYTE_BITS = 8;

/** 일반 정수 연산이 가능한 최대 비트 길이 (초과 시 BigInt 사용) */
const MAX_FAST_BITS = 16;

/** 바이트 마스크 (0xFF) */
const BYTE_MASK = 0xff;



/** 기본 최대 디코딩 바이트 수 (64MB) */
const DEFAULT_MAX_DECODED_BYTES = 64 * 1024 * 1024;

/** 기본 최대 압축해제 바이트 수 (64MB) */
const DEFAULT_MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;


/** 인코딩 진행률 단계별 퍼센트 */
const ENCODE_PROGRESS = {
  START: 0,
  ENCRYPT: 15,
  CHECKSUM: 20,
  COMPRESS: 40,
  ENCODE: 50,
  DONE: 100,
} as const;

/** 디코딩 진행률 단계별 퍼센트 */
const DECODE_PROGRESS = {
  START: 0,
  DECODE: 20,
  DECOMPRESS: 50,
  CHECKSUM: 70,
  DECRYPT: 85,
  DONE: 100,
} as const;

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

  /** 암호화 키 해시 (AES-256용 32바이트) */
  private readonly encryptionKeyHash: Buffer | undefined;

  /** 기본 체크섬 사용 여부 */
  private readonly defaultChecksum: boolean;

  /** 기본 청크 크기 */
  private readonly defaultChunkSize: number | undefined;

  /** 기본 청크 구분자 */
  private readonly defaultChunkSeparator: string;

  /** 기본 압축 레벨 (1~9) */
  private readonly defaultCompressionLevel: number;

  /** 기본 압축 알고리즘 */
  private readonly defaultCompressionAlgorithm: "deflate" | "brotli";

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
    const requestUrlSafe = dduOptions?.urlSafe ?? false;
    this.urlSafe = requestUrlSafe
      ? this.isUrlSafeCompatible(this.dduChar, this.paddingChar, shouldThrow)
      : false;
    this.encryptionKeyHash = dduOptions?.encryptionKey
      ? deriveKey(dduOptions.encryptionKey)
      : undefined;
    this.defaultChecksum = dduOptions?.checksum ?? false;
    this.defaultChunkSize = dduOptions?.chunkSize;
    this.defaultChunkSeparator = dduOptions?.chunkSeparator ?? "\n";
    this.defaultCompressionAlgorithm = dduOptions?.compressionAlgorithm ?? "deflate";
    this.defaultCompressionLevel = this.normalizeCompressionLevel(
      dduOptions?.compressionLevel,
      this.defaultCompressionAlgorithm
    );
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
    return this.encodeInternal(input, options).encoded;
  }

  /**
   * 인코딩 핵심 로직. encode()와 getStats()가 공유합니다.
   * 압축 크기 등 메타데이터도 함께 반환하여 중복 deflateSync 호출을 방지합니다.
   */
  private encodeInternal(
    input: Buffer | string,
    options?: DduOptions
  ): { encoded: string; compressedSize?: number } {
    const shouldCompress = options?.compress ?? this.defaultCompress;
    const shouldChecksum = options?.checksum ?? this.defaultChecksum;
    const shouldEncrypt = (options?.encrypt ?? true) && !!this.encryptionKeyHash;
    const omitFooter = options?.omitFooter ?? false;
    const chunkSize = options?.chunkSize ?? this.defaultChunkSize;
    const chunkSeparator = options?.chunkSeparator ?? this.defaultChunkSeparator;
    const onProgress = options?.onProgress;
    const useInlineChunking =
      !!chunkSize &&
      chunkSize > 0 &&
      !shouldChecksum &&
      !this.urlSafe;

    let workingBuffer =
      typeof input === "string" ? Buffer.from(input, this.encoding) : input;
    const totalBytes = workingBuffer.length;

    // 진행률 콜백 호출 (시작)
    if (onProgress) {
      onProgress({ processedBytes: 0, totalBytes, percent: ENCODE_PROGRESS.START, stage: "start" });
    }

    // 암호화 처리
    let isEncrypted = false;
    if (shouldEncrypt) {
      workingBuffer = this.encryptData(workingBuffer);
      isEncrypted = true;
      if (onProgress) {
        onProgress({ processedBytes: 0, totalBytes, percent: ENCODE_PROGRESS.ENCRYPT, stage: "encrypt" });
      }
    }

    // 체크섬 계산
    let checksum = "";
    if (shouldChecksum) {
      checksum = calculateCRC32(workingBuffer);
      if (onProgress) {
        onProgress({ processedBytes: 0, totalBytes, percent: ENCODE_PROGRESS.CHECKSUM, stage: "checksum" });
      }
    }

    // 압축 처리
    let compressionMarker = "";
    let compressedSize: number | undefined;
    if (shouldCompress) {
      const compressionAlgorithm =
        options?.compressionAlgorithm ?? this.defaultCompressionAlgorithm;
      const isBrotli = compressionAlgorithm === "brotli";
      const level = this.normalizeCompressionLevel(
        options?.compressionLevel ?? this.defaultCompressionLevel,
        compressionAlgorithm
      );
      const compressedBuffer = isBrotli 
        ? brotliCompressSync(workingBuffer, { params: { [constants.BROTLI_PARAM_QUALITY]: Math.min(11, Math.max(0, level)) } })
        : deflateSync(workingBuffer, { level: Math.min(9, Math.max(0, level)) });
      
      compressedSize = compressedBuffer.length;
      if (compressedBuffer.length < workingBuffer.length) {
        workingBuffer = compressedBuffer;
        compressionMarker = isBrotli ? BROTLI_MARKER : COMPRESS_MARKER;
      }
      if (onProgress) {
        onProgress({ processedBytes: Math.floor(totalBytes * 0.4), totalBytes, percent: ENCODE_PROGRESS.COMPRESS, stage: "compress" });
      }
    }

    // 인코딩 수행
    if (onProgress) {
      onProgress({ processedBytes: Math.floor(totalBytes * 0.5), totalBytes, percent: ENCODE_PROGRESS.ENCODE, stage: "encode" });
    }

    let result = this.effectiveBitLength <= MAX_FAST_BITS
      ? this.encodeFast(
          workingBuffer,
          compressionMarker,
          isEncrypted,
          omitFooter,
          useInlineChunking ? chunkSize : undefined,
          useInlineChunking ? chunkSeparator : undefined
        )
      : this.encodeBigInt(
          workingBuffer,
          compressionMarker,
          isEncrypted,
          omitFooter,
          useInlineChunking ? chunkSize : undefined,
          useInlineChunking ? chunkSeparator : undefined
        );

    // 체크섬 추가
    if (shouldChecksum && checksum) {
      result = result + CHECKSUM_MARKER + checksum;
    }

    // URL-Safe 변환
    if (this.urlSafe) {
      result = toUrlSafeFast(result);
    }

    // 청크 분할
    if (!useInlineChunking && chunkSize && chunkSize > 0) {
      result = splitIntoChunksFast(result, chunkSize, chunkSeparator);
    }

    // 진행률 콜백 호출 (완료)
    if (onProgress) {
      onProgress({ processedBytes: totalBytes, totalBytes, percent: ENCODE_PROGRESS.DONE, stage: "done" });
    }

    return { encoded: result, compressedSize };
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
    const allowInternalDecompress = options?.compress !== false;
    const allowInternalDecrypt = options?.encrypt !== false;
    const chunkSeparator = options?.chunkSeparator ?? this.defaultChunkSeparator;
    const onProgress = options?.onProgress;
    let workingInput = input;

    const inputLength = input.length;

    // 진행률 콜백 호출 (시작)
    if (onProgress) {
      onProgress({ processedBytes: 0, totalBytes: inputLength, percent: DECODE_PROGRESS.START, stage: "start" });
    }

    // 청크 제거 (줄바꿈 등 구분자 제거)
    workingInput = removeChunksFast(workingInput, chunkSeparator);

    // URL-Safe 역변환
    if (this.urlSafe) {
      workingInput = fromUrlSafeFast(workingInput);
    }

    // 체크섬 추출 (체크섬이 활성화된 경우에만 수행하여 오탐지 방지)
    let extractedChecksum: string | null = null;
    if (shouldChecksum) {
      const result = extractChecksum(workingInput);
      extractedChecksum = result.checksum;
      workingInput = result.data;
    }

    const { cleanedInput, paddingBits, compressionAlgorithm, isEncrypted } = this.parseFooter(workingInput);

    if (isEncrypted && allowInternalDecrypt && !this.encryptionKeyHash) {
      throw new Error("[Ddu64 decode] Encrypted payload requires an encryptionKey");
    }

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
      onProgress({ processedBytes: Math.floor(inputLength * 0.2), totalBytes: inputLength, percent: DECODE_PROGRESS.DECODE, stage: "decode" });
    }

    let decoded =
      this.effectiveBitLength <= MAX_FAST_BITS
        ? this.decodeFast(cleanedInput, paddingBits)
        : this.decodeBigInt(cleanedInput, paddingBits);

    // 압축 해제
    if (compressionAlgorithm && allowInternalDecompress) {
      if (onProgress) {
        onProgress({ processedBytes: Math.floor(inputLength * 0.5), totalBytes: inputLength, percent: DECODE_PROGRESS.DECOMPRESS, stage: "decompress" });
      }
      const maxDecompressedBytes = this.normalizeLimit(
        options?.maxDecompressedBytes,
        this.defaultMaxDecompressedBytes,
        true,
        "maxDecompressedBytes"
      );
      // Footer 마커로 감지된 알고리즘 우선, 없으면 옵션 참조
      const isBrotli =
        compressionAlgorithm === "brotli" ||
        options?.compressionAlgorithm === "brotli" ||
        (!options?.compressionAlgorithm && this.defaultCompressionAlgorithm === "brotli");
      if (isBrotli) {
        try {
          const inflated = brotliDecompressSync(decoded, {
            maxOutputLength: maxDecompressedBytes,
          });
          if (inflated.length > maxDecompressedBytes) {
            throw new Error(
              `[Ddu64 decode] Decompressed data exceeds limit. Size: ${inflated.length} bytes, Limit: ${maxDecompressedBytes} bytes`
            );
          }
          decoded = inflated;
        } catch (e: unknown) {
          const err = e as { message?: string; code?: string };
          const msg = String(err?.message ?? "").toLowerCase();
          const code = String(err?.code ?? "");

          if (
            code === "ERR_BUFFER_TOO_LARGE" ||
            msg.includes("cannot create a buffer larger") ||
            msg.includes("buffer larger than") ||
            msg.includes("output length")
          ) {
            throw new Error(
              `[Ddu64 decode] Decompressed data exceeds limit. Limit: ${maxDecompressedBytes} bytes`,
              { cause: e }
            );
          }
          throw e;
        }
      } else {
        decoded = this.inflateWithLimit(decoded, maxDecompressedBytes);
      }
    }

    // 체크섬 검증
    if (extractedChecksum) {
      if (onProgress) {
        onProgress({ processedBytes: Math.floor(inputLength * 0.7), totalBytes: inputLength, percent: DECODE_PROGRESS.CHECKSUM, stage: "checksum" });
      }
      const calculatedChecksum = calculateCRC32(decoded);
      if (calculatedChecksum !== extractedChecksum) {
        throw new Error(
          `[Ddu64 decode] Checksum mismatch. Expected: ${extractedChecksum}, Got: ${calculatedChecksum}`
        );
      }
    }

    // 복호화
    if (isEncrypted && this.encryptionKeyHash && allowInternalDecrypt) {
      if (onProgress) {
        onProgress({ processedBytes: Math.floor(inputLength * 0.85), totalBytes: inputLength, percent: DECODE_PROGRESS.DECRYPT, stage: "decrypt" });
      }
      decoded = this.decryptData(decoded);
    }

    // 진행률 콜백 호출 (완료)
    if (onProgress) {
      onProgress({ processedBytes: inputLength, totalBytes: inputLength, percent: DECODE_PROGRESS.DONE, stage: "done" });
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
   * 공개 스트림 API의 auto-detect 경로에서 사용하는 전용 디코더입니다.
   * 스트림 인코딩은 compress -> encrypt -> encode 순서를 사용하므로,
   * 복원은 decode -> decrypt -> decompress 순서로 수행합니다.
   */
  decodeStreamToBuffer(input: string, options?: DduOptions): Buffer {
    const allowInternalDecompress = options?.compress !== false;
    const allowInternalDecrypt = options?.encrypt !== false;
    const chunkSeparator = options?.chunkSeparator ?? this.defaultChunkSeparator;
    const workingInput = removeChunksFast(input, chunkSeparator);

    const { cleanedInput, paddingBits, compressionAlgorithm, isEncrypted } = this.parseFooter(workingInput);

    if (isEncrypted && allowInternalDecrypt && !this.encryptionKeyHash) {
      throw new Error("[Ddu64 decode] Encrypted payload requires an encryptionKey");
    }

    this.assertEncodedInputAligned(cleanedInput);

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

    let decoded =
      this.effectiveBitLength <= MAX_FAST_BITS
        ? this.decodeFast(cleanedInput, paddingBits)
        : this.decodeBigInt(cleanedInput, paddingBits);

    if (isEncrypted && this.encryptionKeyHash && allowInternalDecrypt) {
      decoded = this.decryptStreamData(decoded);
    }

    if (compressionAlgorithm && allowInternalDecompress) {
      const maxDecompressedBytes = this.normalizeLimit(
        options?.maxDecompressedBytes,
        this.defaultMaxDecompressedBytes,
        true,
        "maxDecompressedBytes"
      );
      if (compressionAlgorithm === "brotli") {
        try {
          const inflated = brotliDecompressSync(decoded, {
            maxOutputLength: maxDecompressedBytes,
          });
          if (inflated.length > maxDecompressedBytes) {
            throw new Error(
              `[Ddu64 decode] Decompressed data exceeds limit. Size: ${inflated.length} bytes, Limit: ${maxDecompressedBytes} bytes`
            );
          }
          decoded = inflated;
        } catch (e: unknown) {
          const err = e as { message?: string; code?: string };
          const msg = String(err?.message ?? "").toLowerCase();
          const code = String(err?.code ?? "");

          if (
            code === "ERR_BUFFER_TOO_LARGE" ||
            msg.includes("cannot create a buffer larger") ||
            msg.includes("buffer larger than") ||
            msg.includes("output length")
          ) {
            throw new Error(
              `[Ddu64 decode] Decompressed data exceeds limit. Limit: ${maxDecompressedBytes} bytes`,
              { cause: e }
            );
          }
          throw e;
        }
      } else {
        decoded = this.inflateWithLimit(decoded, maxDecompressedBytes);
      }
    }

    return decoded;
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
      hasEncryptionKey: !!this.encryptionKeyHash,
      defaultChecksum: this.defaultChecksum,
      defaultChunkSize: this.defaultChunkSize,
      defaultChunkSeparator: this.defaultChunkSeparator,
      defaultCompressionLevel: this.defaultCompressionLevel,
      defaultCompressionAlgorithm: this.defaultCompressionAlgorithm,
    };
  }

  /**
   * 외부 스트림 파이프라인에서 전처리된 Buffer를 그대로 인코딩합니다.
   * 압축/암호화는 수행하지 않고, 마지막 푸터에만 메타데이터를 반영합니다.
   */
  encodeRawBuffer(
    input: Buffer,
    options?: {
      compressionAlgorithm?: "deflate" | "brotli";
      encrypted?: boolean;
      omitFooter?: boolean;
    }
  ): string {
    const compressionMarker =
      options?.compressionAlgorithm === "brotli"
        ? BROTLI_MARKER
        : options?.compressionAlgorithm === "deflate"
          ? COMPRESS_MARKER
          : "";

    return this.effectiveBitLength <= MAX_FAST_BITS
      ? this.encodeFast(input, compressionMarker, options?.encrypted, options?.omitFooter)
      : this.encodeBigInt(input, compressionMarker, options?.encrypted, options?.omitFooter);
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

    // encodeInternal을 통해 인코딩과 압축 크기를 한 번에 얻어 중복 deflateSync 방지
    const { encoded, compressedSize } = this.encodeInternal(input, options);
    const encodedSize = encoded.length;
    const expansionRatio = originalSize > 0 ? encodedSize / originalSize : 0;

    const compressionRatio =
      shouldCompress && compressedSize !== undefined && originalSize > 0
        ? compressedSize / originalSize
        : undefined;

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
   * 가능한 경우 청크 단위로 Event Loop를 양보(Yield)하여 스타베이션을 줄입니다.
   * 다만 압축, 체크섬, 암호화, URL-safe가 개입되는 큰 입력은 정확성을 위해
   * 안전한 단일 페이로드 경로로 fallback 됩니다.
   *
   * @param input - 인코딩할 데이터
   * @param options - 인코딩 옵션
   * @returns 인코딩된 문자열 Promise
   */
  async encodeAsync(input: Buffer | string, options?: DduOptions): Promise<string> {
    const workingBuffer = typeof input === "string" ? Buffer.from(input, this.encoding) : input;
    const CHUNK_SIZE = 64 * 1024; // 64KB
    const shouldCompress = options?.compress ?? this.defaultCompress;
    const shouldChecksum = options?.checksum ?? this.defaultChecksum;
    const shouldEncrypt = (options?.encrypt ?? true) && !!this.encryptionKeyHash;
    
    // 크기가 충분히 작으면 즉시 setImmediate 동기 처리로 오버헤드 최소화
    if (workingBuffer.length <= CHUNK_SIZE) {
      return new Promise<string>((resolve, reject) => {
        setImmediate(() => {
          try {
            resolve(this.encode(workingBuffer, options));
          } catch (e) {
            reject(e);
          }
        });
      });
    }

    // footer/암호화/압축/체크섬이 개입되면 전체 페이로드 단위 처리가 더 안전합니다.
    if (shouldCompress || shouldChecksum || shouldEncrypt || this.urlSafe) {
      return new Promise<string>((resolve, reject) => {
        setImmediate(() => {
          try {
            resolve(this.encode(workingBuffer, options));
          } catch (e) {
            reject(e);
          }
        });
      });
    }

    // 대용량의 경우 Stream으로 쪼개서 이벤트 루프를 양보하며 쓰기
    const { createEncodeStream } = await import("../utils/DduStream");
    return new Promise((resolve, reject) => {
      const stream = createEncodeStream(this, options);
      const chunks: string[] = [];
      stream.on("data", (chunk: Buffer | string) => chunks.push(chunk.toString()));
      stream.on("end", () => resolve(chunks.join("")));
      stream.on("error", reject);

      let offset = 0;
      function pump() {
        try {
          while (offset < workingBuffer.length) {
            const end = Math.min(offset + CHUNK_SIZE, workingBuffer.length);
            const slice = workingBuffer.subarray(offset, end);
            offset = end;
            const canContinue = stream.write(slice);
            if (!canContinue) {
              stream.once("drain", pump);
              return;
            }
            // 1MB 단위로 이벤트 루프 양보
            if (offset % (CHUNK_SIZE * 16) === 0) {
              setImmediate(pump);
              return;
            }
          }
          stream.end();
        } catch (e) {
          (stream as any).destroy(e as Error);
        }
      }
      pump();
    });
  }

  /**
   * 비동기 디코딩을 수행합니다.
   *
   * 대용량 데이터를 처리할 때 Event Loop를 양보하여 블로킹을 방지합니다.
   *
   * @param input - 디코딩할 인코딩된 문자열
   * @param options - 디코딩 옵션
   * @returns 디코딩된 문자열 Promise
   */
  async decodeAsync(input: string, options?: DduOptions): Promise<string> {
    const buffer = await this.decodeToBufferAsync(input, options);
    return buffer.toString(this.encoding);
  }

  /**
   * 비동기 디코딩을 Buffer로 수행합니다.
   *
   * @param input - 디코딩할 인코딩된 문자열
   * @param options - 디코딩 옵션
   * @returns 디코딩된 Buffer Promise
   *
   * @description
   * 큰 입력 중에서도 압축, 암호화, 체크섬, 청크 구분자 해석이 필요한 경우에는
   * 안전성을 위해 내부적으로 전체 페이로드 단위 디코딩으로 fallback 될 수 있습니다.
   */
  async decodeToBufferAsync(input: string, options?: DduOptions): Promise<Buffer> {
    const CHUNK_SIZE = this.charLength * 1024 * 64; // ~64KB
    const shouldChecksum = options?.checksum ?? this.defaultChecksum;
    const needsSafeFallback =
      shouldChecksum ||
      this.urlSafe ||
      !!this.defaultChunkSize ||
      !!options?.chunkSize;

    if (input.length <= CHUNK_SIZE) {
      return new Promise<Buffer>((resolve, reject) => {
        setImmediate(() => {
          try {
            resolve(this.decodeToBuffer(input, options));
          } catch (e) {
            reject(e);
          }
        });
      });
    }

    const asyncFooterState = needsSafeFallback ? null : this.parseFooter(input);
    const shouldCompress =
      (options?.compress ?? this.defaultCompress) ||
      !!asyncFooterState?.compressionAlgorithm;
    const shouldEncrypt =
      ((options?.encrypt ?? true) && !!this.encryptionKeyHash) ||
      !!asyncFooterState?.isEncrypted;

    if (needsSafeFallback || shouldCompress || shouldEncrypt) {
      return new Promise<Buffer>((resolve, reject) => {
        setImmediate(() => {
          try {
            resolve(this.decodeToBuffer(input, options));
          } catch (e) {
            reject(e);
          }
        });
      });
    }

    const { createDecodeStream } = await import("../utils/DduStream");
    return new Promise((resolve, reject) => {
      const stream = createDecodeStream(this, options);
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);

      let offset = 0;
      function pump() {
        try {
          while (offset < input.length) {
            const end = Math.min(offset + CHUNK_SIZE, input.length);
            const slice = input.slice(offset, end);
            offset = end;
            const canContinue = stream.write(slice);
            if (!canContinue) {
              stream.once("drain", pump);
              return;
            }
            if (offset % (CHUNK_SIZE * 16) === 0) {
              setImmediate(pump);
              return;
            }
          }
          stream.end();
        } catch (e) {
          (stream as any).destroy(e as Error);
        }
      }
      pump();
    });
  }

  // --------------------------------------------------------------------------
  // 공백 (리팩토링으로 제거됨)
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  // 암호화 메서드
  // --------------------------------------------------------------------------

  /**
   * 데이터를 AES-256-GCM으로 암호화합니다.
   */
  private encryptData(data: Buffer): Buffer {
    if (!this.encryptionKeyHash) {
      throw new Error("[Ddu64 encrypt] Encryption key is not set");
    }
    return encryptAes256Gcm(data, this.encryptionKeyHash);
  }

  /**
   * AES-256-GCM으로 암호화된 데이터를 복호화합니다.
   */
  private decryptData(data: Buffer): Buffer {
    if (!this.encryptionKeyHash) {
      throw new Error("[Ddu64 decrypt] Encryption key is not set");
    }
    return decryptAes256Gcm(data, this.encryptionKeyHash);
  }

  /**
   * 공개 스트림 API의 암호화 포맷(iv + encrypted + authTag)을 복호화합니다.
   */
  private decryptStreamData(data: Buffer): Buffer {
    if (!this.encryptionKeyHash) {
      throw new Error("[Ddu64 decrypt] Encryption key is not set");
    }
    if (data.length < 28) {
      throw new Error("[Ddu64 decrypt] Invalid encrypted stream data: too short");
    }

    const iv = data.subarray(0, 12);
    const authTag = data.subarray(data.length - 16);
    const encrypted = data.subarray(12, data.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKeyHash, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  /**
   * 공개 스트림 API에서 사용할 암호화 Transform을 생성합니다.
   */
  createEncryptionStream(): GcmEncryptStream | undefined {
    if (!this.encryptionKeyHash) {
      return undefined;
    }
    return new GcmEncryptStream(this.encryptionKeyHash);
  }

  /**
   * 공개 스트림 API에서 사용할 복호화 Transform을 생성합니다.
   */
  createDecryptionStream(): GcmDecryptStream | undefined {
    if (!this.encryptionKeyHash) {
      return undefined;
    }
    return new GcmDecryptStream(this.encryptionKeyHash);
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
   * 압축 레벨을 알고리즘별 지원 범위에 맞춰 정규화합니다.
   */
  private normalizeCompressionLevel(
    value: number | undefined,
    algorithm: "deflate" | "brotli"
  ): number {
    const fallback = 6;
    const normalized =
      value === undefined || !Number.isFinite(value)
        ? fallback
        : Math.floor(value);

    return algorithm === "brotli"
      ? Math.min(11, Math.max(0, normalized))
      : Math.min(9, Math.max(0, normalized));
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
    return inflateWithLimitUtil(data, maxBytes, "Ddu64 decode");
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
    compressionAlgorithm?: "deflate" | "brotli";
    isEncrypted: boolean;
  } {
    const inputLen = input.length;
    const pad = this.paddingChar;
    const padLen = pad.length;
    const noFooter = { cleanedInput: input, paddingBits: 0, isEncrypted: false };

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
      let compressionAlgorithm: "deflate" | "brotli" | undefined;

      if (pos >= ENCRYPT_MARKER.length && input.substring(pos - ENCRYPT_MARKER.length, pos) === ENCRYPT_MARKER) {
        isEncrypted = true;
        pos -= ENCRYPT_MARKER.length;
      }

      if (pos >= COMPRESS_MARKER.length && input.substring(pos - COMPRESS_MARKER.length, pos) === COMPRESS_MARKER) {
        compressionAlgorithm = "deflate";
        pos -= COMPRESS_MARKER.length;
      } else if (pos >= BROTLI_MARKER.length && input.substring(pos - BROTLI_MARKER.length, pos) === BROTLI_MARKER) {
        compressionAlgorithm = "brotli";
        pos -= BROTLI_MARKER.length;
      }

      // 3) 마커 앞에서 padding 문자 확인
      const padStart = pos - padLen;
      if (padStart >= 0 && input.substring(padStart, pos) === pad) {
        if (padStart % this.charLength !== 0) {
          continue; // 우연히 데이터 경계에 걸쳐 형성된 경우, 푸터가 아닌 순수 데이터로 취급
        }
        return {
          cleanedInput: input.substring(0, padStart),
          paddingBits,
          compressionAlgorithm,
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
  private encodeFast(
    bufferInput: Buffer,
    compressionMarker: string,
    encrypt?: boolean,
    omitFooter: boolean = false,
    chunkSize?: number,
    chunkSeparator?: string
  ): string {
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
      if (omitFooter) {
        throw new Error("[Ddu64 encode] Cannot omit footer when padding bits remain");
      }
      resultParts[resultIdx++] = paddingChar;
      resultParts[resultIdx++] = compressionMarker + (encrypt ? ENCRYPT_MARKER : "") + paddingBits.toString();
    } else if (!omitFooter && (compressionMarker || encrypt)) {
      resultParts[resultIdx++] = paddingChar;
      resultParts[resultIdx++] = compressionMarker + (encrypt ? ENCRYPT_MARKER : "") + "0";
    }

    return this.serializeEncodedParts(resultParts, resultIdx, chunkSize, chunkSeparator);
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
    } else if (this.useAsciiLookup && this.fastAsciiLookup && charLength === 1) {
      // 가변 길이 charset - ASCII 최적화 경로
      const asciiLookup = this.fastAsciiLookup;
      const maxVal = this.maxBinaryValue;
      for (let i = 0; i < inputLen; i += chunkSize) {
        const code1 = cleanedInput.charCodeAt(i);
        const code2 = cleanedInput.charCodeAt(i + 1);
        const v1 = code1 < 128 ? asciiLookup[code1] : -1;
        const v2 = code2 < 128 ? asciiLookup[code2] : -1;

        if (v1 < 0) {
          throw new Error(`[Ddu64 decode] Invalid character "${cleanedInput[i]}" at ${i}`);
        }
        if (v2 < 0) {
          throw new Error(
            `[Ddu64 decode] Invalid character "${cleanedInput[i + 1]}" at ${i + charLength}`
          );
        }

        const value = v1 * dduLength + v2;
        if (value >= maxVal) {
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
    } else {
      // 가변 길이 charset - 일반 룩업 경로
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
  private encodeBigInt(
    bufferInput: Buffer,
    compressionMarker: string,
    encrypt?: boolean,
    omitFooter: boolean = false,
    chunkSize?: number,
    chunkSeparator?: string
  ): string {
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
      if (omitFooter) {
        throw new Error("[Ddu64 encode] Cannot omit footer when padding bits remain");
      }
      resultParts[resultIdx++] = this.paddingChar;
      resultParts[resultIdx++] = compressionMarker + (encrypt ? ENCRYPT_MARKER : "") + paddingBits.toString();
    } else if (!omitFooter && (compressionMarker || encrypt)) {
      resultParts[resultIdx++] = this.paddingChar;
      resultParts[resultIdx++] = compressionMarker + (encrypt ? ENCRYPT_MARKER : "") + "0";
    }

    return this.serializeEncodedParts(resultParts, resultIdx, chunkSize, chunkSeparator);
  }

  /**
   * 인코딩 파트 배열을 최종 문자열로 직렬화합니다.
   * 청크 옵션이 있으면 join 후 split하는 대신 한 번에 separator를 삽입합니다.
   */
  private serializeEncodedParts(
    parts: string[],
    partCount: number,
    chunkSize?: number,
    chunkSeparator?: string
  ): string {
    parts.length = partCount;

    if (!chunkSize || chunkSize <= 0) {
      return parts.join("");
    }

    const separator = chunkSeparator ?? this.defaultChunkSeparator;
    const outputParts: string[] = [];
    let currentChunkLength = 0;

    for (let i = 0; i < partCount; i++) {
      const part = parts[i];
      let offset = 0;

      while (offset < part.length) {
        const remaining = chunkSize - currentChunkLength;
        const sliceLength = Math.min(remaining, part.length - offset);
        outputParts.push(part.slice(offset, offset + sliceLength));
        offset += sliceLength;
        currentChunkLength += sliceLength;

        if (currentChunkLength === chunkSize && (offset < part.length || i < partCount - 1)) {
          outputParts.push(separator);
          currentChunkLength = 0;
        }
      }
    }

    return outputParts.join("");
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
    // 1차 시도: 주어진 charset으로 정규화
    // 실패 시 1회만 fallback 시도 (동일 fallback을 반복해도 결과는 동일)
    const attempts = [current, null] as const;

    for (const attempt of attempts) {
      const state = attempt ? { ...attempt } : this.getFallbackCharSet(dduOptions);

      try {
        // 중복 문자 제거
        let charSet = state.charSet;
        let requiredLength = state.requiredLength;
        const uniqueChars = Array.from(new Set(charSet));
        if (uniqueChars.length !== charSet.length) {
          if (shouldThrow) {
            const duplicates = charSet.filter(
              (c, i) => charSet.indexOf(c) !== i
            );
            throw new Error(
              `[Ddu64 normalizeCharSet] Character set contains duplicate characters: [${[...new Set(duplicates)].join(", ")}]`
            );
          }
          charSet = uniqueChars;
          if (!state.isPredefined) requiredLength = charSet.length;
        }

        // 문자 수 검증
        if (charSet.length < requiredLength) {
          throw new Error(
            `[Ddu64 normalizeCharSet] Insufficient characters. Required: ${requiredLength}, Has: ${charSet.length}`
          );
        }
        if (requiredLength < 2) {
          throw new Error(
            `[Ddu64 normalizeCharSet] At least 2 unique characters required.`
          );
        }
        if (charSet.length === 0) {
          throw new Error(`[Ddu64 normalizeCharSet] Empty charset.`);
        }

        // 문자 길이 일관성 검증
        const charLength = charSet[0].length;
        const invalidChar = charSet.find((c) => c.length !== charLength);
        if (invalidChar) {
          if (shouldThrow) {
            throw new Error(
              `[Ddu64 normalizeCharSet] Inconsistent char length. Expected ${charLength}, found "${invalidChar}" (${invalidChar.length})`
            );
          }
          continue; // fallback으로 재시도
        }

        // 패딩 검증
        if (state.padding.length !== charLength) {
          throw new Error(
            `[Ddu64 normalizeCharSet] Padding length mismatch. Expected ${charLength}, got ${state.padding.length}`
          );
        }
        if (charSet.includes(state.padding)) {
          if (shouldThrow) {
            throw new Error(
              `[Ddu64 normalizeCharSet] Padding character "${state.padding}" conflicts with charset.`
            );
          }
          charSet = charSet.filter((c) => c !== state.padding);
        }

        for (const c of charSet) {
          if (c.includes("\n") || c.includes("\r")) {
            throw new Error(
              `[Ddu64 normalizeCharSet] Newline and carriage return characters are reserved for chunk normalization and cannot be used in charset.`
            );
          }
        }
        if (state.padding.includes("\n") || state.padding.includes("\r")) {
          throw new Error(
            `[Ddu64 normalizeCharSet] Newline and carriage return characters are reserved for chunk normalization and cannot be used in padding.`
          );
        }

        // 불필요한 배열 복사 방지
        const finalSet =
          charSet.length === requiredLength
            ? charSet
            : charSet.slice(0, requiredLength);

        return {
          charSet: finalSet,
          padding: state.padding,
          charLength,
          isPredefined: state.isPredefined,
        };
      } catch (e: unknown) {
        if (shouldThrow) throw e;
        // fallback 시도로 continue
      }
    }

    // 최종 fallback (이론상 도달 불가, 방어 코드)
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
   *
   * @returns URL-Safe 모드를 활성화해도 안전한 경우 true
   */
  private isUrlSafeCompatible(
    charSet: string[],
    paddingChar: string,
    shouldThrow: boolean
  ): boolean {
    const conflictChars = Object.keys(URL_SAFE_REVERSE_MAP); // ["-", "_", "."]

    for (const ch of conflictChars) {
      for (const c of charSet) {
        if (c.includes(ch)) {
          const msg = `[Ddu64 Constructor] URL-Safe mode conflict: charset character "${c}" contains "${ch}" which would be transformed to "${URL_SAFE_REVERSE_MAP[ch]}" during decoding.`;
          if (shouldThrow) throw new Error(msg);
          return false;
        }
      }
      if (paddingChar.includes(ch)) {
        const msg = `[Ddu64 Constructor] URL-Safe mode conflict: padding character "${paddingChar}" contains "${ch}" which would be transformed to "${URL_SAFE_REVERSE_MAP[ch]}" during decoding.`;
        if (shouldThrow) throw new Error(msg);
        return false;
      }
    }
    return true;
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
