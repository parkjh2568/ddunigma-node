/**
 * 플랫폼 독립 Ddu64 인코더/디코더 코어.
 * PlatformAdapter 인터페이스를 통해 암호화 및 압축 연산을 수행하는 전체 인코딩/디코딩 파이프라인을 제공합니다.
 *
 * @module core/Ddu64Core
 */

import {
  bitPackEncode,
  bitPackDecode,
  type BitPackConfig,
} from "./BitPack.js";
import {
  parseFooter,
  buildFooter,
  extractChecksum,
  CHECKSUM_MARKER,
  COMPRESS_MARKER,
  BROTLI_MARKER,
  ENCRYPT_MARKER,
  PIPELINE_V3_MARKER,
} from "./wireFormat.js";
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
import { HangulObfuscationLayer } from "../obfuscation/ObfuscationLayer.js";
import {
  getWasmCodecSync,
  validateWasmThreshold,
  DEFAULT_WASM_THRESHOLD,
} from "../wasm/WasmCodec.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const BYTE_BITS = 8;
/** 인덱스 배열을 일반 배열 대신 Uint16Array로 할당하기 시작하는 길이 임계값 (메모리/속도 휴리스틱) */
const TYPED_INDICES_THRESHOLD = 4096;
const STRING_CHUNK_SIZE = 8192;
const FULL_CODE_BUFFER_THRESHOLD = 1 << 20;
const DEFAULT_MAX_DECODED_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;
const STANDARD_BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_PADDING = "=";

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

  /** 인코딩 문자의 코드포인트 배열 (String.fromCharCode 배치 호출용) */
  private readonly dduCharCodes: Uint16Array;

  /** 패딩 문자 */
  protected readonly paddingChar: string;

  /** 비트 길이 (2의 제곱수 charset의 경우 charset 크기의 log2) */
  protected readonly bitLength: number;

  /** charset 크기가 2의 제곱수인지 여부 */
  protected readonly usePowerOfTwo: boolean;

  /** UTF-16 코드 유닛 → 인덱스 direct lookup (단일 BMP 심볼 전용) */
  private readonly dduCharCodeLookup: Int32Array;

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

  /** 반복 패딩 시 패딩 문자 1개가 나타내는 비트 수 */
  private readonly bitsPerPadChar: number;

  /** BitPack 설정 */
  private readonly bitPackConfig: BitPackConfig;

  /** WASM 사용 임계값 */
  private readonly wasmThreshold: number;

  /** 표준 Base64 charset에서 네이티브 Base64 fast path 사용 여부 */
  private readonly canUseNativeBase64: boolean;

  /** 플랫폼 어댑터 (동기용 지연 로드 또는 명시적 제공) */
  private adapter: PlatformAdapter | undefined;

  /** 기본 난독화 활성화 */
  private readonly defaultObfuscate: boolean;

  /** 지연 초기화되는 난독화 레이어 */
  private _obfuscationLayer: ObfuscationLayer | undefined;

  // ─── 생성자 ─────────────────────────────────────────────────────────────────

  constructor(
    dduChar?: string[] | string | DduConstructorOptions,
    paddingChar?: string,
    dduOptions?: DduConstructorOptions,
  ) {
    // 오버로드: new Ddu64({ ...options }) 형태 지원
    if (
      dduChar !== null &&
      dduChar !== undefined &&
      typeof dduChar === "object" &&
      !Array.isArray(dduChar)
    ) {
      dduOptions = dduChar as DduConstructorOptions;
      dduChar = undefined;
      paddingChar = undefined;
    }

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
    const autoIsPow2 = dduLength > 0 && (dduLength & (dduLength - 1)) === 0;
    // preset 인코딩 프로필은 레거시 와이어 포맷을 고정하므로 사용자 옵션보다 우선합니다.
    // 단, dduOptions.usePowerOfTwo=true여도 charset 크기가 2의 제곱수가 아니면 무시.
    const requestedPow2 = dduOptions?.usePowerOfTwo;
    const encodingProfile = initial.encodingProfile;
    this.usePowerOfTwo =
      encodingProfile?.usePowerOfTwo ??
      initial.usePowerOfTwo ??
      (requestedPow2 !== undefined ? requestedPow2 && autoIsPow2 : autoIsPow2);

    // DDU_V1은 8개 심볼로 6비트 값을 두 글자 쌍으로 표현하는 Origin 호환 프로필입니다.
    const presetBitLength =
      encodingProfile?.bitLength ??
      (initial.isPredefined && initial.usePowerOfTwo !== undefined ? initial.bitLength : undefined);
    this.bitLength =
      presetBitLength ??
      (this.usePowerOfTwo ? Math.floor(Math.log2(dduLength)) : Math.ceil(Math.log2(dduLength)));

    // 역방향 룩업 맵
    this.dduCharCodeLookup = new Int32Array(65536);
    this.dduCharCodeLookup.fill(-1);
    for (let i = 0; i < dduLength; i++) {
      const char = this.dduChar[i];
      this.dduCharCodeLookup[char.charCodeAt(0)] = i;
    }

    // 코드포인트 배열 (encodeBytes에서 String.fromCharCode 배치 호출용)
    this.dduCharCodes = new Uint16Array(dduLength);
    for (let i = 0; i < dduLength; i++) {
      this.dduCharCodes[i] = this.dduChar[i].charCodeAt(0);
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
    this.bitsPerPadChar = encodingProfile?.bitsPerPadChar ?? initial.bitsPerPadChar ?? 2;

    // 난독화
    this.defaultObfuscate = dduOptions?.obfuscate ?? false;
    if (this.defaultObfuscate && !this.encryptionKey) {
      throw new Error("[Ddu64 obfuscation] Obfuscation requires encryption to be enabled.");
    }

    // BitPack 설정
    this.bitPackConfig = {
      bitLength: this.bitLength,
      usePowerOfTwo: this.usePowerOfTwo,
      charsetSize: dduLength,
    };
    this.wasmThreshold = validateWasmThreshold(dduOptions?.wasmThreshold ?? DEFAULT_WASM_THRESHOLD);
    this.canUseNativeBase64 =
      this.usePowerOfTwo &&
      this.bitLength === 6 &&
      this.paddingChar === BASE64_PADDING &&
      this.dduChar.join("") === STANDARD_BASE64_ALPHABET;
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
    const prep = this.decodePrelude(input, options);
    const { extractedChecksum, compressionAlgorithm, isEncrypted, pipelineVersion } = prep;
    const { allowInternalDecompress, allowInternalDecrypt } = prep;
    let decoded = prep.decoded;

    // v3 파이프라인: 비트팩 해제 직후 복호화
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
      this.shouldDecompress(
        compressionAlgorithm,
        allowInternalDecompress,
        isEncrypted,
        pipelineVersion,
        allowInternalDecrypt,
      )
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
      decoded = this.decompressSync(decoded, compressionAlgorithm!, maxDecompressedBytes);
    }

    // 체크섬 검증
    this.verifyDecodedChecksum(
      decoded,
      extractedChecksum,
      isEncrypted,
      pipelineVersion,
      allowInternalDecrypt,
      options,
    );

    // v2 파이프라인: 압축 해제/체크섬 후 복호화
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
    const { shouldCompress, shouldChecksum, shouldEncrypt, chunkSize, chunkSeparator } =
      this.resolveEncodeSettings(options);

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
      const adapter = await this.getAdapterAsync();
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
      const adapter = await this.getAdapterAsync();
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

    return this.finalizeEncode(
      workingData,
      compressionAlgorithm,
      isEncrypted,
      checksum,
      shouldChecksum,
      chunkSize,
      chunkSeparator,
      options,
    );
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
    const prep = this.decodePrelude(input, options);
    const { extractedChecksum, compressionAlgorithm, isEncrypted, pipelineVersion } = prep;
    const { allowInternalDecompress, allowInternalDecrypt } = prep;
    let decoded = prep.decoded;

    // v3 파이프라인: 비트팩 해제 직후 복호화
    if (pipelineVersion === 3 && isEncrypted && this.encryptionKey && allowInternalDecrypt) {
      const adapter = await this.getAdapterAsync();
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
      this.shouldDecompress(
        compressionAlgorithm,
        allowInternalDecompress,
        isEncrypted,
        pipelineVersion,
        allowInternalDecrypt,
      )
    ) {
      const maxDecompressedBytes = this.normalizeLimit(
        options?.maxDecompressedBytes,
        this.defaultMaxDecompressedBytes,
        true,
        "maxDecompressedBytes",
      );
      const adapter = await this.getAdapterAsync();
      this.reportProgress(options, {
        processedBytes: decoded.length,
        totalBytes: decoded.length,
        percent: 70,
        stage: "decompress",
      });
      if (compressionAlgorithm === "brotli") {
        if (!adapter.brotliDecompress) {
          throw new Error(
            "[Ddu64 decompress] Brotli decompression is unavailable in the current runtime.",
          );
        }
        decoded = await adapter.brotliDecompress(decoded, maxDecompressedBytes);
      } else {
        decoded = await adapter.inflate(decoded, maxDecompressedBytes);
      }
    }

    // 체크섬 검증
    this.verifyDecodedChecksum(
      decoded,
      extractedChecksum,
      isEncrypted,
      pipelineVersion,
      allowInternalDecrypt,
      options,
    );

    // v2 파이프라인: 압축 해제/체크섬 후 복호화
    if (pipelineVersion === 2 && isEncrypted && this.encryptionKey && allowInternalDecrypt) {
      const adapter = await this.getAdapterAsync();
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

  // ─── 내부 인코딩/디코딩 ────────────────────────────────────────────────

  /**
   * 통계를 위한 메타데이터 포함 내부 인코딩.
   */
  private encodeInternal(
    input: Uint8Array | string,
    options?: DduOptions,
  ): { encoded: string; compressedSize?: number } {
    const { shouldCompress, shouldChecksum, shouldEncrypt, chunkSize, chunkSeparator } =
      this.resolveEncodeSettings(options);

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

    const encoded = this.finalizeEncode(
      workingData,
      compressionAlgorithm,
      isEncrypted,
      checksum,
      shouldChecksum,
      chunkSize,
      chunkSeparator,
      options,
    );
    return { encoded, compressedSize };
  }

  private resolveEncodeSettings(options?: DduOptions): {
    shouldCompress: boolean;
    shouldChecksum: boolean;
    shouldEncrypt: boolean;
    chunkSize: number | undefined;
    chunkSeparator: string;
  } {
    return {
      shouldCompress: options?.compress ?? this.defaultCompress,
      shouldChecksum: options?.checksum ?? this.defaultChecksum,
      shouldEncrypt: (options?.encrypt ?? true) && !!this.encryptionKey,
      chunkSize: options?.chunkSize ?? this.defaultChunkSize,
      chunkSeparator: options?.chunkSeparator ?? this.defaultChunkSeparator,
    };
  }

  /**
   * 인코딩 마무리: 비트팩 인코딩 + 후처리(난독화/체크섬/URL-safe/청킹).
   * 동기/비동기 인코딩에서 공유하는 순수 동기 단계입니다.
   */
  private finalizeEncode(
    workingData: Uint8Array,
    compressionAlgorithm: "deflate" | "brotli" | undefined,
    isEncrypted: boolean,
    checksum: string,
    shouldChecksum: boolean,
    chunkSize: number | undefined,
    chunkSeparator: string,
    options: DduOptions | undefined,
  ): string {
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
      result = result + CHECKSUM_MARKER + checksum;
    }

    // URL-Safe 변환
    if (this.urlSafe) {
      result = toUrlSafe(result);
    }

    // 청킹
    if (chunkSize && chunkSize > 0) {
      this.assertSafeChunkSeparator(result, chunkSeparator);
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
    let paddingBits: number;
    let payload: string;

    if (nativeEncoded) {
      paddingBits = nativeEncoded.paddingBits;
      payload = nativeEncoded.payload;
    } else {
      let indices: ArrayLike<number>;
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

      // 인덱스를 문자로 매핑 (코드포인트 배열 → String.fromCharCode 배치 호출)
      const len = indices.length;
      if (len <= FULL_CODE_BUFFER_THRESHOLD) {
        const codes = new Uint16Array(len);
        for (let i = 0; i < len; i++) {
          codes[i] = this.dduCharCodes[indices[i]];
        }

        if (len <= STRING_CHUNK_SIZE) {
          payload = String.fromCharCode.apply(null, codes as unknown as number[]);
        } else {
          const chunks = new Array<string>(Math.ceil(len / STRING_CHUNK_SIZE));
          let chunkIndex = 0;
          for (let offset = 0; offset < len; offset += STRING_CHUNK_SIZE) {
            const slice = codes.subarray(offset, Math.min(offset + STRING_CHUNK_SIZE, len));
            chunks[chunkIndex++] = String.fromCharCode.apply(null, slice as unknown as number[]);
          }
          payload = chunks.join("");
        }
      } else {
        const codes = new Uint16Array(STRING_CHUNK_SIZE);
        const chunks = new Array<string>(Math.ceil(len / STRING_CHUNK_SIZE));
        let chunkIndex = 0;
        for (let offset = 0; offset < len; offset += STRING_CHUNK_SIZE) {
          const chunkLen = Math.min(STRING_CHUNK_SIZE, len - offset);
          for (let i = 0; i < chunkLen; i++) {
            codes[i] = this.dduCharCodes[indices[offset + i]];
          }
          const view = chunkLen === codes.length ? codes : codes.subarray(0, chunkLen);
          chunks[chunkIndex++] = String.fromCharCode.apply(null, view as unknown as number[]);
        }
        payload = chunks.join("");
      }
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
          bitsPerPadChar: this.bitsPerPadChar,
          pipelineVersion: isEncrypted ? 3 : 2,
        });

    return payload + footer;
  }

  /**
   * 디코딩 전처리: 동기/비동기 디코딩에서 공통으로 쓰는 순수 동기 단계.
   * 청크 제거 → URL-safe 역변환 → 체크섬 추출 → 역난독화 → 푸터 파싱 →
   * 검증(정렬/패딩/크기) → 비트팩 해제까지 수행합니다.
   */
  private decodePrelude(
    input: string,
    options: DduOptions | undefined,
  ): {
    decoded: Uint8Array;
    extractedChecksum: string | null;
    compressionAlgorithm?: "deflate" | "brotli";
    isEncrypted: boolean;
    pipelineVersion: 2 | 3;
    allowInternalDecompress: boolean;
    allowInternalDecrypt: boolean;
  } {
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
      parseFooter(workingInput, this.paddingChar, this.bitLength, this.bitsPerPadChar);

    if (isEncrypted && allowInternalDecrypt && !this.encryptionKey) {
      throw new Error("[Ddu64 decode] Encrypted payload requires an encryptionKey");
    }

    // 정렬 확인
    this.assertEncodedInputAligned(cleanedInput);
    this.assertCanonicalPadding(cleanedInput, paddingBits);

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
    const decoded = this.decodeChars(cleanedInput, paddingBits);

    return {
      decoded,
      extractedChecksum,
      compressionAlgorithm,
      isEncrypted,
      pipelineVersion,
      allowInternalDecompress,
      allowInternalDecrypt,
    };
  }

  /**
   * 압축 해제 단계를 실행해야 하는지 결정합니다.
   * (압축 마커 존재 + 내부 압축 해제 허용 + 파이프라인 단계 조건)
   */
  private shouldDecompress(
    compressionAlgorithm: "deflate" | "brotli" | undefined,
    allowInternalDecompress: boolean,
    isEncrypted: boolean,
    pipelineVersion: 2 | 3,
    allowInternalDecrypt: boolean,
  ): compressionAlgorithm is "deflate" | "brotli" {
    return (
      !!compressionAlgorithm &&
      allowInternalDecompress &&
      (pipelineVersion === 2 || !isEncrypted || allowInternalDecrypt)
    );
  }

  /**
   * 추출된 체크섬이 있으면 복원된 데이터의 CRC32와 비교 검증합니다.
   * 동기/비동기 디코딩에서 공유하는 순수 동기 단계입니다.
   */
  private verifyDecodedChecksum(
    decoded: Uint8Array,
    extractedChecksum: string | null,
    isEncrypted: boolean,
    pipelineVersion: 2 | 3,
    allowInternalDecrypt: boolean,
    options: DduOptions | undefined,
  ): void {
    if (!extractedChecksum) return;
    if (!(pipelineVersion === 2 || !isEncrypted || allowInternalDecrypt)) return;

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

  /**
   * charset 문자열을 인덱스로 변환한 후 BitPack으로 바이트를 얻습니다.
   */
  private decodeChars(cleanedInput: string, paddingBits: number): Uint8Array {
    const inputLen = cleanedInput.length;
    if (inputLen === 0) return new Uint8Array(0);

    const nativeDecoded = this.decodeCharsWithNativeBase64(cleanedInput, paddingBits);
    if (nativeDecoded) return nativeDecoded;

    const indices =
      inputLen >= this.wasmThreshold || inputLen >= TYPED_INDICES_THRESHOLD
        ? new Uint16Array(inputLen)
        : new Array<number>(inputLen);

    for (let i = 0; i < inputLen; i++) {
      const val = this.dduCharCodeLookup[cleanedInput.charCodeAt(i)];
      if (val < 0) {
        throw new Error(`[Ddu64 decode] Invalid character "${cleanedInput[i]}" at ${i}`);
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
  ): { payload: string; paddingBits: number } | null {
    if (!this.canUseNativeBase64) return null;
    const base64 = this.bytesToBase64(data);
    if (base64 === null) return null;

    let paddingChars = 0;
    let payloadLength = base64.length;
    while (payloadLength > 0 && base64[payloadLength - 1] === BASE64_PADDING) {
      paddingChars++;
      payloadLength--;
    }

    return {
      payload: base64.slice(0, payloadLength),
      paddingBits: paddingChars === 2 ? 4 : paddingChars === 1 ? 2 : 0,
    };
  }

  private decodeCharsWithNativeBase64(
    cleanedInput: string,
    paddingBits: number,
  ): Uint8Array | null {
    if (!this.canUseNativeBase64) return null;

    const paddingChars = paddingBits === 4 ? 2 : paddingBits === 2 ? 1 : paddingBits === 0 ? 0 : -1;
    if (paddingChars < 0) return null;

    for (let i = 0; i < cleanedInput.length; i++) {
      if (this.dduCharCodeLookup[cleanedInput.charCodeAt(i)] < 0) return null;
    }

    return this.base64ToBytes(cleanedInput + BASE64_PADDING.repeat(paddingChars));
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
    throw new Error(
      "[Ddu64 adapter] No platform adapter available. " +
        "Use @ddunigma/node or @ddunigma/node/browser, " +
        "or provide an adapter via options.adapter.",
    );
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
      // 완전한 알파벳 구성: charset + 패딩 + 모든 가능한 푸터 문자.
      // 난독화는 체크섬/URL-safe/청킹 이전 단계에 적용되므로(아래 applyPostEncoding 순서 참조)
      // 알파벳에는 페이로드 문자와 푸터 마커만 포함하면 됩니다.
      const alphabetSet = new Set<string>(this.dduChar);
      alphabetSet.add(this.paddingChar);
      // 푸터 마커 문자를 wireFormat 상수에서 직접 도출 (수동 동기화 제거)
      const footerMarkers = COMPRESS_MARKER + BROTLI_MARKER + ENCRYPT_MARKER + PIPELINE_V3_MARKER;
      for (const ch of footerMarkers) {
        alphabetSet.add(ch);
      }
      // paddingBits 십진 숫자 (0 ~ bitLength-1, 최대 두 자리)
      for (const ch of "0123456789") {
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

  private assertSafeChunkSeparator(encoded: string, separator: string): void {
    if (separator.length === 0 || this.isLineBreakSeparator(separator)) return;

    if (encoded.includes(separator)) {
      throw new Error(
        `[Ddu64 chunking] Unsafe chunkSeparator "${separator}" appears in encoded output. ` +
          "Use a separator that cannot be produced by the charset, footer, checksum, or URL-safe output.",
      );
    }
  }

  private isLineBreakSeparator(separator: string): boolean {
    return separator === "\n" || separator === "\r\n" || separator === "\r";
  }

  private estimateDecodedBytes(cleanedInputLen: number, paddingBits: number): number {
    if (cleanedInputLen === 0) return 0;
    if (paddingBits < 0 || paddingBits >= this.bitLength) {
      throw new Error(`[Ddu64 decode] Invalid padding bits: ${paddingBits}`);
    }
    const chunkSize = this.usePowerOfTwo ? 1 : 2;
    const numChunks = Math.ceil(cleanedInputLen / chunkSize);
    const bits = numChunks * this.bitLength - paddingBits;
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

  private assertCanonicalPadding(cleanedInput: string, paddingBits: number): void {
    if (paddingBits === 0) return;
    if (cleanedInput.length === 0) {
      throw new Error("[Ddu64 decode] Invalid padding bits without payload");
    }

    const paddingMask = (1 << paddingBits) - 1;
    let lastValue: number;

    if (this.usePowerOfTwo) {
      const lastChar = cleanedInput[cleanedInput.length - 1];
      const value = this.dduCharCodeLookup[lastChar.charCodeAt(0)];
      if (value < 0) {
        throw new Error(
          `[Ddu64 decode] Invalid character "${lastChar}" at ${cleanedInput.length - 1}`,
        );
      }
      lastValue = value;
    } else {
      const first = cleanedInput[cleanedInput.length - 2];
      const second = cleanedInput[cleanedInput.length - 1];
      const firstValue = this.dduCharCodeLookup[first.charCodeAt(0)];
      const secondValue = this.dduCharCodeLookup[second.charCodeAt(0)];
      if (firstValue < 0 || secondValue < 0) {
        throw new Error("[Ddu64 decode] Invalid character in final encoded chunk");
      }
      lastValue = firstValue * this.dduChar.length + secondValue;
    }

    if ((lastValue & paddingMask) !== 0) {
      throw new Error("[Ddu64 decode] Invalid non-zero padding bits in final symbol");
    }
  }
}
