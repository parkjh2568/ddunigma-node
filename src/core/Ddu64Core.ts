/**
 * 플랫폼 독립 Ddu64 인코더/디코더 코어.
 * PlatformAdapter 인터페이스를 통해 암호화 및 압축 연산을 수행하는 전체 인코딩/디코딩 파이프라인을 제공합니다.
 *
 * @module core/Ddu64Core
 */

import { calculateBitLength, isPowerOfTwo, type BitPackConfig } from "./BitPack.js";
import { normalizeCompressionLevel, stringToBytes, bytesToString } from "./codecUtils.js";
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
  Ddu64CompressionError,
  Ddu64CharsetError,
  Ddu64DecompressionError,
  Ddu64DecryptionError,
  Ddu64EncryptionError,
  Ddu64ObfuscationError,
  isDdu64Error,
  toErrorMessage,
  wrapDdu64Error,
} from "./errors.js";
import { canUseNativeBase64FastPath } from "./internal/NativeBase64FastPath.js";
import {
  compressSyncWithAdapter,
  decompressSyncWithAdapter,
  decryptSyncWithAdapter,
  encryptSyncWithAdapter,
  type SyncAdapterGatewayContext,
} from "./internal/SyncAdapterGateway.js";
import {
  compressAsyncWithAdapter,
  decompressAsyncWithAdapter,
  decryptAsyncWithAdapter,
  encryptAsyncWithAdapter,
} from "./internal/AsyncAdapterGateway.js";
import { resolveConstructorArgs } from "./internal/constructorOptions.js";
import { buildCharsetLookupTables } from "./internal/CharsetLookup.js";
import { normalizeLimit } from "./internal/DecodeValidation.js";
import { runDecodePrelude, type DecodePreludeResult } from "./internal/DecodePrelude.js";
import { applyPostEncoding as applyEncodePostProcessing } from "./internal/EncodeFinalize.js";
import { decodePayload, encodePayload, type PayloadCodecContext } from "./internal/PayloadCodec.js";
import { buildObfuscationAlphabet } from "./internal/ObfuscationAlphabet.js";
import { isAdapterCapabilityErrorMessage } from "./internal/AdapterCapability.js";
import {
  validateDecodeInput,
  validateEncodeInput,
  validateRuntimeOptions,
} from "./internal/OptionValidation.js";
import {
  runAsyncDecodePipeline,
  runSyncDecodePipeline,
  type DecodePipelineContext,
} from "./pipeline/DecodePipeline.js";
import {
  runAsyncEncodePipeline,
  runSyncEncodePipeline,
  type EncodePipelineBaseContext,
} from "./pipeline/EncodePipeline.js";
import { buildEncryptionAAD } from "./wireFormat.js";

const DEFAULT_MAX_DECODED_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;

/**
 * AES-GCM 와이어 오버헤드 (IV 12바이트 + authTag 16바이트).
 * Node/Browser 어댑터 모두 `IV(12) + authTag(16) + 암호문(N)` 레이아웃을 사용하며,
 * AES-GCM 암호문 길이는 평문 길이와 동일하므로 암호화 출력 길이는 항상 `평문 + 28`로 결정적입니다.
 * `getStats`가 실제 암호화 없이 와이어 길이를 정확히 산출하는 데 사용합니다.
 */
const AEAD_OVERHEAD_BYTES = 28;

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

  /** 캐시된 어댑터 게이트웨이 컨텍스트 (호출당 재할당 방지, 해시는 getter로 라이브 조회) */
  private syncGatewayContext: SyncAdapterGatewayContext | undefined;

  /** 기본 체크섬 활성화 */
  private readonly defaultChecksum: boolean;

  /** 기본 체크섬 계산 범위 */
  private readonly defaultChecksumScope: "plaintext" | "output";

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

  /** 표준 Base64 charset에서 네이티브 Base64 fast path 사용 여부 */
  private readonly canUseNativeBase64: boolean;

  /** 인코딩/디코딩 payload codec 공유 컨텍스트 */
  private readonly payloadCodecContext: PayloadCodecContext;

  /** 플랫폼 어댑터 (동기용 지연 로드 또는 명시적 제공) */
  private adapter: PlatformAdapter | undefined;

  /** 기본 난독화 활성화 */
  private readonly defaultObfuscate: boolean;

  /** 기본 진행률 콜백 */
  private readonly defaultOnProgress: ((info: DduProgressInfo) => void) | undefined;

  /** 암호화 키가 설정된 decoder에서 암호화 footer 요구 */
  private readonly defaultRequireEncryption: boolean;

  /** 지연 초기화되는 난독화 레이어 */
  private obfuscationLayer: ObfuscationLayer | undefined;

  // ─── 생성자 ─────────────────────────────────────────────────────────────────

  /**
   * Ddu64 인코더/디코더를 생성합니다.
   *
   * 권장: 옵션 객체 단일 인자 형태 — `new Ddu64({ dduSetSymbol, compress, ... })`.
   *
   * 위치 인자 형태 `new Ddu64(dduChar, paddingChar, options)`는 커스텀 charset
   * 지정용으로 계속 지원되지만, 가독성을 위해 옵션 객체 형태를 우선 권장합니다.
   * (`new Ddu64(charset, padding, options)` 또는 `new Ddu64({ dduChar, paddingChar, ...options })`)
   *
   * @param dduChar - 커스텀 charset(문자열/배열) 또는 옵션 객체
   * @param paddingChar - 패딩 문자 (커스텀 charset 사용 시 필수)
   * @param dduOptions - 추가 옵션
   */
  constructor(
    dduChar?: string[] | string | DduConstructorOptions,
    paddingChar?: string,
    dduOptions?: DduConstructorOptions,
  ) {
    const resolved = resolveConstructorArgs(dduChar, paddingChar, dduOptions);
    dduChar = resolved.dduChar;
    paddingChar = resolved.paddingChar;
    dduOptions = resolved.dduOptions;
    validateRuntimeOptions(dduOptions);

    // 5.0: 초기화 오류 시 기본적으로 throw (기본 3종 등 유효 설정은 영향 없음; 잘못된 charset만 throw).
    // 레거시 묵시적 fallback이 필요하면 throwOnError: false를 명시.
    const shouldThrow = dduOptions?.throwOnError ?? true;

    // 어댑터 해석
    if (dduOptions?.adapter) {
      this.adapter = dduOptions.adapter;
    } else {
      this.adapter = undefined;
    }

    // Charset 초기화
    let initial: ReturnType<typeof resolveInitialCharSet>;
    let normalized: ReturnType<typeof normalizeCharSet>;
    try {
      initial = resolveInitialCharSet(dduChar, paddingChar, dduOptions, shouldThrow);
      normalized = normalizeCharSet(initial, shouldThrow, dduOptions);
    } catch (error) {
      if (isDdu64Error(error)) throw error;
      throw new Ddu64CharsetError(toErrorMessage(error), error);
    }

    this.dduChar = normalized.charSet;
    this.paddingChar = normalized.padding;
    const isPredefinedCharSet = normalized.isPredefined;
    this.defaultCompress = dduOptions?.compress ?? false;

    // 제한값
    this.defaultMaxDecodedBytes = normalizeLimit(
      dduOptions?.maxDecodedBytes,
      DEFAULT_MAX_DECODED_BYTES,
      shouldThrow,
      "maxDecodedBytes",
    );
    this.defaultMaxDecompressedBytes = normalizeLimit(
      dduOptions?.maxDecompressedBytes,
      DEFAULT_MAX_DECOMPRESSED_BYTES,
      shouldThrow,
      "maxDecompressedBytes",
    );

    // 비트 길이 계산
    const dduLength = this.dduChar.length;
    const autoIsPow2 = isPowerOfTwo(dduLength);
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
    this.bitLength = presetBitLength ?? calculateBitLength(dduLength, this.usePowerOfTwo);

    const lookupTables = buildCharsetLookupTables(this.dduChar, isPredefinedCharSet);
    this.dduCharCodeLookup = lookupTables.charCodeLookup;
    this.dduCharCodes = lookupTables.charCodes;

    this.urlSafe = validateFinalCharsetConfiguration(
      this.dduChar,
      this.paddingChar,
      dduLength,
      isPredefinedCharSet,
      dduOptions?.urlSafe ?? false,
      shouldThrow,
    );

    // 암호화 키 (원시 저장, 해시는 첫 암/복호화 시점에 지연 파생 후 캐시)
    // 생성 시점에 즉시 파생하면 암호화를 쓰지 않는 인스턴스나 고비용 PBKDF2 파생에서
    // 불필요한 작업이 발생하므로, SyncAdapterGateway/AsyncAdapterGateway의 지연 파생에 맡깁니다.
    this.encryptionKey = dduOptions?.encryptionKey;
    this.keyDerivation = dduOptions?.keyDerivation;

    // 옵션
    this.defaultChecksum = dduOptions?.checksum ?? false;
    // 5.0: 기본 체크섬 범위를 "output"으로 전환 (암호화 시 평문 CRC 미노출).
    // 기본 3종(옵션 미사용)은 체크섬을 쓰지 않으므로 와이어 출력에 영향 없음.
    this.defaultChecksumScope = dduOptions?.checksumScope ?? "output";
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
    this.defaultOnProgress = dduOptions?.onProgress;
    this.defaultRequireEncryption =
      dduOptions?.requireEncryption ?? this.encryptionKey !== undefined;
    if (this.defaultObfuscate && !this.encryptionKey) {
      throw new Ddu64ObfuscationError(
        "[Ddu64 obfuscation] Obfuscation requires encryption to be enabled.",
      );
    }

    // BitPack 설정
    this.bitPackConfig = {
      bitLength: this.bitLength,
      usePowerOfTwo: this.usePowerOfTwo,
      charsetSize: dduLength,
    };
    this.canUseNativeBase64 = canUseNativeBase64FastPath(
      this.dduChar,
      this.paddingChar,
      this.usePowerOfTwo,
      this.bitLength,
    );
    this.payloadCodecContext = {
      bitPackConfig: this.bitPackConfig,
      canUseNativeBase64: this.canUseNativeBase64,
      dduCharCodes: this.dduCharCodes,
      dduCharCodeLookup: this.dduCharCodeLookup,
      paddingChar: this.paddingChar,
      useRepeatPadding: this.useRepeatPadding,
      bitsPerPadChar: this.bitsPerPadChar,
      encryptedPipelineVersion: 4,
    };
  }

  // ─── 공개 메서드 ─────────────────────────────────────────────────────────

  /**
   * 입력 데이터를 charset 인코딩 문자열로 인코딩합니다.
   *
   * @param input - 인코딩할 String 또는 Uint8Array
   * @param options - 인코딩 옵션
   * @returns 인코딩된 문자열
   * @throws 동기 암호화/압축이 필요하지만 어댑터가 지원하지 않는 경우
   * @group Sync
   */
  encode(input: Uint8Array | string, options?: DduOptions): string {
    try {
      validateRuntimeOptions(options, "encode");
      validateEncodeInput(input);
      return this.encodeInternal(input, options).encoded;
    } catch (err) {
      throw wrapDdu64Error(err, "encode");
    }
  }

  /**
   * 인코딩된 문자열을 UTF-8 문자열로 디코딩합니다.
   *
   * @param input - 디코딩할 인코딩된 문자열
   * @param options - 디코딩 옵션
   * @returns 디코딩된 문자열
   * @group Sync
   */
  decode(input: string, options?: DduOptions): string {
    try {
      validateRuntimeOptions(options, "decode");
      validateDecodeInput(input);
      const bytes = this.decodeToUint8Array(input, options);
      return bytesToString(bytes);
    } catch (err) {
      throw wrapDdu64Error(err, "decode");
    }
  }

  /**
   * 인코딩된 문자열을 Uint8Array로 디코딩합니다.
   *
   * @param input - 디코딩할 인코딩된 문자열
   * @param options - 디코딩 옵션
   * @returns 디코딩된 바이트
   * @group Sync
   */
  decodeToUint8Array(input: string, options?: DduOptions): Uint8Array {
    try {
      validateRuntimeOptions(options, "decode");
      validateDecodeInput(input);
      return this.decodeToUint8ArrayInternal(input, options);
    } catch (err) {
      throw wrapDdu64Error(err, "decode");
    }
  }

  private decodeToUint8ArrayInternal(input: string, options?: DduOptions): Uint8Array {
    const prep = this.decodePrelude(input, options);
    return runSyncDecodePipeline(prep, options, {
      ...this.buildDecodeBaseContext(options),
      decrypt: (data, aad) => this.decryptSync(data, aad),
      decompress: (data, algorithm, maxBytes) => this.decompressSync(data, algorithm, maxBytes),
    });
  }

  /**
   * 비동기 인코딩 - 브라우저를 포함한 모든 런타임에서 동작합니다.
   *
   * @group Async
   */
  async encodeAsync(input: Uint8Array | string, options?: DduOptions): Promise<string> {
    try {
      validateRuntimeOptions(options, "encode");
      validateEncodeInput(input);
      return await this.encodeAsyncInternal(input, options);
    } catch (err) {
      throw wrapDdu64Error(err, "encode");
    }
  }

  private async encodeAsyncInternal(
    input: Uint8Array | string,
    options?: DduOptions,
  ): Promise<string> {
    const result = await runAsyncEncodePipeline(input, options, {
      ...this.buildEncodeBaseContext(options),
      compress: (data, algorithm, level) =>
        compressAsyncWithAdapter(this.adapter, data, algorithm, level),
      encrypt: (data, aad) => encryptAsyncWithAdapter(this.getSyncGatewayContext(), data, aad),
    });
    return result.encoded;
  }

  /**
   * 비동기 디코딩 - 브라우저를 포함한 모든 런타임에서 동작합니다.
   *
   * @group Async
   */
  async decodeAsync(input: string, options?: DduOptions): Promise<string> {
    try {
      validateRuntimeOptions(options, "decode");
      validateDecodeInput(input);
      const bytes = await this.decodeToUint8ArrayAsync(input, options);
      return bytesToString(bytes);
    } catch (err) {
      throw wrapDdu64Error(err, "decode");
    }
  }

  /**
   * 비동기 Uint8Array 디코딩 - 브라우저를 포함한 모든 런타임에서 동작합니다.
   *
   * @group Async
   */
  async decodeToUint8ArrayAsync(input: string, options?: DduOptions): Promise<Uint8Array> {
    try {
      validateRuntimeOptions(options, "decode");
      validateDecodeInput(input);
      return await this.decodeToUint8ArrayAsyncInternal(input, options);
    } catch (err) {
      throw wrapDdu64Error(err, "decode");
    }
  }

  private async decodeToUint8ArrayAsyncInternal(
    input: string,
    options?: DduOptions,
  ): Promise<Uint8Array> {
    const prep = this.decodePrelude(input, options);
    return runAsyncDecodePipeline(prep, options, {
      ...this.buildDecodeBaseContext(options),
      decrypt: (data, aad) => decryptAsyncWithAdapter(this.getSyncGatewayContext(), data, aad),
      decompress: (data, algorithm, maxBytes) =>
        decompressAsyncWithAdapter(this.adapter, data, algorithm, maxBytes),
    });
  }

  /**
   * 동기/비동기 디코딩 파이프라인이 공유하는 기본 컨텍스트를 구성합니다.
   * decrypt/decompress만 동기/비동기 구현에서 각각 덧붙입니다.
   */
  private buildDecodeBaseContext(options?: DduOptions): DecodePipelineContext {
    return {
      encryptionKey: this.encryptionKey,
      defaultMaxDecompressedBytes: this.defaultMaxDecompressedBytes,
      reportProgress: (info) => this.reportProgress(options, info),
    };
  }

  /**
   * charset 정보를 가져옵니다.
   *
   * @group Introspection
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
      defaultChecksumScope: this.defaultChecksumScope,
      defaultObfuscate: this.defaultObfuscate,
      defaultRequireEncryption: this.defaultRequireEncryption,
      defaultChunkSize: this.defaultChunkSize,
      defaultChunkSeparator: this.defaultChunkSeparator,
      defaultCompressionLevel: this.defaultCompressionLevel,
      defaultCompressionAlgorithm: this.defaultCompressionAlgorithm,
    };
  }

  /**
   * 인코딩 통계를 가져옵니다.
   *
   * @group Introspection
   */
  getStats(input: Uint8Array | string, options?: DduOptions): DduEncodeStats {
    validateRuntimeOptions(options, "encode");
    validateEncodeInput(input);
    const originalData = typeof input === "string" ? stringToBytes(input) : input;
    // 이미 바이트로 변환된 originalData를 재사용해 문자열 입력의 중복 UTF-8 인코딩을 피합니다.
    // 실제 AES-GCM 연산을 건너뛰는 통계 전용 인코딩으로 와이어 길이만 정확히 산출합니다.
    const { encoded, compressedSize } = this.encodeStatsInternal(originalData, options);
    return this.buildEncodeStats(originalData.length, encoded.length, compressedSize, options);
  }

  /**
   * 비동기 인코딩 통계를 가져옵니다.
   *
   * 브라우저/Workers처럼 압축이 비동기 API로만 제공되는 런타임에서는 `compress: true`
   * 통계 계산에 이 메서드를 사용하세요.
   *
   * @group Introspection
   */
  async getStatsAsync(input: Uint8Array | string, options?: DduOptions): Promise<DduEncodeStats> {
    validateRuntimeOptions(options, "encode");
    validateEncodeInput(input);
    const originalData = typeof input === "string" ? stringToBytes(input) : input;
    const { encoded, compressedSize } = await this.encodeStatsAsyncInternal(originalData, options);
    return this.buildEncodeStats(originalData.length, encoded.length, compressedSize, options);
  }

  private buildEncodeStats(
    originalSize: number,
    encodedSize: number,
    compressedSize: number | undefined,
    options: DduOptions | undefined,
  ): DduEncodeStats {
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
    return runSyncEncodePipeline(input, options, {
      ...this.buildEncodeBaseContext(options),
      compress: (data, algorithm, level) => this.compressSync(data, algorithm, level),
      encrypt: (data, aad) => this.encryptSync(data, aad),
    });
  }

  /**
   * getStats 전용 인코딩: 실제 AES-GCM 연산을 생략하고 길이만 정확한 더미 암호화를 사용합니다.
   *
   * 암호화 출력 길이는 `평문 + AEAD_OVERHEAD_BYTES`로 결정적이고, 비트팩/푸터/체크섬/난독화/
   * URL-safe/청킹은 모두 입력 바이트 "길이"에만 의존(바이트 "값"과 무관)하므로, 더미 암호문(0으로 채운
   * 동일 길이 버퍼)으로 마무리해도 `encoded.length`는 실제 `encode()` 출력과 바이트 단위로 일치합니다.
   * 압축은 결과 크기와 적용 여부 판단에 필요하므로 실제로 수행합니다.
   *
   * 이 등식(통계 길이 === 실제 encode 길이)은 property test로 고정됩니다.
   */
  private encodeStatsInternal(
    input: Uint8Array,
    options?: DduOptions,
  ): { encoded: string; compressedSize?: number } {
    return runSyncEncodePipeline(input, options, {
      ...this.buildEncodeBaseContext(options),
      compress: (data, algorithm, level) => this.compressSync(data, algorithm, level),
      encrypt: (data) => new Uint8Array(data.length + AEAD_OVERHEAD_BYTES),
    });
  }

  private async encodeStatsAsyncInternal(
    input: Uint8Array,
    options?: DduOptions,
  ): Promise<{ encoded: string; compressedSize?: number }> {
    return runAsyncEncodePipeline(input, options, {
      ...this.buildEncodeBaseContext(options),
      compress: (data, algorithm, level) =>
        compressAsyncWithAdapter(this.adapter, data, algorithm, level),
      encrypt: async (data) => new Uint8Array(data.length + AEAD_OVERHEAD_BYTES),
    });
  }

  /**
   * 동기/비동기 인코딩 파이프라인이 공유하는 기본 컨텍스트를 구성합니다.
   * compress/encrypt만 동기/비동기 구현에서 각각 덧붙입니다.
   */
  private buildEncodeBaseContext(options?: DduOptions): EncodePipelineBaseContext {
    return {
      defaultCompress: this.defaultCompress,
      defaultChecksum: this.defaultChecksum,
      defaultChecksumScope: this.defaultChecksumScope,
      defaultChunkSize: this.defaultChunkSize,
      defaultChunkSeparator: this.defaultChunkSeparator,
      defaultCompressionLevel: this.defaultCompressionLevel,
      defaultCompressionAlgorithm: this.defaultCompressionAlgorithm,
      hasEncryptionKey: !!this.encryptionKey,
      reportProgress: (info) => this.reportProgress(options, info),
      getEncryptionAAD: (compressionAlgorithm) =>
        buildEncryptionAAD({ compressionAlgorithm, pipelineVersion: 4 }),
      finalize: (
        workingData,
        compressionAlgorithm,
        isEncrypted,
        checksum,
        shouldChecksum,
        checksumScope,
        chunkSize,
        chunkSeparator,
      ) =>
        this.finalizeEncode(
          workingData,
          compressionAlgorithm,
          isEncrypted,
          checksum,
          shouldChecksum,
          checksumScope,
          chunkSize,
          chunkSeparator,
          options,
        ),
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
    checksumScope: "plaintext" | "output",
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
    let result = encodePayload(
      workingData,
      compressionAlgorithm,
      isEncrypted,
      options,
      this.getPayloadCodecContext(),
    );

    // 후처리 (난독화, 체크섬, URL-safe, 청킹)
    result = this.applyPostEncoding(
      result,
      options,
      checksum,
      shouldChecksum,
      checksumScope,
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
    checksumScope: "plaintext" | "output",
    chunkSize: number | undefined,
    chunkSeparator: string,
  ): string {
    return applyEncodePostProcessing({
      encoded,
      options,
      checksum,
      shouldChecksum,
      checksumScope,
      chunkSize,
      chunkSeparator,
      urlSafe: this.urlSafe,
      shouldObfuscate: (callOptions) => this.shouldObfuscate(callOptions),
      getObfuscationLayer: () => this.getObfuscationLayer(),
      assertSafeChunkSeparator: (value, separator) =>
        this.assertSafeChunkSeparator(value, separator),
    });
  }

  /**
   * 디코딩 전처리: 동기/비동기 디코딩에서 공통으로 쓰는 순수 동기 단계.
   * 청크 제거 → URL-safe 역변환 → 체크섬 추출 → 역난독화 → 푸터 파싱 →
   * 검증(정렬/패딩/크기) → 비트팩 해제까지 수행합니다.
   */
  private decodePrelude(input: string, options: DduOptions | undefined): DecodePreludeResult {
    return runDecodePrelude(input, options, {
      defaultChecksum: this.defaultChecksum,
      defaultChunkSeparator: this.defaultChunkSeparator,
      defaultMaxDecodedBytes: this.defaultMaxDecodedBytes,
      urlSafe: this.urlSafe,
      paddingChar: this.paddingChar,
      bitLength: this.bitLength,
      bitsPerPadChar: this.bitsPerPadChar,
      usePowerOfTwo: this.usePowerOfTwo,
      dduCharCodeLookup: this.dduCharCodeLookup,
      charSetSize: this.dduChar.length,
      encryptionKey: this.encryptionKey,
      defaultRequireEncryption: this.defaultRequireEncryption,
      shouldObfuscate: (callOptions) => this.shouldObfuscate(callOptions),
      deobfuscate: (value) => this.getObfuscationLayer().deobfuscate(value),
      decodeChars: (cleanedInput, paddingBits) =>
        decodePayload(cleanedInput, paddingBits, this.getPayloadCodecContext()),
      reportDecodeStart: (totalBytes) => {
        this.reportProgress(options, {
          processedBytes: 0,
          totalBytes,
          percent: 0,
          stage: "start",
        });
      },
      reportBitpackDecode: (processedBytes, totalBytes) => {
        this.reportProgress(options, {
          processedBytes,
          totalBytes,
          percent: 30,
          stage: "decode",
        });
      },
    });
  }

  private getPayloadCodecContext(): PayloadCodecContext {
    return this.payloadCodecContext;
  }

  private reportProgress(options: DduOptions | undefined, info: DduProgressInfo): void {
    (options?.onProgress ?? this.defaultOnProgress)?.(info);
  }

  // ─── 동기 암호화/압축 헬퍼 ───────────────────────────────────────

  private encryptSync(data: Uint8Array, aad?: Uint8Array): Uint8Array {
    try {
      return encryptSyncWithAdapter(this.getSyncGatewayContext(), data, aad);
    } catch (err) {
      if (isDdu64Error(err)) throw err;
      const message = toErrorMessage(err);
      if (isAdapterCapabilityErrorMessage(message)) {
        throw wrapDdu64Error(err, "encode");
      }
      throw new Ddu64EncryptionError(message, err);
    }
  }

  private decryptSync(data: Uint8Array, aad?: Uint8Array): Uint8Array {
    try {
      return decryptSyncWithAdapter(this.getSyncGatewayContext(), data, aad);
    } catch (err) {
      if (isDdu64Error(err)) throw err;
      const message = toErrorMessage(err);
      if (isAdapterCapabilityErrorMessage(message)) {
        throw wrapDdu64Error(err, "decode");
      }
      throw new Ddu64DecryptionError(message, err);
    }
  }

  private compressSync(
    data: Uint8Array,
    algorithm: "deflate" | "brotli",
    level: number,
  ): Uint8Array {
    try {
      return compressSyncWithAdapter(this.adapter, data, algorithm, level);
    } catch (err) {
      if (isDdu64Error(err)) throw err;
      const message = toErrorMessage(err);
      if (isAdapterCapabilityErrorMessage(message)) {
        throw wrapDdu64Error(err, "encode");
      }
      throw new Ddu64CompressionError(message, err);
    }
  }

  private decompressSync(
    data: Uint8Array,
    algorithm: "deflate" | "brotli",
    maxBytes: number,
  ): Uint8Array {
    try {
      return decompressSyncWithAdapter(this.adapter, data, algorithm, maxBytes);
    } catch (err) {
      if (isDdu64Error(err)) throw err;
      const message = toErrorMessage(err);
      if (isAdapterCapabilityErrorMessage(message)) {
        throw wrapDdu64Error(err, "decode");
      }
      throw new Ddu64DecompressionError(message, err);
    }
  }

  private getSyncGatewayContext(): SyncAdapterGatewayContext {
    if (!this.syncGatewayContext) {
      // adapter/encryptionKey/keyDerivation은 생성 후 불변이므로 한 번만 구성합니다.
      // encryptionKeyHash는 지연 파생되며, 유일한 writer인 setEncryptionKeyHash에서
      // 인스턴스 필드와 캐시 컨텍스트를 함께 갱신해 일관성을 유지합니다.
      const ctx: SyncAdapterGatewayContext = {
        adapter: this.adapter,
        encryptionKey: this.encryptionKey,
        keyDerivation: this.keyDerivation,
        encryptionKeyHash: this.encryptionKeyHash,
        setEncryptionKeyHash: (hash: Uint8Array) => {
          this.encryptionKeyHash = hash;
          ctx.encryptionKeyHash = hash;
        },
      };
      this.syncGatewayContext = ctx;
    }
    return this.syncGatewayContext;
  }

  // ─── 난독화 헬퍼 ───────────────────────────────────────────────────

  /**
   * 난독화 레이어를 가져오거나 생성합니다 (지연 초기화).
   * 알파벳에는 charset 문자, 패딩 문자, 모든 푸터 마커 문자가 포함됩니다.
   */
  private getObfuscationLayer(): ObfuscationLayer {
    if (!this.obfuscationLayer) {
      this.obfuscationLayer = new HangulObfuscationLayer(
        buildObfuscationAlphabet(this.dduChar, this.paddingChar),
      );
    }
    return this.obfuscationLayer;
  }

  /**
   * 주어진 호출에 난독화를 적용해야 하는지 결정합니다.
   * 호출별 옵션이 생성자 기본값을 오버라이드합니다.
   * 암호화 키 없이 난독화가 활성화되면 throw합니다.
   */
  private shouldObfuscate(options?: DduOptions): boolean {
    const obfuscate = options?.obfuscate ?? this.defaultObfuscate;
    if (!obfuscate) return false;
    if (!this.encryptionKey || options?.encrypt === false) {
      throw new Ddu64ObfuscationError(
        "[Ddu64 obfuscation] Obfuscation requires encryption to be enabled.",
      );
    }
    return true;
  }

  // ─── 유틸리티 메서드 ───────────────────────────────────────────────────────

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
}

function validateFinalCharsetConfiguration(
  charSet: string[],
  paddingChar: string,
  requiredLength: number,
  isPredefined: boolean,
  requestUrlSafe: boolean,
  shouldThrow: boolean,
): boolean {
  try {
    if (!isPredefined) {
      validateCombinationDuplicates(charSet, paddingChar, requiredLength);
    }
    return requestUrlSafe ? isUrlSafeCompatible(charSet, paddingChar, shouldThrow) : false;
  } catch (error) {
    if (isDdu64Error(error)) throw error;
    throw new Ddu64CharsetError(toErrorMessage(error), error);
  }
}
