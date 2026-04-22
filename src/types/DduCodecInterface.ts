import { DduSetSymbol } from "./DduEnums";
import { DduProgressInfo } from "./DduInterface";

/**
 * DduCodec 압축 기본 설정
 */
export interface DduCodecCompressionDefaults {
  /** 기본 압축 활성화 여부 */
  enabled?: boolean;
  /** 압축 알고리즘 */
  algorithm?: "deflate" | "brotli";
  /** 압축 레벨 (deflate 0-9, brotli 0-11) */
  level?: number;
}

/**
 * DduCodec 청크 기본 설정
 */
export interface DduCodecChunkingDefaults {
  /** 청크 크기 */
  size?: number;
  /** 청크 구분자 (기본값: "\n") */
  separator?: string;
}

/**
 * DduCodec 기본 동작 설정
 */
export interface DduCodecDefaults {
  /** 압축 기본 설정 */
  compression?: DduCodecCompressionDefaults;
  /** 체크섬 기본값 */
  checksum?: boolean;
  /** 청크 기본 설정 */
  chunking?: DduCodecChunkingDefaults;
  /** 암호화 키 (AES-256-GCM) */
  encryptionKey?: string;
  /** URL-Safe 모드 */
  urlSafe?: boolean;
  /** 진행률 콜백 기본값 */
  onProgress?: (info: DduProgressInfo) => void;
}

/**
 * DduCodec 크기 제한 설정
 */
export interface DduCodecLimits {
  /** 최대 디코딩 바이트 수 (Zip Bomb 방어) */
  maxDecodedBytes?: number;
  /** 최대 압축해제 바이트 수 (Zip Bomb 방어) */
  maxDecompressedBytes?: number;
}

/**
 * 레거시 페이로드 디코딩 정책
 *
 * - `"off"`: v3(DDU3/DDS3) 페이로드만 허용. 레거시 거부.
 * - `"explicit"`: v3 우선 파싱. 실패 시 레거시 1회 시도. **기본값.**
 * - `"on"`: 레거시 페이로드를 정상 입력처럼 수용. 마이그레이션용.
 */
export type DduLegacyDecodePolicy = "off" | "explicit" | "on";

/**
 * DduCodec 호환성 설정
 */
export interface DduCodecCompatibility {
  /** 레거시 v2 페이로드 디코딩 정책 (기본값: "explicit") */
  legacyDecode?: DduLegacyDecodePolicy;
}

/**
 * DduCodec 유효성 검증 설정
 */
export interface DduCodecValidation {
  /** 엄격한 검증 모드 (옵션 충돌 및 형식 오류 즉시 reject) */
  strict?: boolean;
}

/**
 * DduCodec 생성자 설정
 *
 * @example
 * const codec = new DduCodec({
 *   preset: DduSetSymbol.ONECHARSET,
 *   defaults: {
 *     compression: { enabled: true, algorithm: "brotli", level: 6 },
 *     encryptionKey: "secret"
 *   },
 *   limits: { maxDecodedBytes: 64 * 1024 * 1024 },
 *   compatibility: { legacyDecode: "explicit" }
 * });
 */
export interface DduCodecConfig {
  /** 커스텀 charset */
  charset?: string[] | string;
  /** 패딩 문자 */
  padding?: string;
  /** 미리 정의된 charset 심볼 */
  preset?: DduSetSymbol;
  /** 기본 동작 설정 */
  defaults?: DduCodecDefaults;
  /** 크기 제한 설정 */
  limits?: DduCodecLimits;
  /** 호환성 정책 */
  compatibility?: DduCodecCompatibility;
  /** 유효성 검증 정책 */
  validation?: DduCodecValidation;
  /** Buffer 인코딩 방식 (기본값: "utf-8") */
  encoding?: BufferEncoding;
  /** 2의 제곱수 charset 강제 여부 */
  usePowerOfTwo?: boolean;
}

/**
 * DduCodec per-call encode 옵션
 *
 * 플랫 옵션이 아닌 nested object shape 사용.
 * `compression: false` 로 전달 시 해당 호출에서 압축 비활성화.
 */
export interface DduCodecEncodeOptions {
  /** 압축 override (`false` 시 비활성화) */
  compression?:
    | false
    | {
        algorithm?: "deflate" | "brotli";
        level?: number;
      };
  /** 체크섬 포함 여부 override */
  checksum?: boolean;
  /** 청크 override (`false` 시 비활성화) */
  chunking?:
    | false
    | {
        size: number;
        separator?: string;
      };
  /** 진행률 콜백 */
  onProgress?: (info: DduProgressInfo) => void;
}

/**
 * DduCodec per-call decode 옵션
 */
export interface DduCodecDecodeOptions {
  /** 호환성 override */
  compatibility?: DduCodecCompatibility;
  /** 크기 제한 override */
  limits?: DduCodecLimits;
  /** 진행률 콜백 */
  onProgress?: (info: DduProgressInfo) => void;
}

/**
 * DduCodec inspect() 반환 정보
 */
export interface DduCodecInspection {
  /** 원본 데이터 크기 */
  originalSize: number;
  /** 인코딩 결과 크기 */
  encodedSize: number;
  /** 압축된 크기 (압축 사용 시) */
  compressedSize?: number;
  /** 압축률 (0-1) */
  compressionRatio?: number;
  /** 인코딩 확장 비율 */
  expansionRatio: number;
  /** charset 크기 */
  charsetSize: number;
  /** 비트 길이 */
  bitLength: number;
  /** 사용된 와이어 포맷 */
  wireFormat: "DDU3";
  /** 압축 알고리즘 */
  compressionAlgorithm?: "deflate" | "brotli";
  /** 암호화 여부 */
  encrypted: boolean;
  /** 체크섬 포함 여부 */
  hasChecksum: boolean;
}

/**
 * DduCodec 정보 스냅샷
 */
export interface DduCodecInfo {
  /** charset 배열 */
  charSet: string[];
  /** 패딩 문자 */
  paddingChar: string;
  /** 각 charset 문자의 길이 */
  charLength: number;
  /** 비트 길이 */
  bitLength: number;
  /** 2의 제곱수 charset 여부 */
  usePowerOfTwo: boolean;
  /** Buffer 인코딩 방식 */
  encoding: BufferEncoding;
  /** 기본 동작 스냅샷 */
  defaults: {
    compression: Required<DduCodecCompressionDefaults>;
    checksum: boolean;
    chunking: {
      size: number | undefined;
      separator: string;
    };
    urlSafe: boolean;
    hasEncryptionKey: boolean;
  };
  /** 크기 제한 스냅샷 */
  limits: Required<DduCodecLimits>;
  /** 호환성 정책 스냅샷 */
  compatibility: Required<DduCodecCompatibility>;
  /** 검증 정책 스냅샷 */
  validation: Required<DduCodecValidation>;
  /** 네이티브 와이어 포맷 태그 */
  wireFormat: {
    block: "DDU3";
    stream: "DDS3";
  };
}
