/**
 * 플랫폼 독립 Ddu64 인코더/디코더 코어.
 * PlatformAdapter 인터페이스를 통해 암호화 및 압축 연산을 수행하는 전체 인코딩/디코딩 파이프라인을 제공합니다.
 *
 * @module core/Ddu64Core
 */

import {
  bitPackEncode,
  bitPackDecode,
  createBitPackConfig,
  type BitPackConfig,
} from "./BitPack.js";
import { parseFooter, buildFooter, extractChecksum } from "./wireFormat.js";
import {
  calculateCRC32,
  toUrlSafe,
  fromUrlSafe,
  splitIntoChunks,
  removeChunks,
  normalizeCompressionLevel,
  stringToBytes,
  bytesToString,
} from "./codecUtils.js";
import {
  resolveInitialCharSet,
  normalizeCharSet,
  isUrlSafeCompatible,
  validateCombinationDuplicates,
} from "./CharsetResolver.js";
import type {
  PlatformAdapter,
  DduConstructorOptions,
  DduOptions,
  DduEncodeStats,
  CharSetInfo,
  ObfuscationLayer,
  DduProgressInfo,
  KeyDerivationOptions,
} from "./types.js";
import { setWorkerPoolSize } from "../workers/WorkerPool.js";
import { HangulObfuscationLayer } from "../obfuscation/ObfuscationLayer.js";
import {
  getWasmCodecSync,
  validateWasmThreshold,
  DEFAULT_WASM_THRESHOLD,
} from "../wasm/WasmCodec.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const BYTE_BITS = 8;
const DEFAULT_MAX_DECODED_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;
const STANDARD_BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_PADDING = "=";
const BASE64_INDEX_LOOKUP: Record<string, number> = Object.fromEntries(
  [...STANDARD_BASE64_ALPHABET].map((ch, index) => [ch, index]),
);

// ─── Ddu64Core 클래스 ──────────────────────────────────────────────────────────

/**
 * 플랫폼 독립 Ddu64 인코더/디코더.
 *
 * 모든 암호화 및 압축 연산에 PlatformAdapter를 사용합니다.
 */
export class Ddu64Core {
  // ─── 멤버 변수 ──────────────────────────────────────────────────────────

  /** 인코딩에 사용되는 문자 */
  protected readonly dduChar: string[];

  /** 패딩 문자 */
  protected readonly paddingChar: string;

  /** 비트 길이 (2의 제곱수 charset의 경우 charset 크기의 log2) */
  protected readonly bitLength: number;

  /** charset 크기가 2의 제곱수인지 여부 */
  protected readonly usePowerOfTwo: boolean;

  /** 인코딩에 사용되는 유효 비트 길이 */
  private readonly effectiveBitLength: number;

  /** 문자 → 인덱스 역방향 룩업 맵 */
  protected readonly dduBinaryLookup: Map<string, number> = new Map();

  /** 미리 정의된 charset 사용 여부 */
  private readonly isPredefinedCharSet: boolean;

  /** 기본 압축 활성화 */
  protected readonly defaultCompress: boolean;

  /** 기본 최대 디코딩 바이트 수 */
  private readonly defaultMaxDecodedBytes: number;

  /** 기본 최대 압축해제 바이트 수 */
  private readonly defaultMaxDecompressedBytes: number;

  /** URL-Safe 모드 */
  private readonly urlSafe: boolean;

  /** 암호화 키 (원시 문자열, 해시 파생용) */
  private readonly encryptionKey: string | undefined;

  /** 암호화 키 파생 옵션 */
  private readonly keyDerivation: KeyDerivationOptions | undefined;

  /** 캐시된 암호화 키 해시 */
  private encryptionKeyHash: Uint8Array | undefined;

  /** 기본 체크섬 활성화 */
  private readonly defaultChecksum: boolean;

  /** 기본 청크 크기 */
  private readonly defaultChunkSize: number | undefined;

  /** 기본 청크 구분자 */
  private readonly defaultChunkSeparator: string;

  /** 기본 압축 레벨 */
  private readonly defaultCompressionLevel: number;

  /** 기본 압축 알고리즘 */
  private readonly defaultCompressionAlgorithm: "deflate" | "brotli";

  /** 반복 패딩 모드 사용 여부 */
  private readonly useRepeatPadding: boolean;

  /** BitPack 설정 */
  private readonly bitPackConfig: BitPackConfig;

  /** WASM 사용 임계값 */
  private readonly wasmThreshold: number;

  /** 네이티브 Base64 fast path 사용 여부 */
  private readonly canUseNativeBase64: boolean;

  /** 현재 charset 문자 → 네이티브 Base64 문자 매핑 */
  private readonly nativeDecodeMap: Map<string, string> | undefined;

  /** 플랫폼 어댑터 (동기용 지연 로드 또는 명시적 제공) */
  private adapter: PlatformAdapter | undefined;

  /** 기본 난독화 활성화 */
  private readonly defaultObfuscate: boolean;

  /** 지연 초기화되는 난독화 레이어 */
  private _obfuscationLayer: ObfuscationLayer | undefined;

  // ─── 생성자 ─────────────────────────────────────────────────────────────────

  constructor(
    dduChar?: string[] | string,
    paddingChar?: string,
    dduOptions?: DduConstructorOptions,
  ) {
    const shouldThrow = dduOptions?.throwOnError ?? dduOptions?.useBuildErrorReturn ?? false;

    // 어댑터 해석
    if (dduOptions?.adapter) {
      this.adapter = dduOptions.adapter;
    } else {
      this.adapter = undefined;
    }

    // Charset 초기화
    const initial = resolveInitialCharSet(dduChar, paddingChar, dduOptions, shouldThrow);
    const normalized = normalizeCharSet(initial, shouldThrow, dduOptions);

    this.dduChar = normalized.charSet;
    this.paddingChar = normalized.padding;
    this.isPredefinedCharSet = normalized.isPredefined;
    this.defaultCompress = dduOptions?.compress ?? false;

    // 제한값
    this.defaultMaxDecodedBytes = this.normalizeLimit(
      dduOptions?.maxDecodedBytes,
      DEFAULT_MAX_DECODED_BYTES,
      shouldThrow,
      "maxDecodedBytes",
    );
    this.defaultMaxDecompressedBytes = this.normalizeLimit(
      dduOptions?.maxDecompressedBytes,
      DEFAULT_MAX_DECOMPRESSED_BYTES,
      shouldThrow,
      "maxDecompressedBytes",
    );

    // 비트 길이 계산
    const dduLength = this.dduChar.length;
    this.usePowerOfTwo = dduLength > 0 && (dduLength & (dduLength - 1)) === 0;

    const computedBitLength = Math.ceil(Math.log2(dduLength));
    this.bitLength = this.usePowerOfTwo ? Math.floor(Math.log2(dduLength)) : computedBitLength;
    this.effectiveBitLength = this.usePowerOfTwo ? this.bitLength : computedBitLength;

    // 역방향 룩업 맵
    for (let i = 0; i < dduLength; i++) {
      this.dduBinaryLookup.set(this.dduChar[i], i);
    }

    // 커스텀 charset 조합 검증
    if (!this.isPredefinedCharSet) {
      validateCombinationDuplicates(this.dduChar, this.paddingChar, dduLength);
    }

    // URL-Safe 모드
    const requestUrlSafe = dduOptions?.urlSafe ?? false;
    this.urlSafe = requestUrlSafe
      ? isUrlSafeCompatible(this.dduChar, this.paddingChar, shouldThrow)
      : false;

    // 암호화 키 (원시 저장, 해시는 지연 또는 동기 파생)
    this.encryptionKey = dduOptions?.encryptionKey;
    this.keyDerivation = dduOptions?.keyDerivation;
    if (this.encryptionKey && this.adapter?.deriveKeySync) {
      this.encryptionKeyHash = this.adapter.deriveKeySync(this.encryptionKey, this.keyDerivation);
    }

    // 옵션
    this.defaultChecksum = dduOptions?.checksum ?? false;
    this.defaultChunkSize = dduOptions?.chunkSize;
    this.defaultChunkSeparator = dduOptions?.chunkSeparator ?? "\n";
    this.defaultCompressionAlgorithm = dduOptions?.compressionAlgorithm ?? "deflate";
    this.defaultCompressionLevel = normalizeCompressionLevel(
      dduOptions?.compressionLevel,
      this.defaultCompressionAlgorithm,
    );
    this.useRepeatPadding = dduOptions?.useRepeatPadding ?? initial.useRepeatPadding ?? false;

    // 난독화
    this.defaultObfuscate = dduOptions?.obfuscate ?? false;
    if (this.defaultObfuscate && !this.encryptionKey) {
      throw new Error("[Ddu64 obfuscation] Obfuscation requires encryption to be enabled.");
    }

    // BitPack 설정
    this.bitPackConfig = createBitPackConfig(dduLength);
    this.wasmThreshold = validateWasmThreshold(dduOptions?.wasmThreshold ?? DEFAULT_WASM_THRESHOLD);
    this.canUseNativeBase64 = this.usePowerOfTwo && this.dduChar.length === 64;
    if (this.canUseNativeBase64) {
      this.nativeDecodeMap = new Map();
      for (let i = 0; i < STANDARD_BASE64_ALPHABET.length; i++) {
        const encodedChar = this.dduChar[i];
        this.nativeDecodeMap.set(encodedChar, STANDARD_BASE64_ALPHABET[i]);
      }
    }
  }

  // ─── 공개 메서드 ─────────────────────────────────────────────────────────

  /**
   * 입력 데이터를 charset 인코딩 문자열로 인코딩합니다.
   *
   * @param input - 인코딩할 String 또는 Uint8Array
   * @param options - 인코딩 옵션
   * @returns 인코딩된 문자열
   * @throws 동기 암호화/압축이 필요하지만 어댑터가 지원하지 않는 경우
   */
  encode(input: Uint8Array | string, options?: DduOptions): string {
    return this.encodeInternal(input, options).encoded;
  }

  /**
   * 인코딩된 문자열을 UTF-8 문자열로 디코딩합니다.
   *
   * @param input - 디코딩할 인코딩된 문자열
   * @param options - 디코딩 옵션
   * @returns 디코딩된 문자열
   */
  decode(input: string, options?: DduOptions): string {
    const bytes = this.decodeToUint8Array(input, options);
    return bytesToString(bytes);
  }

  /**
   * 인코딩된 문자열을 Uint8Array로 디코딩합니다.
   *
   * @param input - 디코딩할 인코딩된 문자열
   * @param options - 디코딩 옵션
   * @returns 디코딩된 바이트
   */
  decodeToUint8Array(input: string, options?: DduOptions): Uint8Array {
    const shouldChecksum = options?.checksum ?? this.defaultChecksum;
    const allowInternalDecompress = options?.compress !== false;
    const allowInternalDecrypt = options?.encrypt !== false;
    let workingInput = input;
    this.reportProgress(options, {
      processedBytes: 0,
      totalBytes: input.length,
      percent: 0,
      stage: "start",
    });

    // 청크 제거
    const chunkSeparator = options?.chunkSeparator ?? this.defaultChunkSeparator;
    workingInput = removeChunks(workingInput, chunkSeparator);

    // URL-Safe 역변환
    if (this.urlSafe) {
      workingInput = fromUrlSafe(workingInput);
    }

    // 체크섬 추출
    let extractedChecksum: string | null = null;
    if (shouldChecksum) {
      const result = extractChecksum(workingInput);
      extractedChecksum = result.checksum;
      workingInput = result.data;
    }

    // 역난독화 (청크/URL-safe/체크섬 제거 후, 푸터 파싱 전)
    if (this.shouldObfuscate(options)) {
      workingInput = this.getObfuscationLayer().deobfuscate(workingInput);
    }

    // 푸터 파싱
    const { cleanedInput, paddingBits, compressionAlgorithm, isEncrypted, pipelineVersion } =
      parseFooter(workingInput, this.paddingChar, this.effectiveBitLength);

    if (isEncrypted && allowInternalDecrypt && !this.encryptionKey) {
      throw new Error("[Ddu64 decode] Encrypted payload requires an encryptionKey");
    }

    // 정렬 확인
    this.assertEncodedInputAligned(cleanedInput);

    // 크기 확인
    const maxDecodedBytes = this.normalizeLimit(
      options?.maxDecodedBytes,
      this.defaultMaxDecodedBytes,
      true,
      "maxDecodedBytes",
    );
    const estimatedDecodedBytes = this.estimateDecodedBytes(cleanedInput.length, paddingBits);
    if (estimatedDecodedBytes > maxDecodedBytes) {
      throw new Error(
        `[Ddu64 decode] Decoded output exceeds limit. Estimated: ${estimatedDecodedBytes} bytes, Limit: ${maxDecodedBytes} bytes`,
      );
    }

    // BitPack으로 디코딩
    this.reportProgress(options, {
      processedBytes: cleanedInput.length,
      totalBytes: input.length,
      percent: 30,
      stage: "decode",
    });
    let decoded = this.decodeChars(cleanedInput, paddingBits);

    if (pipelineVersion === 3 && isEncrypted && this.encryptionKey && allowInternalDecrypt) {
      this.reportProgress(options, {
        processedBytes: decoded.length,
        totalBytes: decoded.length,
        percent: 55,
        stage: "decrypt",
      });
      decoded = this.decryptSync(decoded);
    }

    // 압축 해제
    if (
      compressionAlgorithm &&
      allowInternalDecompress &&
      (pipelineVersion === 2 || !isEncrypted || allowInternalDecrypt)
    ) {
      const maxDecompressedBytes = this.normalizeLimit(
        options?.maxDecompressedBytes,
        this.defaultMaxDecompressedBytes,
        true,
        "maxDecompressedBytes",
      );
      this.reportProgress(options, {
        processedBytes: decoded.length,
        totalBytes: decoded.length,
        percent: 70,
        stage: "decompress",
      });
      decoded = this.decompressSync(decoded, compressionAlgorithm, maxDecompressedBytes);
    }

    // 체크섬 검증
    if (extractedChecksum && (pipelineVersion === 2 || !isEncrypted || allowInternalDecrypt)) {
      this.reportProgress(options, {
        processedBytes: decoded.length,
        totalBytes: decoded.length,
        percent: 85,
        stage: "checksum",
      });
      const calculatedChecksum = calculateCRC32(decoded);
      if (calculatedChecksum !== extractedChecksum) {
        throw new Error(
          `[Ddu64 decode] Checksum mismatch. Expected: ${extractedChecksum}, Got: ${calculatedChecksum}`,
        );
      }
    }

    // 복호화
    if (pipelineVersion === 2 && isEncrypted && this.encryptionKey && allowInternalDecrypt) {
      this.reportProgress(options, {
        processedBytes: decoded.length,
        totalBytes: decoded.length,
        percent: 90,
        stage: "decrypt",
      });
      decoded = this.decryptSync(decoded);
    }

    this.reportProgress(options, {
      processedBytes: decoded.length,
      totalBytes: decoded.length,
      percent: 100,
      stage: "done",
    });
    return decoded;
  }

  /**
   * 비동기 인코딩 - 브라우저를 포함한 모든 런타임에서 동작합니다.
   */
  async encodeAsync(input: Uint8Array | string, options?: DduOptions): Promise<string> {
    const adapter = await this.getAdapterAsync();
    const shouldCompress = options?.compress ?? this.defaultCompress;
    const shouldChecksum = options?.checksum ?? this.defaultChecksum;
    const shouldEncrypt = (options?.encrypt ?? true) && !!this.encryptionKey;
    const chunkSize = options?.chunkSize ?? this.defaultChunkSize;
    const chunkSeparator = options?.chunkSeparator ?? this.defaultChunkSeparator;

    let workingData = typeof input === "string" ? stringToBytes(input) : input;
    this.reportProgress(options, {
      processedBytes: 0,
      totalBytes: workingData.length,
      percent: 0,
      stage: "start",
    });

    // 체크섬은 복원된 원본 데이터 기준으로 계산합니다.
    let checksum = "";
    if (shouldChecksum) {
      checksum = calculateCRC32(workingData);
    }

    // 압축
    let compressionAlgorithm: "deflate" | "brotli" | undefined;
    if (shouldCompress) {
      const algo = options?.compressionAlgorithm ?? this.defaultCompressionAlgorithm;
      const level = normalizeCompressionLevel(
        options?.compressionLevel ?? this.defaultCompressionLevel,
        algo,
      );
      this.reportProgress(options, {
        processedBytes: workingData.length,
        totalBytes: workingData.length,
        percent: 20,
        stage: "compress",
      });
      let compressed: Uint8Array;
      if (algo === "brotli") {
        if (!adapter.brotliCompress) {
          throw new Error(
            "[Ddu64 compress] Brotli compression is unavailable in the current runtime.",
          );
        }
        compressed = await adapter.brotliCompress(workingData, level);
      } else {
        compressed = await adapter.deflate(workingData, level);
      }
      if (compressed.length < workingData.length) {
        workingData = compressed;
        compressionAlgorithm = algo;
      }
    }

    // 암호화
    let isEncrypted = false;
    if (shouldEncrypt) {
      const keyHash = await this.getKeyHashAsync(adapter);
      this.reportProgress(options, {
        processedBytes: workingData.length,
        totalBytes: workingData.length,
        percent: 45,
        stage: "encrypt",
      });
      workingData = await adapter.encrypt(workingData, keyHash);
      isEncrypted = true;
    }

    // 인코딩 (비트 패킹 단계)
    this.reportProgress(options, {
      processedBytes: workingData.length,
      totalBytes: workingData.length,
      percent: 70,
      stage: "encode",
    });
    let result = this.encodeBytes(workingData, compressionAlgorithm, isEncrypted, options);

    // 후처리 (난독화, 체크섬, URL-safe, 청킹)
    result = this.applyPostEncoding(
      result,
      options,
      checksum,
      shouldChecksum,
      chunkSize,
      chunkSeparator,
    );

    this.reportProgress(options, {
      processedBytes: workingData.length,
      totalBytes: workingData.length,
      percent: 100,
      stage: "done",
    });
    return result;
  }

  /**
   * 비동기 디코딩 - 브라우저를 포함한 모든 런타임에서 동작합니다.
   */
  async decodeAsync(input: string, options?: DduOptions): Promise<string> {
    const bytes = await this.decodeToUint8ArrayAsync(input, options);
    return bytesToString(bytes);
  }

  /**
   * 비동기 Uint8Array 디코딩 - 브라우저를 포함한 모든 런타임에서 동작합니다.
   */
  async decodeToUint8ArrayAsync(input: string, options?: DduOptions): Promise<Uint8Array> {
    const adapter = await this.getAdapterAsync();
    const shouldChecksum = options?.checksum ?? this.defaultChecksum;
    const allowInternalDecompress = options?.compress !== false;
    const allowInternalDecrypt = options?.encrypt !== false;
    let workingInput = input;
    this.reportProgress(options, {
      processedBytes: 0,
      totalBytes: input.length,
      percent: 0,
      stage: "start",
    });

    // 청크 제거
    const chunkSeparator = options?.chunkSeparator ?? this.defaultChunkSeparator;
    workingInput = removeChunks(workingInput, chunkSeparator);

    // URL-Safe 역변환
    if (this.urlSafe) {
      workingInput = fromUrlSafe(workingInput);
    }

    // 체크섬 추출
    let extractedChecksum: string | null = null;
    if (shouldChecksum) {
      const result = extractChecksum(workingInput);
      extractedChecksum = result.checksum;
      workingInput = result.data;
    }

    // 역난독화 (청크/URL-safe/체크섬 제거 후, 푸터 파싱 전)
    if (this.shouldObfuscate(options)) {
      workingInput = this.getObfuscationLayer().deobfuscate(workingInput);
    }

    // 푸터 파싱
    const { cleanedInput, paddingBits, compressionAlgorithm, isEncrypted, pipelineVersion } =
      parseFooter(workingInput, this.paddingChar, this.effectiveBitLength);

    if (isEncrypted && allowInternalDecrypt && !this.encryptionKey) {
      throw new Error("[Ddu64 decode] Encrypted payload requires an encryptionKey");
    }

    // 정렬 확인
    this.assertEncodedInputAligned(cleanedInput);

    // 크기 확인
    const maxDecodedBytes = this.normalizeLimit(
      options?.maxDecodedBytes,
      this.defaultMaxDecodedBytes,
      true,
      "maxDecodedBytes",
    );
    const estimatedDecodedBytes = this.estimateDecodedBytes(cleanedInput.length, paddingBits);
    if (estimatedDecodedBytes > maxDecodedBytes) {
      throw new Error(
        `[Ddu64 decode] Decoded output exceeds limit. Estimated: ${estimatedDecodedBytes} bytes, Limit: ${maxDecodedBytes} bytes`,
      );
    }

    // 디코딩 (비트 패킹 단계)
    this.reportProgress(options, {
      processedBytes: cleanedInput.length,
      totalBytes: input.length,
      percent: 30,
      stage: "decode",
    });
    let decoded = this.decodeChars(cleanedInput, paddingBits);

    if (pipelineVersion === 3 && isEncrypted && this.encryptionKey && allowInternalDecrypt) {
      const keyHash = await this.getKeyHashAsync(adapter);
      this.reportProgress(options, {
        processedBytes: decoded.length,
        totalBytes: decoded.length,
        percent: 55,
        stage: "decrypt",
      });
      decoded = await adapter.decrypt(decoded, keyHash);
    }

    // 압축 해제
    if (
      compressionAlgorithm &&
      allowInternalDecompress &&
      (pipelineVersion === 2 || !isEncrypted || allowInternalDecrypt)
    ) {
      const maxDecompressedBytes = this.normalizeLimit(
        options?.maxDecompressedBytes,
        this.defaultMaxDecompressedBytes,
        true,
        "maxDecompressedBytes",
      );
      if (compressionAlgorithm === "brotli") {
        if (!adapter.brotliDecompress) {
          throw new Error(
            "[Ddu64 decompress] Brotli decompression is unavailable in the current runtime.",
          );
        }
        this.reportProgress(options, {
          processedBytes: decoded.length,
          totalBytes: decoded.length,
          percent: 70,
          stage: "decompress",
        });
        decoded = await adapter.brotliDecompress(decoded, maxDecompressedBytes);
      } else {
        this.reportProgress(options, {
          processedBytes: decoded.length,
          totalBytes: decoded.length,
          percent: 70,
          stage: "decompress",
        });
        decoded = await adapter.inflate(decoded, maxDecompressedBytes);
      }
    }

    // 체크섬 검증
    if (extractedChecksum && (pipelineVersion === 2 || !isEncrypted || allowInternalDecrypt)) {
      this.reportProgress(options, {
        processedBytes: decoded.length,
        totalBytes: decoded.length,
        percent: 85,
        stage: "checksum",
      });
      const calculatedChecksum = calculateCRC32(decoded);
      if (calculatedChecksum !== extractedChecksum) {
        throw new Error(
          `[Ddu64 decode] Checksum mismatch. Expected: ${extractedChecksum}, Got: ${calculatedChecksum}`,
        );
      }
    }

    // 복호화
    if (pipelineVersion === 2 && isEncrypted && this.encryptionKey && allowInternalDecrypt) {
      const keyHash = await this.getKeyHashAsync(adapter);
      this.reportProgress(options, {
        processedBytes: decoded.length,
        totalBytes: decoded.length,
        percent: 90,
        stage: "decrypt",
      });
      decoded = await adapter.decrypt(decoded, keyHash);
    }

    this.reportProgress(options, {
      processedBytes: decoded.length,
      totalBytes: decoded.length,
      percent: 100,
      stage: "done",
    });
    return decoded;
  }

  /**
   * charset 정보를 가져옵니다.
   */
  getCharSetInfo(): CharSetInfo {
    return {
      charSet: [...this.dduChar],
      paddingChar: this.paddingChar,
      bitLength: this.bitLength,
      usePowerOfTwo: this.usePowerOfTwo,
      encoding: "utf-8",
      defaultCompress: this.defaultCompress,
      defaultMaxDecodedBytes: this.defaultMaxDecodedBytes,
      defaultMaxDecompressedBytes: this.defaultMaxDecompressedBytes,
      urlSafe: this.urlSafe,
      hasEncryptionKey: !!this.encryptionKey,
      defaultChecksum: this.defaultChecksum,
      defaultChunkSize: this.defaultChunkSize,
      defaultChunkSeparator: this.defaultChunkSeparator,
      defaultCompressionLevel: this.defaultCompressionLevel,
      defaultCompressionAlgorithm: this.defaultCompressionAlgorithm,
    };
  }

  /**
   * 인코딩 통계를 가져옵니다.
   */
  getStats(input: Uint8Array | string, options?: DduOptions): DduEncodeStats {
    const originalData = typeof input === "string" ? stringToBytes(input) : input;
    const originalSize = originalData.length;
    const { encoded, compressedSize } = this.encodeInternal(input, options);
    const encodedSize = encoded.length;
    const expansionRatio = originalSize > 0 ? encodedSize / originalSize : 0;
    const shouldCompress = options?.compress ?? this.defaultCompress;
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

  // ─── 정적 메서드 ──────────────────────────────────────────────────────────

  /**
   * 대용량 인코딩/디코딩 연산을 오프로드하기 위한 전역 워커 풀 크기를 설정합니다.
   *
   * @param n - 워커 수 (정수, 1–64)
   * @throws n이 정수가 아니거나 [1, 64] 범위를 벗어난 경우 에러
   */
  static setWorkerPoolSize(n: number): void {
    setWorkerPoolSize(n);
  }

  // ─── 내부 인코딩/디코딩 ────────────────────────────────────────────────

  /**
   * 통계를 위한 메타데이터 포함 내부 인코딩.
   */
  private encodeInternal(
    input: Uint8Array | string,
    options?: DduOptions,
  ): { encoded: string; compressedSize?: number } {
    const shouldCompress = options?.compress ?? this.defaultCompress;
    const shouldChecksum = options?.checksum ?? this.defaultChecksum;
    const shouldEncrypt = (options?.encrypt ?? true) && !!this.encryptionKey;
    const chunkSize = options?.chunkSize ?? this.defaultChunkSize;
    const chunkSeparator = options?.chunkSeparator ?? this.defaultChunkSeparator;

    let workingData = typeof input === "string" ? stringToBytes(input) : input;
    this.reportProgress(options, {
      processedBytes: 0,
      totalBytes: workingData.length,
      percent: 0,
      stage: "start",
    });

    // 체크섬은 복원된 원본 데이터 기준으로 계산합니다.
    let checksum = "";
    if (shouldChecksum) {
      checksum = calculateCRC32(workingData);
    }

    // 압축
    let compressionAlgorithm: "deflate" | "brotli" | undefined;
    let compressedSize: number | undefined;
    if (shouldCompress) {
      const algo = options?.compressionAlgorithm ?? this.defaultCompressionAlgorithm;
      const level = normalizeCompressionLevel(
        options?.compressionLevel ?? this.defaultCompressionLevel,
        algo,
      );
      this.reportProgress(options, {
        processedBytes: workingData.length,
        totalBytes: workingData.length,
        percent: 20,
        stage: "compress",
      });
      const compressed = this.compressSync(workingData, algo, level);
      compressedSize = compressed.length;
      if (compressed.length < workingData.length) {
        workingData = compressed;
        compressionAlgorithm = algo;
      }
    }

    // 암호화
    let isEncrypted = false;
    if (shouldEncrypt) {
      this.reportProgress(options, {
        processedBytes: workingData.length,
        totalBytes: workingData.length,
        percent: 45,
        stage: "encrypt",
      });
      workingData = this.encryptSync(workingData);
      isEncrypted = true;
    }

    // 인코딩
    this.reportProgress(options, {
      processedBytes: workingData.length,
      totalBytes: workingData.length,
      percent: 70,
      stage: "encode",
    });
    let result = this.encodeBytes(workingData, compressionAlgorithm, isEncrypted, options);

    // 후처리 (난독화, 체크섬, URL-safe, 청킹)
    result = this.applyPostEncoding(
      result,
      options,
      checksum,
      shouldChecksum,
      chunkSize,
      chunkSeparator,
    );

    this.reportProgress(options, {
      processedBytes: workingData.length,
      totalBytes: workingData.length,
      percent: 100,
      stage: "done",
    });
    return { encoded: result, compressedSize };
  }

  /**
   * 인코딩 후처리: 난독화, 체크섬, URL-safe, 청킹을 적용합니다.
   */
  private applyPostEncoding(
    encoded: string,
    options: DduOptions | undefined,
    checksum: string,
    shouldChecksum: boolean,
    chunkSize: number | undefined,
    chunkSeparator: string,
  ): string {
    let result = encoded;

    // 난독화
    if (this.shouldObfuscate(options)) {
      result = this.getObfuscationLayer().obfuscate(result);
    }

    // 체크섬 추가
    if (shouldChecksum && checksum) {
      result = result + "CHK" + checksum;
    }

    // URL-Safe 변환
    if (this.urlSafe) {
      result = toUrlSafe(result);
    }

    // 청킹
    if (chunkSize && chunkSize > 0) {
      result = splitIntoChunks(result, chunkSize, chunkSeparator);
    }

    return result;
  }

  /**
   * BitPack + 푸터를 사용하여 바이트를 charset 문자열로 인코딩합니다.
   */
  private encodeBytes(
    data: Uint8Array,
    compressionAlgorithm?: "deflate" | "brotli",
    isEncrypted?: boolean,
    options?: DduOptions,
  ): string {
    if (data.length === 0) return "";

    const nativeEncoded = this.encodeBytesWithNativeBase64(data);
    let indices: ArrayLike<number>;
    let paddingBits: number;

    if (nativeEncoded) {
      indices = nativeEncoded.indices;
      paddingBits = nativeEncoded.paddingBits;
    } else {
      const wasm = this.shouldUseWasm(data.length) ? getWasmCodecSync() : null;
      if (wasm?.ready && this.usePowerOfTwo) {
        const wasmResult = wasm.encode(data, this.bitLength);
        indices = wasmResult.indices;
        paddingBits = wasmResult.paddingBits;
      } else {
        const bitPackResult = bitPackEncode(data, this.bitPackConfig);
        indices = bitPackResult.indices;
        paddingBits = bitPackResult.paddingBits;
      }
    }

    // 인덱스를 문자로 매핑
    const parts: string[] = new Array(indices.length);
    for (let i = 0; i < indices.length; i++) {
      parts[i] = this.dduChar[indices[i]];
    }

    // 푸터 생성
    const footer = options?.omitFooter
      ? ""
      : buildFooter({
          paddingBits,
          compressionAlgorithm,
          isEncrypted: !!isEncrypted,
          paddingChar: this.paddingChar,
          useRepeatPadding: this.useRepeatPadding && !compressionAlgorithm && !isEncrypted,
          pipelineVersion: isEncrypted ? 3 : 2,
        });

    return parts.join("") + footer;
  }

  /**
   * charset 문자열을 인덱스로 변환한 후 BitPack으로 바이트를 얻습니다.
   */
  private decodeChars(cleanedInput: string, paddingBits: number): Uint8Array {
    const inputLen = cleanedInput.length;
    if (inputLen === 0) return new Uint8Array(0);

    const nativeDecoded = this.decodeCharsWithNativeBase64(cleanedInput, paddingBits);
    if (nativeDecoded) return nativeDecoded;

    const indices =
      inputLen >= this.wasmThreshold || inputLen >= 4096
        ? new Uint16Array(inputLen)
        : new Array<number>(inputLen);

    for (let i = 0; i < inputLen; i++) {
      const char = cleanedInput[i];
      const val = this.dduBinaryLookup.get(char);
      if (val === undefined) {
        throw new Error(`[Ddu64 decode] Invalid character "${char}" at ${i}`);
      }
      indices[i] = val;
    }

    const wasm = this.shouldUseWasm(inputLen) ? getWasmCodecSync() : null;
    if (wasm?.ready && this.usePowerOfTwo) {
      const wasmIndices = indices instanceof Uint16Array ? indices : Uint16Array.from(indices);
      return wasm.decode(wasmIndices, this.bitLength, paddingBits);
    }

    return bitPackDecode(indices, paddingBits, this.bitPackConfig);
  }

  private encodeBytesWithNativeBase64(
    data: Uint8Array,
  ): { indices: ArrayLike<number>; paddingBits: number } | null {
    if (!this.canUseNativeBase64) return null;
    const base64 = this.bytesToBase64(data);
    if (base64 === null) return null;

    let paddingChars = 0;
    let payloadLength = base64.length;
    while (payloadLength > 0 && base64[payloadLength - 1] === BASE64_PADDING) {
      paddingChars++;
      payloadLength--;
    }

    const indices =
      payloadLength >= 4096 ? new Uint16Array(payloadLength) : new Array<number>(payloadLength);
    for (let i = 0; i < payloadLength; i++) {
      indices[i] = BASE64_INDEX_LOOKUP[base64[i]];
    }

    return {
      indices,
      paddingBits: paddingChars === 2 ? 4 : paddingChars === 1 ? 2 : 0,
    };
  }

  private decodeCharsWithNativeBase64(
    cleanedInput: string,
    paddingBits: number,
  ): Uint8Array | null {
    if (!this.canUseNativeBase64 || !this.nativeDecodeMap) return null;

    const paddingChars = paddingBits === 4 ? 2 : paddingBits === 2 ? 1 : paddingBits === 0 ? 0 : -1;
    if (paddingChars < 0) return null;

    const parts = new Array<string>(cleanedInput.length + paddingChars);
    for (let i = 0; i < cleanedInput.length; i++) {
      const mapped = this.nativeDecodeMap.get(cleanedInput[i]);
      if (mapped === undefined) return null;
      parts[i] = mapped;
    }
    for (let i = 0; i < paddingChars; i++) {
      parts[cleanedInput.length + i] = BASE64_PADDING;
    }

    return this.base64ToBytes(parts.join(""));
  }

  private bytesToBase64(data: Uint8Array): string | null {
    const maybeBase64 = (data as Uint8Array & { toBase64?: () => string }).toBase64;
    if (typeof maybeBase64 === "function") {
      return maybeBase64.call(data);
    }

    const bufferCtor = (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer;
    if (bufferCtor?.from) {
      return bufferCtor.from(data.buffer, data.byteOffset, data.byteLength).toString("base64");
    }

    return null;
  }

  private base64ToBytes(input: string): Uint8Array | null {
    const uint8ArrayCtor = Uint8Array as typeof Uint8Array & {
      fromBase64?: (value: string) => Uint8Array;
    };
    if (typeof uint8ArrayCtor.fromBase64 === "function") {
      return uint8ArrayCtor.fromBase64(input);
    }

    const bufferCtor = (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer;
    if (bufferCtor?.from) {
      const buffer = bufferCtor.from(input, "base64");
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }

    return null;
  }

  private shouldUseWasm(inputLength: number): boolean {
    return inputLength >= this.wasmThreshold;
  }

  private reportProgress(options: DduOptions | undefined, info: DduProgressInfo): void {
    options?.onProgress?.(info);
  }

  // ─── 동기 암호화/압축 헬퍼 ───────────────────────────────────────

  private requireSyncAdapter(): PlatformAdapter {
    if (!this.adapter) {
      throw new Error(
        "[Ddu64 adapter] No platform adapter available. " +
          "Use encodeAsync()/decodeAsync() in browser environments, " +
          "or provide an adapter via options.adapter.",
      );
    }
    return this.adapter;
  }

  private encryptSync(data: Uint8Array): Uint8Array {
    const adapter = this.requireSyncAdapter();
    if (!adapter.encryptSync) {
      throw new Error(
        "[Ddu64 encrypt] Sync encryption unavailable. Use encodeAsync() in browser environments.",
      );
    }
    if (!this.encryptionKeyHash) {
      if (!adapter.deriveKeySync) {
        throw new Error(
          "[Ddu64 encrypt] Sync key derivation unavailable. Use encodeAsync() in browser environments.",
        );
      }
      this.encryptionKeyHash = adapter.deriveKeySync(this.encryptionKey!, this.keyDerivation);
    }
    return adapter.encryptSync(data, this.encryptionKeyHash);
  }

  private decryptSync(data: Uint8Array): Uint8Array {
    const adapter = this.requireSyncAdapter();
    if (!adapter.decryptSync) {
      throw new Error(
        "[Ddu64 decrypt] Sync decryption unavailable. Use decodeAsync() in browser environments.",
      );
    }
    if (!this.encryptionKeyHash) {
      if (!adapter.deriveKeySync) {
        throw new Error(
          "[Ddu64 decrypt] Sync key derivation unavailable. Use decodeAsync() in browser environments.",
        );
      }
      this.encryptionKeyHash = adapter.deriveKeySync(this.encryptionKey!, this.keyDerivation);
    }
    return adapter.decryptSync(data, this.encryptionKeyHash);
  }

  private compressSync(
    data: Uint8Array,
    algorithm: "deflate" | "brotli",
    level: number,
  ): Uint8Array {
    const adapter = this.requireSyncAdapter();
    if (algorithm === "brotli") {
      if (!adapter.brotliCompressSync) {
        throw new Error(
          "[Ddu64 compress] Brotli compression is unavailable in the current runtime.",
        );
      }
      return adapter.brotliCompressSync(data, level);
    }
    if (!adapter.deflateSync) {
      throw new Error(
        "[Ddu64 compress] Sync compression unavailable. Use encodeAsync() in browser environments.",
      );
    }
    return adapter.deflateSync(data, level);
  }

  private decompressSync(
    data: Uint8Array,
    algorithm: "deflate" | "brotli",
    maxBytes: number,
  ): Uint8Array {
    const adapter = this.requireSyncAdapter();
    if (algorithm === "brotli") {
      if (!adapter.brotliDecompressSync) {
        throw new Error(
          "[Ddu64 decompress] Brotli decompression is unavailable in the current runtime.",
        );
      }
      return adapter.brotliDecompressSync(data, maxBytes);
    }
    if (!adapter.inflateSync) {
      throw new Error(
        "[Ddu64 decompress] Sync decompression unavailable. Use decodeAsync() in browser environments.",
      );
    }
    return adapter.inflateSync(data, maxBytes);
  }

  // ─── 비동기 어댑터 헬퍼 ─────────────────────────────────────────────────

  private async getAdapterAsync(): Promise<PlatformAdapter> {
    if (this.adapter) return this.adapter;
    const { getAdapter } = await import("../adapters/detect.js");
    this.adapter = await getAdapter();
    return this.adapter;
  }

  private async getKeyHashAsync(adapter: PlatformAdapter): Promise<Uint8Array> {
    if (this.encryptionKeyHash) return this.encryptionKeyHash;
    this.encryptionKeyHash = await adapter.deriveKey(this.encryptionKey!, this.keyDerivation);
    return this.encryptionKeyHash;
  }

  // ─── 난독화 헬퍼 ───────────────────────────────────────────────────

  /**
   * 난독화 레이어를 가져오거나 생성합니다 (지연 초기화).
   * 알파벳에는 charset 문자, 패딩 문자, 모든 푸터 마커 문자가 포함됩니다.
   */
  private getObfuscationLayer(): ObfuscationLayer {
    if (!this._obfuscationLayer) {
      // 완전한 알파벳 구성: charset + 패딩 + 모든 가능한 푸터 문자
      const alphabetSet = new Set<string>(this.dduChar);
      alphabetSet.add(this.paddingChar);
      // 푸터 마커 문자: ELYSIA, GRISEO, ENC, V3, 숫자 0-7
      const footerChars = "ELYSIAGRONCV01234567";
      for (const ch of footerChars) {
        alphabetSet.add(ch);
      }
      const alphabet = [...alphabetSet];
      this._obfuscationLayer = new HangulObfuscationLayer(alphabet);
    }
    return this._obfuscationLayer;
  }

  /**
   * 주어진 호출에 난독화를 적용해야 하는지 결정합니다.
   * 호출별 옵션이 생성자 기본값을 오버라이드합니다.
   * 암호화 키 없이 난독화가 활성화되면 throw합니다.
   */
  private shouldObfuscate(options?: DduOptions): boolean {
    const obfuscate = options?.obfuscate ?? this.defaultObfuscate;
    if (obfuscate && !this.encryptionKey) {
      throw new Error("[Ddu64 obfuscation] Obfuscation requires encryption to be enabled.");
    }
    return obfuscate;
  }

  // ─── 유틸리티 메서드 ───────────────────────────────────────────────────────

  private normalizeLimit(
    value: number | undefined,
    fallback: number,
    shouldThrow: boolean,
    name: string,
  ): number {
    if (value === undefined) return fallback;
    if (value === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
    if (!Number.isFinite(value) || value <= 0) {
      if (shouldThrow) {
        throw new Error(
          `[Ddu64 options] Invalid ${name}. Must be a positive finite number or Infinity.`,
        );
      }
      return fallback;
    }
    return Math.floor(value);
  }

  private estimateDecodedBytes(cleanedInputLen: number, paddingBits: number): number {
    if (cleanedInputLen === 0) return 0;
    if (paddingBits < 0 || paddingBits >= this.effectiveBitLength) {
      throw new Error(`[Ddu64 decode] Invalid padding bits: ${paddingBits}`);
    }
    const chunkSize = this.usePowerOfTwo ? 1 : 2;
    const numChunks = Math.ceil(cleanedInputLen / chunkSize);
    const bits = numChunks * this.effectiveBitLength - paddingBits;
    if (bits < 0) throw new Error(`[Ddu64 decode] Invalid decoded bit length`);
    return Math.ceil(bits / BYTE_BITS);
  }

  private assertEncodedInputAligned(cleanedInput: string): void {
    if (!this.usePowerOfTwo) {
      const chunkSize = 2;
      if (cleanedInput.length % chunkSize !== 0) {
        throw new Error(
          `[Ddu64 decode] Invalid encoded length for variable charset. Expected multiple of ${chunkSize}, got ${cleanedInput.length}`,
        );
      }
    }
  }
}
