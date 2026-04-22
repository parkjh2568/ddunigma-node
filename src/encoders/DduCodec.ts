import { Transform, type TransformCallback } from "stream";
import { deflateSync, brotliCompressSync, brotliDecompressSync, constants } from "zlib";
import { Ddu64 } from "./Ddu64";
import type {
  DduCodecConfig,
  DduCodecEncodeOptions,
  DduCodecDecodeOptions,
  DduCodecInfo,
  DduCodecInspection,
  DduCodecLimits,
  DduCodecCompatibility,
  DduCodecValidation,
} from "../types";
import {
  DduCompatibilityError,
  DduConfigError,
  DduDecodeError,
} from "../errors";
import {
  deriveKey,
  encryptAes256Gcm,
  decryptAes256Gcm,
  inflateWithLimit,
} from "../utils/crypto";
import {
  calculateCRC32,
  splitIntoChunksFast,
  removeChunksFast,
  toUrlSafeFast,
  fromUrlSafeFast,
} from "../utils/codecUtils";
import {
  createDecodeStream as createLegacyDecodeStream,
} from "../utils/DduStream";

// ============================================================================
// 상수
// ============================================================================

/** v3 block 페이로드 버전 태그 */
const BLOCK_VERSION_TAG = "DDU3";

/** v3 stream 페이로드 버전 태그 */
const STREAM_VERSION_TAG = "DDS3";

/** 압축 코드 매핑 */
const COMPRESSION_CODE = {
  none: "N",
  deflate: "D",
  brotli: "B",
} as const;

const DEFAULT_MAX_DECODED_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;
const DEFAULT_COMPRESSION_LEVEL = 6;

// ============================================================================
// 내부 helper 타입
// ============================================================================

type CompressionAlgo = "deflate" | "brotli";

interface ResolvedDefaults {
  compression: { enabled: boolean; algorithm: CompressionAlgo; level: number };
  checksum: boolean;
  chunking: { size: number | undefined; separator: string };
  urlSafe: boolean;
  encryptionKeyHash: Buffer | undefined;
}

interface BlockFooter {
  compressionAlgorithm: CompressionAlgo | undefined;
  encrypted: boolean;
  paddingBits: number;
  checksum: string | undefined;
}

interface StreamHeaderMeta {
  compressionAlgorithm: CompressionAlgo | undefined;
  encrypted: boolean;
}

// ============================================================================
// DduCodec 클래스
// ============================================================================

/**
 * v3 native 인코더/디코더
 *
 * `Ddu64` 와 별도의 클래스로 분리된 새 API. object-first config, DDU3/DDS3
 * wire format, 명시적 호환성 정책을 가진다.
 *
 * @example
 * const codec = new DduCodec({
 *   preset: DduSetSymbol.ONECHARSET,
 *   defaults: {
 *     compression: { enabled: true, algorithm: "brotli", level: 6 },
 *     encryptionKey: "secret"
 *   }
 * });
 *
 * const encoded = codec.encode("Hello");
 * const decoded = codec.decode(encoded);
 */
export class DduCodec {
  /** 내부 byte-level codec (호환 경로 활용) */
  private readonly inner: Ddu64;

  /** 결정된 기본값 스냅샷 */
  private readonly resolvedDefaults: ResolvedDefaults;

  /** 결정된 limits 스냅샷 */
  private readonly resolvedLimits: Required<DduCodecLimits>;

  /** 결정된 compatibility 스냅샷 */
  private readonly resolvedCompatibility: Required<DduCodecCompatibility>;

  /** 결정된 validation 스냅샷 */
  private readonly resolvedValidation: Required<DduCodecValidation>;

  /** Buffer 인코딩 */
  private readonly encoding: BufferEncoding;

  constructor(config: DduCodecConfig = {}) {
    this.encoding = config.encoding ?? "utf-8";

    // strict validation: 옵션 충돌 즉시 reject
    this.resolvedValidation = { strict: config.validation?.strict ?? false };

    // limits 정규화
    this.resolvedLimits = {
      maxDecodedBytes: this.normalizeLimit(
        config.limits?.maxDecodedBytes,
        DEFAULT_MAX_DECODED_BYTES,
        "maxDecodedBytes"
      ),
      maxDecompressedBytes: this.normalizeLimit(
        config.limits?.maxDecompressedBytes,
        DEFAULT_MAX_DECOMPRESSED_BYTES,
        "maxDecompressedBytes"
      ),
    };

    // compatibility 정규화 (기본값: explicit)
    const legacy = config.compatibility?.legacyDecode ?? "explicit";
    if (legacy !== "off" && legacy !== "explicit" && legacy !== "on") {
      throw new DduConfigError(
        `Invalid compatibility.legacyDecode value: "${String(legacy)}". Expected "off" | "explicit" | "on".`,
        { code: "DDU_CONFIG_INVALID" }
      );
    }
    this.resolvedCompatibility = { legacyDecode: legacy };

    // compression defaults
    const compDefault = config.defaults?.compression ?? {};
    const algorithm: CompressionAlgo = compDefault.algorithm ?? "deflate";
    const level = this.normalizeCompressionLevel(
      compDefault.level ?? DEFAULT_COMPRESSION_LEVEL,
      algorithm
    );

    this.resolvedDefaults = {
      compression: {
        enabled: compDefault.enabled ?? false,
        algorithm,
        level,
      },
      checksum: config.defaults?.checksum ?? false,
      chunking: {
        size: config.defaults?.chunking?.size,
        separator: config.defaults?.chunking?.separator ?? "\n",
      },
      urlSafe: config.defaults?.urlSafe ?? false,
      encryptionKeyHash: config.defaults?.encryptionKey
        ? deriveKey(config.defaults.encryptionKey)
        : undefined,
    };

    // 내부 Ddu64 구성: byte-level 인코딩만 사용. compression/encryption/checksum
    // /urlSafe 는 DduCodec 레이어가 직접 관리한다.
    try {
      this.inner = new Ddu64(config.charset, config.padding, {
        dduSetSymbol: config.preset,
        usePowerOfTwo: config.usePowerOfTwo,
        encoding: this.encoding,
        throwOnError: true,
        // 아래는 모두 false: DduCodec 가 직접 관리
        compress: false,
        checksum: false,
        urlSafe: false,
        // limits 는 inner 에도 동일하게 전달하여 안전망 제공
        maxDecodedBytes: this.resolvedLimits.maxDecodedBytes,
        maxDecompressedBytes: this.resolvedLimits.maxDecompressedBytes,
      });
    } catch (e) {
      throw new DduConfigError(
        `Failed to initialize codec: ${(e as Error).message}`,
        { code: "DDU_CONFIG_INVALID", cause: e }
      );
    }
  }

  // --------------------------------------------------------------------------
  // 공개 API
  // --------------------------------------------------------------------------

  /**
   * 입력 데이터를 인코딩한다.
   * 반환 형식: `<body><pad>DDU3;<comp>;<enc>;<padBits>[;crc32:<hex>]`
   */
  encode(input: Buffer | string, options?: DduCodecEncodeOptions): string {
    return this.encodeInternal(input, options).encoded;
  }

  /**
   * 인코딩된 문자열을 원본 문자열로 디코딩한다.
   */
  decode(input: string, options?: DduCodecDecodeOptions): string {
    return this.decodeToBuffer(input, options).toString(this.encoding);
  }

  /**
   * 인코딩된 문자열을 Buffer 로 디코딩한다.
   */
  decodeToBuffer(input: string, options?: DduCodecDecodeOptions): Buffer {
    const policy =
      options?.compatibility?.legacyDecode ??
      this.resolvedCompatibility.legacyDecode;
    const limits = this.mergeLimits(options?.limits);

    // URL-Safe 역변환은 항상 시도 (transport-layer transformation)
    const normalized = removeChunksFast(input, this.resolvedDefaults.chunking.separator);
    const candidate = this.resolvedDefaults.urlSafe
      ? fromUrlSafeFast(normalized)
      : normalized;

    const v3Parsed = this.tryParseV3Footer(candidate);

    if (v3Parsed) {
      return this.decodeV3Body(candidate, v3Parsed, limits);
    }

    // v3 푸터 부재 → 호환 정책 적용
    if (policy === "off") {
      throw new DduCompatibilityError(
        `Legacy payload rejected by legacyDecode="off". Expected ${BLOCK_VERSION_TAG} payload.`,
        { code: "DDU_COMPAT_LEGACY_REJECTED" }
      );
    }

    return this.decodeLegacy(candidate, limits);
  }

  /**
   * 비동기 인코딩.
   */
  async encodeAsync(
    input: Buffer | string,
    options?: DduCodecEncodeOptions
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
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
   * 비동기 디코딩.
   */
  async decodeAsync(
    input: string,
    options?: DduCodecDecodeOptions
  ): Promise<string> {
    const buffer = await this.decodeToBufferAsync(input, options);
    return buffer.toString(this.encoding);
  }

  /**
   * 비동기 Buffer 디코딩.
   */
  async decodeToBufferAsync(
    input: string,
    options?: DduCodecDecodeOptions
  ): Promise<Buffer> {
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

  /**
   * 입력에 대한 인코딩 결과 메타데이터를 반환한다.
   */
  inspect(input: Buffer | string, options?: DduCodecEncodeOptions): DduCodecInspection {
    const originalBuffer =
      typeof input === "string" ? Buffer.from(input, this.encoding) : input;
    const result = this.encodeInternal(input, options);
    const charsetInfo = this.inner.getCharSetInfo();

    return {
      originalSize: originalBuffer.length,
      encodedSize: result.encoded.length,
      compressedSize: result.compressedSize,
      compressionRatio:
        result.compressedSize !== undefined && originalBuffer.length > 0
          ? result.compressedSize / originalBuffer.length
          : undefined,
      expansionRatio:
        originalBuffer.length > 0 ? result.encoded.length / originalBuffer.length : 0,
      charsetSize: charsetInfo.charSet.length,
      bitLength: charsetInfo.bitLength,
      wireFormat: "DDU3",
      compressionAlgorithm: result.compressionAlgorithm,
      encrypted: result.encrypted,
      hasChecksum: result.hasChecksum,
    };
  }

  /**
   * 현재 codec 설정 스냅샷을 반환한다.
   */
  getCodecInfo(): DduCodecInfo {
    const inner = this.inner.getCharSetInfo();
    return {
      charSet: inner.charSet,
      paddingChar: inner.paddingChar,
      charLength: inner.charLength,
      bitLength: inner.bitLength,
      usePowerOfTwo: inner.usePowerOfTwo,
      encoding: this.encoding,
      defaults: {
        compression: { ...this.resolvedDefaults.compression },
        checksum: this.resolvedDefaults.checksum,
        chunking: { ...this.resolvedDefaults.chunking },
        urlSafe: this.resolvedDefaults.urlSafe,
        hasEncryptionKey: !!this.resolvedDefaults.encryptionKeyHash,
      },
      limits: { ...this.resolvedLimits },
      compatibility: { ...this.resolvedCompatibility },
      validation: { ...this.resolvedValidation },
      wireFormat: { block: BLOCK_VERSION_TAG, stream: STREAM_VERSION_TAG },
    };
  }

  /**
   * Instance-bound encode stream.
   */
  createEncodeStream(): NodeJS.ReadWriteStream {
    const encodeStreamPayload = this.encodeStreamPayload.bind(this);
    const chunks: Buffer[] = [];

    return new Transform({
      readableObjectMode: false,
      writableObjectMode: false,
      transform(
        this: Transform,
        chunk: Buffer | string,
        encoding: BufferEncoding,
        callback: TransformCallback
      ): void {
        try {
          chunks.push(
            Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(chunk, encoding)
          );
          callback();
        } catch (e) {
          callback(e as Error);
        }
      },
      flush(this: Transform, callback: TransformCallback): void {
        try {
          this.push(encodeStreamPayload(Buffer.concat(chunks)));
          callback();
        } catch (e) {
          callback(e as Error);
        }
      },
    });
  }

  /**
   * Instance-bound decode stream.
   */
  createDecodeStream(): NodeJS.ReadWriteStream {
    const decodeStreamPayload = this.decodeStreamPayload.bind(this);
    const chunks: Buffer[] = [];

    return new Transform({
      readableObjectMode: false,
      writableObjectMode: false,
      transform(
        this: Transform,
        chunk: Buffer | string,
        encoding: BufferEncoding,
        callback: TransformCallback
      ): void {
        try {
          chunks.push(
            Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(chunk, encoding)
          );
          callback();
        } catch (e) {
          callback(e as Error);
        }
      },
      flush(this: Transform, callback: TransformCallback): void {
        decodeStreamPayload(Buffer.concat(chunks).toString("utf-8"))
          .then((decoded) => {
            this.push(decoded);
            callback();
          })
          .catch((error) => callback(error as Error));
      },
    });
  }

  // --------------------------------------------------------------------------
  // 내부 - encode pipeline
  // --------------------------------------------------------------------------

  private encodeInternal(
    input: Buffer | string,
    options?: DduCodecEncodeOptions
  ): {
    encoded: string;
    compressedSize?: number;
    compressionAlgorithm?: CompressionAlgo;
    encrypted: boolean;
    hasChecksum: boolean;
  } {
    const merged = this.mergeEncodeOptions(options);

    let buffer: Buffer =
      typeof input === "string" ? Buffer.from(input, this.encoding) : Buffer.from(input);

    // 1) 압축
    let compressionAlgo: CompressionAlgo | undefined;
    let compressedSize: number | undefined;
    if (merged.compression) {
      const compressed = this.compress(
        buffer,
        merged.compression.algorithm,
        merged.compression.level
      );
      compressedSize = compressed.length;
      // 압축이 실제로 효과 있을 때만 적용
      if (compressed.length < buffer.length) {
        buffer = compressed;
        compressionAlgo = merged.compression.algorithm;
      }
    }

    // 2) 암호화
    let encrypted = false;
    if (this.resolvedDefaults.encryptionKeyHash) {
      buffer = encryptAes256Gcm(buffer, this.resolvedDefaults.encryptionKeyHash);
      encrypted = true;
    }

    // 3) 체크섬 (암호화/압축 후 wire bytes 기준)
    let checksumHex: string | undefined;
    if (merged.checksum) {
      checksumHex = calculateCRC32(buffer);
    }

    // 4) byte-level encode → body + paddingBits
    const { body, paddingBits } = this.encodeBody(buffer);

    // 5) v3 footer 조립
    const compCode = compressionAlgo
      ? COMPRESSION_CODE[compressionAlgo]
      : COMPRESSION_CODE.none;
    const encFlag = encrypted ? "1" : "0";
    const padChar = this.inner.getCharSetInfo().paddingChar;

    let footer = `${padChar}${BLOCK_VERSION_TAG};${compCode};${encFlag};${paddingBits}`;
    if (checksumHex) {
      footer += `;crc32:${checksumHex}`;
    }

    let encoded = body + footer;

    // 6) URL-Safe transformation (footer 포함, 문자 충돌 없는 경우만 활성)
    if (this.resolvedDefaults.urlSafe) {
      encoded = toUrlSafeFast(encoded);
    }

    // 7) 청크 분할
    if (merged.chunking && merged.chunking.size > 0) {
      encoded = splitIntoChunksFast(encoded, merged.chunking.size, merged.chunking.separator);
    }

    return {
      encoded,
      compressedSize,
      compressionAlgorithm: compressionAlgo,
      encrypted,
      hasChecksum: !!checksumHex,
    };
  }

  /**
   * Inner Ddu64 로 byte-level encode 수행 후 body 와 paddingBits 분리.
   */
  private encodeBody(buffer: Buffer): { body: string; paddingBits: number } {
    if (buffer.length === 0) return { body: "", paddingBits: 0 };

    // encodeRawBuffer 호출 시 compression/encrypted 마커 없이 호출
    // → 결과 형식: "<body>" 또는 "<body><pad><digits>"
    const raw = this.inner.encodeRawBuffer(buffer, {
      encrypted: false,
      compressionAlgorithm: undefined,
    });

    const padChar = this.inner.getCharSetInfo().paddingChar;
    const padIdx = raw.lastIndexOf(padChar);

    if (padIdx === -1) {
      return { body: raw, paddingBits: 0 };
    }

    const tail = raw.slice(padIdx + padChar.length);
    if (!/^\d+$/.test(tail)) {
      // 데이터에 우연히 들어간 paddingChar — footer 없음으로 간주
      return { body: raw, paddingBits: 0 };
    }

    const paddingBits = parseInt(tail, 10);
    return { body: raw.slice(0, padIdx), paddingBits };
  }

  private encodeStreamPayload(buffer: Buffer): string {
    let working: Buffer = Buffer.from(buffer);

    let compressionAlgorithm: CompressionAlgo | undefined;
    if (this.resolvedDefaults.compression.enabled) {
      const compressed = this.compress(
        working,
        this.resolvedDefaults.compression.algorithm,
        this.resolvedDefaults.compression.level
      );
      if (compressed.length < working.length) {
        working = Buffer.from(compressed);
        compressionAlgorithm = this.resolvedDefaults.compression.algorithm;
      }
    }

    let encrypted = false;
    if (this.resolvedDefaults.encryptionKeyHash) {
      working = Buffer.from(
        encryptAes256Gcm(working, this.resolvedDefaults.encryptionKeyHash)
      );
      encrypted = true;
    }

    const encodedBody = this.inner.encodeRawBuffer(working, {
      encrypted: false,
      compressionAlgorithm: undefined,
    });
    const padChar = this.inner.getCharSetInfo().paddingChar;
    const compCode = compressionAlgorithm
      ? COMPRESSION_CODE[compressionAlgorithm]
      : COMPRESSION_CODE.none;
    const encCode = encrypted ? "1" : "0";

    let encoded = `${padChar}${STREAM_VERSION_TAG}${compCode}${encCode}${padChar}${encodedBody}`;
    if (this.resolvedDefaults.urlSafe) {
      encoded = toUrlSafeFast(encoded);
    }
    return encoded;
  }

  // --------------------------------------------------------------------------
  // 내부 - decode pipeline
  // --------------------------------------------------------------------------

  private decodeV3Body(
    candidate: string,
    footer: { body: string; meta: BlockFooter },
    limits: Required<DduCodecLimits>
  ): Buffer {
    const { body, meta } = footer;

    if (meta.encrypted && !this.resolvedDefaults.encryptionKeyHash) {
      throw new DduDecodeError(
        `Encrypted ${BLOCK_VERSION_TAG} payload requires encryptionKey.`,
        { code: "DDU_DECODE_KEY_MISSING" }
      );
    }

    // 1) byte-level decode: body+pad+digits 형태로 inner 에 전달
    const padChar = this.inner.getCharSetInfo().paddingChar;
    const synthesized = body.length === 0
      ? ""
      : meta.paddingBits > 0
        ? `${body}${padChar}${meta.paddingBits}`
        : body;

    let decoded: Buffer;
    try {
      decoded = this.inner.decodeToBuffer(synthesized, {
        compress: false,
        encrypt: false,
        checksum: false,
        maxDecodedBytes: limits.maxDecodedBytes,
      });
    } catch (e) {
      throw new DduDecodeError(
        `Failed to decode ${BLOCK_VERSION_TAG} body: ${(e as Error).message}`,
        { code: "DDU_DECODE_CORRUPTED", cause: e }
      );
    }

    // 2) 체크섬 검증 (압축/암호화 wire bytes 에 대해 계산했으므로 같은 시점 검증)
    if (meta.checksum) {
      const actual = calculateCRC32(decoded);
      if (actual !== meta.checksum) {
        throw new DduDecodeError(
          `Checksum mismatch. Expected: ${meta.checksum}, Got: ${actual}`,
          { code: "DDU_DECODE_CHECKSUM_MISMATCH" }
        );
      }
    }

    // 3) 복호화
    if (meta.encrypted) {
      try {
        decoded = decryptAes256Gcm(decoded, this.resolvedDefaults.encryptionKeyHash!);
      } catch (e) {
        throw new DduDecodeError(
          `Failed to decrypt payload: ${(e as Error).message}`,
          { code: "DDU_DECODE_KEY_INVALID", cause: e }
        );
      }
    }

    // 4) 압축 해제
    if (meta.compressionAlgorithm) {
      decoded = this.decompress(
        decoded,
        meta.compressionAlgorithm,
        limits.maxDecompressedBytes
      );
    }

    return decoded;
  }

  private decodeV3StreamBody(
    body: string,
    header: StreamHeaderMeta,
    limits: Required<DduCodecLimits>
  ): Buffer {
    if (header.encrypted && !this.resolvedDefaults.encryptionKeyHash) {
      throw new DduDecodeError(
        `Encrypted ${STREAM_VERSION_TAG} payload requires encryptionKey.`,
        { code: "DDU_DECODE_KEY_MISSING" }
      );
    }

    let decoded: Buffer;
    try {
      decoded = this.inner.decodeToBuffer(body, {
        compress: false,
        encrypt: false,
        checksum: false,
        maxDecodedBytes: limits.maxDecodedBytes,
      });
    } catch (e) {
      throw new DduDecodeError(
        `Failed to decode ${STREAM_VERSION_TAG} body: ${(e as Error).message}`,
        { code: "DDU_DECODE_CORRUPTED", cause: e }
      );
    }

    if (header.encrypted) {
      try {
        decoded = decryptAes256Gcm(decoded, this.resolvedDefaults.encryptionKeyHash!);
      } catch (e) {
        throw new DduDecodeError(
          `Failed to decrypt stream payload: ${(e as Error).message}`,
          { code: "DDU_DECODE_KEY_INVALID", cause: e }
        );
      }
    }

    if (header.compressionAlgorithm) {
      decoded = this.decompress(
        decoded,
        header.compressionAlgorithm,
        limits.maxDecompressedBytes
      );
    }

    return decoded;
  }

  private decodeLegacy(input: string, limits: Required<DduCodecLimits>): Buffer {
    try {
      return this.inner.decodeToBuffer(input, {
        maxDecodedBytes: limits.maxDecodedBytes,
        maxDecompressedBytes: limits.maxDecompressedBytes,
      });
    } catch (e) {
      throw new DduDecodeError(
        `Legacy decode failed: ${(e as Error).message}`,
        { code: "DDU_DECODE_INVALID_FORMAT", cause: e }
      );
    }
  }

  private async decodeStreamPayload(input: string): Promise<Buffer> {
    const policy = this.resolvedCompatibility.legacyDecode;
    const limits = this.resolvedLimits;
    const normalized = removeChunksFast(input, this.resolvedDefaults.chunking.separator);
    const candidate = this.resolvedDefaults.urlSafe
      ? fromUrlSafeFast(normalized)
      : normalized;

    const v3Stream = this.tryParseV3StreamHeader(candidate);
    if (v3Stream) {
      return this.decodeV3StreamBody(v3Stream.body, v3Stream.meta, limits);
    }

    if (policy === "off") {
      throw new DduCompatibilityError(
        `Legacy stream payload rejected by legacyDecode="off". Expected ${STREAM_VERSION_TAG} payload.`,
        { code: "DDU_COMPAT_LEGACY_REJECTED" }
      );
    }

    return this.decodeLegacyStream(candidate, limits);
  }

  /**
   * v3 푸터 파싱 시도. 일치 시 body 와 meta 반환, 아니면 null.
   */
  private tryParseV3Footer(
    input: string
  ): { body: string; meta: BlockFooter } | null {
    const padChar = this.inner.getCharSetInfo().paddingChar;
    // 마지막 padChar+DDU3; 위치 검색
    const marker = `${padChar}${BLOCK_VERSION_TAG};`;
    const markerIdx = input.lastIndexOf(marker);
    if (markerIdx === -1) return null;

    const body = input.slice(0, markerIdx);
    const meta = input.slice(markerIdx + marker.length);

    // metadata 파싱: <comp>;<enc>;<padBits>[;crc32:<hex>]
    const parts = meta.split(";");
    if (parts.length < 3 || parts.length > 4) {
      throw new DduDecodeError(
        `Invalid ${BLOCK_VERSION_TAG} footer: expected 3 or 4 fields, got ${parts.length}`,
        { code: "DDU_DECODE_INVALID_FORMAT" }
      );
    }

    const [compCode, encFlag, padBitsStr, checksumField] = parts;

    let compressionAlgorithm: CompressionAlgo | undefined;
    if (compCode === COMPRESSION_CODE.none) {
      compressionAlgorithm = undefined;
    } else if (compCode === COMPRESSION_CODE.deflate) {
      compressionAlgorithm = "deflate";
    } else if (compCode === COMPRESSION_CODE.brotli) {
      compressionAlgorithm = "brotli";
    } else {
      throw new DduDecodeError(
        `Invalid ${BLOCK_VERSION_TAG} compression code: "${compCode}"`,
        { code: "DDU_DECODE_INVALID_FORMAT" }
      );
    }

    if (encFlag !== "0" && encFlag !== "1") {
      throw new DduDecodeError(
        `Invalid ${BLOCK_VERSION_TAG} encrypted flag: "${encFlag}"`,
        { code: "DDU_DECODE_INVALID_FORMAT" }
      );
    }

    const paddingBits = parseInt(padBitsStr, 10);
    if (!Number.isFinite(paddingBits) || paddingBits < 0 || padBitsStr !== paddingBits.toString()) {
      throw new DduDecodeError(
        `Invalid ${BLOCK_VERSION_TAG} paddingBits: "${padBitsStr}"`,
        { code: "DDU_DECODE_INVALID_FORMAT" }
      );
    }

    let checksum: string | undefined;
    if (checksumField !== undefined) {
      const match = /^crc32:([0-9a-f]{8})$/i.exec(checksumField);
      if (!match) {
        throw new DduDecodeError(
          `Invalid ${BLOCK_VERSION_TAG} checksum field: "${checksumField}"`,
          { code: "DDU_DECODE_INVALID_FORMAT" }
        );
      }
      checksum = match[1].toLowerCase();
    }

    return {
      body,
      meta: { compressionAlgorithm, encrypted: encFlag === "1", paddingBits, checksum },
    };
  }

  private tryParseV3StreamHeader(
    input: string
  ): { body: string; meta: StreamHeaderMeta } | null {
    const padChar = this.inner.getCharSetInfo().paddingChar;
    if (!input.startsWith(padChar)) {
      return null;
    }

    const prefix = `${padChar}${STREAM_VERSION_TAG}`;
    if (!input.startsWith(prefix)) {
      return null;
    }

    const padLen = padChar.length;
    const metaStart = prefix.length;
    const terminatorStart = metaStart + 2;
    const minLength = terminatorStart + padLen;
    if (input.length < minLength) {
      throw new DduDecodeError(
        `Incomplete ${STREAM_VERSION_TAG} header.`,
        { code: "DDU_DECODE_INVALID_FORMAT" }
      );
    }

    const compCode = input[metaStart];
    const encFlag = input[metaStart + 1];
    const terminator = input.slice(terminatorStart, terminatorStart + padLen);

    if (terminator !== padChar) {
      throw new DduDecodeError(
        `Invalid ${STREAM_VERSION_TAG} header terminator.`,
        { code: "DDU_DECODE_INVALID_FORMAT" }
      );
    }

    let compressionAlgorithm: CompressionAlgo | undefined;
    if (compCode === COMPRESSION_CODE.none) {
      compressionAlgorithm = undefined;
    } else if (compCode === COMPRESSION_CODE.deflate) {
      compressionAlgorithm = "deflate";
    } else if (compCode === COMPRESSION_CODE.brotli) {
      compressionAlgorithm = "brotli";
    } else {
      throw new DduDecodeError(
        `Invalid ${STREAM_VERSION_TAG} compression code: "${compCode}"`,
        { code: "DDU_DECODE_INVALID_FORMAT" }
      );
    }

    if (encFlag !== "0" && encFlag !== "1") {
      throw new DduDecodeError(
        `Invalid ${STREAM_VERSION_TAG} encrypted flag: "${encFlag}"`,
        { code: "DDU_DECODE_INVALID_FORMAT" }
      );
    }

    return {
      body: input.slice(minLength),
      meta: {
        compressionAlgorithm,
        encrypted: encFlag === "1",
      },
    };
  }

  // --------------------------------------------------------------------------
  // 내부 - util
  // --------------------------------------------------------------------------

  private mergeEncodeOptions(options?: DduCodecEncodeOptions): {
    compression: { algorithm: CompressionAlgo; level: number } | null;
    checksum: boolean;
    chunking: { size: number; separator: string } | null;
  } {
    const def = this.resolvedDefaults;

    let compression: { algorithm: CompressionAlgo; level: number } | null = null;
    if (options?.compression === false) {
      compression = null;
    } else if (options?.compression) {
      const algo = options.compression.algorithm ?? def.compression.algorithm;
      compression = {
        algorithm: algo,
        level: this.normalizeCompressionLevel(
          options.compression.level ?? def.compression.level,
          algo
        ),
      };
    } else if (def.compression.enabled) {
      compression = {
        algorithm: def.compression.algorithm,
        level: def.compression.level,
      };
    }

    let chunking: { size: number; separator: string } | null = null;
    if (options?.chunking === false) {
      chunking = null;
    } else if (options?.chunking) {
      chunking = {
        size: options.chunking.size,
        separator: options.chunking.separator ?? def.chunking.separator,
      };
    } else if (def.chunking.size && def.chunking.size > 0) {
      chunking = { size: def.chunking.size, separator: def.chunking.separator };
    }

    return {
      compression,
      checksum: options?.checksum ?? def.checksum,
      chunking,
    };
  }

  private mergeLimits(override?: DduCodecLimits): Required<DduCodecLimits> {
    return {
      maxDecodedBytes:
        override?.maxDecodedBytes !== undefined
          ? this.normalizeLimit(
              override.maxDecodedBytes,
              this.resolvedLimits.maxDecodedBytes,
              "maxDecodedBytes"
            )
          : this.resolvedLimits.maxDecodedBytes,
      maxDecompressedBytes:
        override?.maxDecompressedBytes !== undefined
          ? this.normalizeLimit(
              override.maxDecompressedBytes,
              this.resolvedLimits.maxDecompressedBytes,
              "maxDecompressedBytes"
            )
          : this.resolvedLimits.maxDecompressedBytes,
    };
  }

  private async decodeLegacyStream(
    input: string,
    limits: Required<DduCodecLimits>
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const stream = createLegacyDecodeStream(this.inner, {
        maxDecodedBytes: limits.maxDecodedBytes,
        maxDecompressedBytes: limits.maxDecompressedBytes,
      });
      const chunks: Buffer[] = [];

      stream.on("data", (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(chunk));
      });
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
      stream.end(Buffer.from(input, "utf-8"));
    });
  }

  private compress(buffer: Buffer, algorithm: CompressionAlgo, level: number): Buffer {
    if (algorithm === "brotli") {
      return brotliCompressSync(buffer, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: Math.min(11, Math.max(0, level)),
        },
      });
    }
    return deflateSync(buffer, { level: Math.min(9, Math.max(0, level)) });
  }

  private decompress(
    buffer: Buffer,
    algorithm: CompressionAlgo,
    maxBytes: number
  ): Buffer {
    if (algorithm === "brotli") {
      try {
        const inflated = brotliDecompressSync(buffer, { maxOutputLength: maxBytes });
        if (inflated.length > maxBytes) {
          throw new DduDecodeError(
            `Decompressed data exceeds limit. Size: ${inflated.length}, Limit: ${maxBytes}`,
            { code: "DDU_DECODE_LIMIT_EXCEEDED" }
          );
        }
        return inflated;
      } catch (e) {
        const err = e as { message?: string; code?: string };
        const msg = String(err?.message ?? "").toLowerCase();
        const code = String(err?.code ?? "");
        if (
          code === "ERR_BUFFER_TOO_LARGE" ||
          msg.includes("cannot create a buffer larger") ||
          msg.includes("buffer larger than") ||
          msg.includes("output length")
        ) {
          throw new DduDecodeError(
            `Decompressed data exceeds limit. Limit: ${maxBytes}`,
            { code: "DDU_DECODE_LIMIT_EXCEEDED", cause: e }
          );
        }
        if (e instanceof DduDecodeError) throw e;
        throw new DduDecodeError(
          `Brotli decompression failed: ${(e as Error).message}`,
          { code: "DDU_DECODE_CORRUPTED", cause: e }
        );
      }
    }
    try {
      return inflateWithLimit(buffer, maxBytes, "DduCodec decode");
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (msg.includes("exceeds limit")) {
        throw new DduDecodeError(msg, { code: "DDU_DECODE_LIMIT_EXCEEDED", cause: e });
      }
      throw new DduDecodeError(
        `Deflate decompression failed: ${msg}`,
        { code: "DDU_DECODE_CORRUPTED", cause: e }
      );
    }
  }

  private normalizeLimit(
    value: number | undefined,
    fallback: number,
    name: string
  ): number {
    if (value === undefined) return fallback;
    if (value === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
    if (!Number.isFinite(value) || value <= 0) {
      if (this.resolvedValidation?.strict) {
        throw new DduConfigError(
          `Invalid ${name}: must be a positive finite number or Infinity.`,
          { code: "DDU_CONFIG_INVALID" }
        );
      }
      return fallback;
    }
    return Math.floor(value);
  }

  private normalizeCompressionLevel(
    value: number | undefined,
    algorithm: CompressionAlgo
  ): number {
    const fallback = DEFAULT_COMPRESSION_LEVEL;
    const normalized =
      value === undefined || !Number.isFinite(value) ? fallback : Math.floor(value);
    return algorithm === "brotli"
      ? Math.min(11, Math.max(0, normalized))
      : Math.min(9, Math.max(0, normalized));
  }
}
