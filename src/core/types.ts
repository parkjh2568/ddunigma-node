/**
 * ddunigma 아이소모픽 라이브러리의 핵심 타입 정의.
 * 모든 타입 정의의 정규 소스입니다.
 *
 * @module core/types
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

export enum DduSetSymbol {
  DDU = "ddu",
  DDU_V1 = "ddu_v1",
  ONECHARSET = "oneCharSet",
}

/**
 * @deprecated ddunigma runtime string encode/decode paths are UTF-8 based.
 * This union remains for legacy type compatibility and `CharSetInfo.encoding`
 * metadata only; non-UTF-8 values do not change runtime text conversion.
 */
export type DduTextEncoding =
  | "utf-8"
  | "utf8"
  | "latin1"
  | "ascii"
  | "base64"
  | "base64url"
  | "hex"
  | "binary"
  | "ucs2"
  | "ucs-2"
  | "utf16le"
  | "utf-16le";

// ─── Charset Types ───────────────────────────────────────────────────────────

export interface EncodingProfile {
  /** 논리 심볼당 비트 수 */
  bitLength: number;
  /** 2의 제곱수 charset 직접 인덱스 모드 여부 */
  usePowerOfTwo: boolean;
  /** 반복 패딩 시 패딩 문자 1개가 나타내는 비트 수 */
  bitsPerPadChar?: number;
}

export interface CharSetConfig {
  /** charset 식별 심볼 */
  symbol: DduSetSymbol;
  /** 인코딩에 사용할 문자 배열 (codaChar가 있으면 기본 문자 배열) */
  charSet: string[];
  /** 종성 문자 배열 (charSet × codaChar 조합으로 최종 charset 생성) */
  codaChar?: string[];
  /** 최대 필요 문자 수 */
  maxRequiredLength: number;
  /** 비트 길이 (log2) */
  bitLength: number;
  /** 패딩 문자 */
  paddingChar: string;
  /** 패딩 문자 반복 방식 사용 여부 */
  useRepeatPadding?: boolean;
  /** 반복 패딩 시 패딩 문자 1개가 나타내는 비트 수 (기본값: 2) */
  bitsPerPadChar?: number;
  /** 2의 제곱수 모드 강제 여부 (false로 설정하면 인덱스 쌍 출력 모드 사용) */
  usePowerOfTwo?: boolean;
  /** 프리셋별 인코딩 프로필. 레거시 와이어 호환성을 고정할 때 사용 */
  encodingProfile?: EncodingProfile;
}

export interface CharSetInfo {
  /** 인코딩에 사용할 문자 배열 */
  charSet: string[];
  /** 패딩 문자 */
  paddingChar: string;
  /** 비트 길이 */
  bitLength: number;
  /** 2의 제곱수 charset 여부 */
  usePowerOfTwo: boolean;
  /** 문자열 인코딩 방식 */
  encoding: DduTextEncoding;
  /** 기본 압축 사용 여부 */
  defaultCompress: boolean;
  /** 기본 최대 디코딩 바이트 수 */
  defaultMaxDecodedBytes: number;
  /** 기본 최대 압축해제 바이트 수 */
  defaultMaxDecompressedBytes: number;
  /** URL-Safe 모드 여부 */
  urlSafe: boolean;
  /** 암호화 키 보유 여부 */
  hasEncryptionKey: boolean;
  /** 기본 체크섬 사용 여부 */
  defaultChecksum: boolean;
  /** 기본 체크섬 계산 범위 (5.0: "output") */
  defaultChecksumScope: "plaintext" | "output";
  /** 기본 난독화 사용 여부 */
  defaultObfuscate: boolean;
  /** WASM 사용 임계값 (바이트) */
  wasmThreshold: number;
  /** 기본 청크 크기 */
  defaultChunkSize: number | undefined;
  /** 기본 청크 구분자 */
  defaultChunkSeparator: string;
  /** 기본 압축 레벨 */
  defaultCompressionLevel: number;
  /** 기본 압축 알고리즘 */
  defaultCompressionAlgorithm: "deflate" | "brotli";
}

// ─── Progress & Stats ────────────────────────────────────────────────────────

/** 진행률 콜백 정보 */
export interface DduProgressInfo {
  /** 현재 처리된 바이트 수 (근사값) */
  processedBytes: number;
  /** 전체 바이트 수 */
  totalBytes: number;
  /** 진행률 (0-100, 단계별 근사값) */
  percent: number;
  /** 현재 처리 단계 */
  stage?:
    | "start"
    | "encrypt"
    | "compress"
    | "encode"
    | "decode"
    | "decompress"
    | "checksum"
    | "decrypt"
    | "done";
}

/** 인코딩 통계 정보 */
export interface DduEncodeStats {
  /** 원본 데이터 크기 (바이트) */
  originalSize: number;
  /** 인코딩된 문자열 길이 */
  encodedSize: number;
  /** 압축된 크기 (압축 사용시) */
  compressedSize?: number;
  /** 압축률 (0-1, 낮을수록 효율적) */
  compressionRatio?: number;
  /** 인코딩 확장 비율 */
  expansionRatio: number;
  /** 사용된 charset 크기 */
  charsetSize: number;
  /** 비트 길이 */
  bitLength: number;
}

// ─── Crypto Options ─────────────────────────────────────────────────────────

export type KeyDerivationAlgorithm = "sha256" | "pbkdf2";

export interface KeyDerivationOptions {
  /**
   * Key derivation algorithm. Defaults to `pbkdf2` (5.0).
   *
   * ⚠️ Migration: 4.x defaulted to `sha256`. Data encrypted with 4.x defaults must be decrypted with
   * `algorithm: "sha256"` explicitly (key derivation is NOT self-described in the wire format).
   * For low-entropy keys (human passwords), keep the `pbkdf2` default and provide an
   * application-specific `salt`. Use `sha256` only for high-entropy keys (e.g. 32 random bytes) or
   * legacy data compatibility.
   */
  algorithm?: KeyDerivationAlgorithm;
  /**
   * Salt for PBKDF2. Provide a stable, application-specific value to decode
   * across instances. If omitted, a fixed default salt is used (weaker — set
   * your own when security matters).
   */
  salt?: string | Uint8Array;
  /** PBKDF2 iteration count. Positive values below 10000 are clamped to 10000. */
  iterations?: number;
  /** Hash function used by PBKDF2. */
  hash?: "SHA-256" | "SHA-384" | "SHA-512";
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface DduOptions {
  /** 압축 사용 여부 (zlib deflate 또는 brotli) */
  compress?: boolean;
  /**
   * 내부 암/복호화 사용 여부 (기본값: true, 스트림 파이프라인 내부 제어용).
   * @internal 일반 사용자는 `encryptionKey`로 암호화를 제어하세요. 이 플래그는
   * 스트림/내부 파이프라인 전용이며 향후 공개 옵션에서 분리될 수 있습니다.
   */
  encrypt?: boolean;
  /** 압축 알고리즘 (기본값: "deflate") */
  compressionAlgorithm?: "deflate" | "brotli";
  /** 압축 레벨 (deflate 기본값: 6, brotli도 기본값 6을 사용하며 전달값은 0~11 범위로 보정) */
  compressionLevel?: number;
  /** 최대 디코딩 바이트 수 (Zip Bomb 방어) */
  maxDecodedBytes?: number;
  /** 최대 압축해제 바이트 수 (Zip Bomb 방어) */
  maxDecompressedBytes?: number;
  /** 체크섬 추가 여부 (CRC32) */
  checksum?: boolean;
  /**
   * 체크섬 계산 범위 (기본값: "output").
   * - `"plaintext"`: 원본 입력 바이트의 CRC32 (레거시 범위). 암호화와 함께 쓰면 평문 CRC가 출력에 노출됩니다.
   * - `"output"`: 인코딩 파이프라인 최종 바이트(압축/암호화 후, 와이어에 실리는 바이트)의 CRC32.
   *   암호화 시 평문 CRC를 노출하지 않고, 복호화 이전에 전송 손상을 감지합니다.
   *
   * `checksum`과 마찬가지로 와이어에 자기기술 플래그가 없으므로 인코딩/디코딩에서 동일하게 지정해야 합니다.
   */
  checksumScope?: "plaintext" | "output";
  /** 청크 분할 크기 */
  chunkSize?: number;
  /** 청크 구분자 (기본값: '\n') */
  chunkSeparator?: string;
  /**
   * 중간 스트림 청크처럼 푸터를 생략해야 할 때 사용.
   * @internal 스트림 인코딩 내부 전용 플래그이며 향후 공개 옵션에서 분리될 수 있습니다.
   */
  omitFooter?: boolean;
  /** 진행률 콜백 */
  onProgress?: (info: DduProgressInfo) => void;
  /** 한글 난독화 활성화 (encryptionKey 필요) */
  obfuscate?: boolean;
}

export interface DduConstructorOptions extends DduOptions {
  /** 미리 정의된 charset 심볼 */
  dduSetSymbol?: DduSetSymbol;
  /**
   * @deprecated Runtime string encode/decode paths are always UTF-8 based.
   * This option is accepted for legacy type compatibility only and has no
   * runtime effect.
   */
  encoding?: DduTextEncoding;
  /** 커스텀 charset 문자 배열 또는 문자열 */
  dduChar?: string[] | string;
  /** 종성 문자 배열 (dduChar × codaChar 조합으로 최종 charset 동적 생성) */
  codaChar?: string[];
  /** 패딩 문자 */
  paddingChar?: string;
  /** 필요 문자 수 */
  requiredLength?: number;
  /** 2의 제곱수 강제 여부 */
  usePowerOfTwo?: boolean;
  /**
   * true이면 초기화 오류 시 throw합니다. false이면 fallback charset으로 대체합니다.
   *
   * ⚠️ 5.0 변경: 기본값이 `false` → `true`로 전환되었습니다. 잘못된 커스텀 charset에
   * 더 엄격하게 동작하며, 레거시의 묵시적 fallback 동작이 필요하면 `false`를 명시하세요.
   * @default true
   */
  throwOnError?: boolean;
  /** URL-Safe 모드 (특수문자를 URL 안전 문자로 변환) */
  urlSafe?: boolean;
  /** 암호화 키 (AES-256-GCM) */
  encryptionKey?: string;
  /** 암호화 키 파생 옵션 */
  keyDerivation?: KeyDerivationOptions;
  /** 패딩 문자 반복 방식 사용 여부 */
  useRepeatPadding?: boolean;

  // ─── 추가 옵션 ────────────────────────────────────────────────────────

  /** 명시적 플랫폼 어댑터 (자동 감지 대신 사용) */
  adapter?: PlatformAdapter;

  /** WASM 임계값 (바이트 단위, 기본값: 16384, 범위: 1024-1048576, Infinity면 비활성화) */
  wasmThreshold?: number;
}

export const dduDefaultConstructorOptions: DduConstructorOptions = {
  /** 기본 charset: DDU (한글 종성 결합 64개) */
  dduSetSymbol: DduSetSymbol.DDU,
  /** 2의 제곱수 강제 */
  usePowerOfTwo: true,
  /** 필요 문자 수: 64개 */
  requiredLength: 64,
};

// ─── Platform Adapter ────────────────────────────────────────────────────────

/**
 * 암호화 및 압축 연산을 제공하는 플랫폼 어댑터 인터페이스.
 * 각 런타임(Node.js, 브라우저, 엣지)이 이 인터페이스를 구현합니다.
 *
 * 동기 메서드(`?`로 표시)는 Node.js에서만 사용 가능합니다.
 * 브라우저/엣지 어댑터는 동기 메서드 호출 시 throw합니다.
 */
export interface PlatformAdapter {
  // ─── Crypto ──────────────────────────────────────────────────────────────

  /** UTF-8 키 문자열에서 256비트 키를 파생 */
  deriveKey(key: string, options?: KeyDerivationOptions): Promise<Uint8Array>;
  /** 동기적으로 256비트 키를 파생 (Node.js 전용) */
  deriveKeySync?(key: string, options?: KeyDerivationOptions): Uint8Array;

  /** AES-256-GCM으로 데이터를 암호화. IV(12) + authTag(16) + 암호문을 반환 */
  encrypt(data: Uint8Array, keyHash: Uint8Array, aad?: Uint8Array): Promise<Uint8Array>;
  /** 동기적으로 데이터를 암호화 (Node.js 전용) */
  encryptSync?(data: Uint8Array, keyHash: Uint8Array, aad?: Uint8Array): Uint8Array;

  /** AES-256-GCM 페이로드를 복호화. IV(12) + authTag(16) + 암호문 형식을 기대 */
  decrypt(data: Uint8Array, keyHash: Uint8Array, aad?: Uint8Array): Promise<Uint8Array>;
  /** 동기적으로 데이터를 복호화 (Node.js 전용) */
  decryptSync?(data: Uint8Array, keyHash: Uint8Array, aad?: Uint8Array): Uint8Array;

  /** 암호학적으로 안전한 랜덤 바이트를 생성 */
  randomBytes(length: number): Uint8Array;

  // ─── Compression ─────────────────────────────────────────────────────────

  /** deflate 알고리즘으로 데이터를 압축 */
  deflate(data: Uint8Array, level?: number): Promise<Uint8Array>;
  /** 동기적으로 deflate 압축 (Node.js 전용) */
  deflateSync?(data: Uint8Array, level?: number): Uint8Array;

  /** deflate 데이터를 압축 해제 */
  inflate(data: Uint8Array, maxBytes?: number): Promise<Uint8Array>;
  /** 동기적으로 deflate 데이터를 압축 해제 (Node.js 전용) */
  inflateSync?(data: Uint8Array, maxBytes?: number): Uint8Array;

  /** brotli 알고리즘으로 데이터를 압축 (Node.js 전용) */
  brotliCompress?(data: Uint8Array, level?: number): Promise<Uint8Array>;
  /** 동기적으로 brotli 압축 (Node.js 전용) */
  brotliCompressSync?(data: Uint8Array, level?: number): Uint8Array;

  /** brotli 데이터를 압축 해제 (Node.js 전용) */
  brotliDecompress?(data: Uint8Array, maxBytes?: number): Promise<Uint8Array>;
  /** 동기적으로 brotli 데이터를 압축 해제 (Node.js 전용) */
  brotliDecompressSync?(data: Uint8Array, maxBytes?: number): Uint8Array;

  // ─── Capability Flags ────────────────────────────────────────────────────

  /** 이 어댑터가 동기 암호화 연산을 지원하는지 여부 */
  readonly supportsSyncCrypto: boolean;
  /** 이 어댑터가 동기 압축 연산을 지원하는지 여부 */
  readonly supportsSyncCompression: boolean;
  /** 이 어댑터가 brotli 압축을 지원하는지 여부 */
  readonly supportsBrotli: boolean;
  /** 감지된 런타임 환경 */
  readonly runtime: "node" | "browser" | "edge" | "deno" | "bun" | "unknown";
}

// ─── WASM Codec ──────────────────────────────────────────────────────────────

/**
 * WASM 가속 비트 패킹 코덱 인터페이스.
 * 순수 JavaScript 구현과 바이트 단위로 동일한 인코딩/디코딩 연산을 제공합니다.
 */
export interface WasmCodec {
  /** 바이트를 charset 인덱스로 인코딩 */
  encode(input: Uint8Array, bitLength: number): { indices: Uint16Array; paddingBits: number };

  /** charset 인덱스를 바이트로 디코딩 */
  decode(indices: Uint16Array, bitLength: number, paddingBits: number): Uint8Array;

  /** WASM 모듈이 초기화되어 사용 가능한지 확인 */
  readonly ready: boolean;
}

// ─── Obfuscation Layer ───────────────────────────────────────────────────────

/**
 * 한글 음절 난독화 레이어 인터페이스.
 * 암호화된 출력을 자연스러운 한국어 음절 블록으로 변환합니다.
 */
export interface ObfuscationLayer {
  /**
   * 암호화된 charset 인코딩 문자열을 자연스러운 한글 음절로 변환합니다.
   * 모든 출력 문자는 U+AC00–U+D7A3 범위에 있습니다.
   * 출력 길이 <= 입력 길이의 1.5배.
   */
  obfuscate(input: string): string;

  /**
   * 난독화를 역변환하여 원본 charset 인코딩 문자열을 복원합니다.
   */
  deobfuscate(input: string): string;
}
