/**
 * DduCodec 에러 코드 분류
 *
 * 안정적인 에러 식별을 위한 문자열 코드. v3에서 추가될 수 있다.
 */
export type DduErrorCode =
  | "DDU_CONFIG_INVALID"
  | "DDU_CONFIG_CONFLICT"
  | "DDU_DECODE_INVALID_FORMAT"
  | "DDU_DECODE_INVALID_VERSION"
  | "DDU_DECODE_CHECKSUM_MISMATCH"
  | "DDU_DECODE_KEY_MISSING"
  | "DDU_DECODE_KEY_INVALID"
  | "DDU_DECODE_LIMIT_EXCEEDED"
  | "DDU_DECODE_CORRUPTED"
  | "DDU_COMPAT_LEGACY_REJECTED"
  | "DDU_COMPAT_VERSION_UNSUPPORTED";

/**
 * DduCodec 공통 에러 베이스 클래스.
 *
 * `code` 필드로 에러 분류 가능. `cause` 로 원인 에러 전파.
 */
export class DduError extends Error {
  /** 안정적인 에러 식별 코드 */
  public readonly code: DduErrorCode;

  constructor(code: DduErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions);
    this.code = code;
    this.name = "DduError";
  }
}

/**
 * DduCodec 설정 오류.
 *
 * - charset/padding 충돌
 * - 옵션 조합 충돌 (예: URL-Safe 와 charset 충돌)
 * - 잘못된 limits 값
 */
export class DduConfigError extends DduError {
  constructor(
    message: string,
    options?: { code?: "DDU_CONFIG_INVALID" | "DDU_CONFIG_CONFLICT"; cause?: unknown }
  ) {
    super(options?.code ?? "DDU_CONFIG_INVALID", message, { cause: options?.cause });
    this.name = "DduConfigError";
  }
}

/**
 * DduCodec 디코딩 오류.
 *
 * - 잘못된 와이어 포맷
 * - 손상된 페이로드
 * - 체크섬 불일치
 * - 키 누락/잘못된 키
 * - 크기 제한 초과
 */
export class DduDecodeError extends DduError {
  constructor(
    message: string,
    options?: {
      code?:
        | "DDU_DECODE_INVALID_FORMAT"
        | "DDU_DECODE_INVALID_VERSION"
        | "DDU_DECODE_CHECKSUM_MISMATCH"
        | "DDU_DECODE_KEY_MISSING"
        | "DDU_DECODE_KEY_INVALID"
        | "DDU_DECODE_LIMIT_EXCEEDED"
        | "DDU_DECODE_CORRUPTED";
      cause?: unknown;
    }
  ) {
    super(options?.code ?? "DDU_DECODE_INVALID_FORMAT", message, { cause: options?.cause });
    this.name = "DduDecodeError";
  }
}

/**
 * DduCodec 호환성 정책 오류.
 *
 * - `legacyDecode: "off"` 상태에서 레거시 페이로드 입력
 * - 미지원 와이어 포맷 버전
 */
export class DduCompatibilityError extends DduError {
  constructor(
    message: string,
    options?: {
      code?: "DDU_COMPAT_LEGACY_REJECTED" | "DDU_COMPAT_VERSION_UNSUPPORTED";
      cause?: unknown;
    }
  ) {
    super(options?.code ?? "DDU_COMPAT_LEGACY_REJECTED", message, {
      cause: options?.cause,
    });
    this.name = "DduCompatibilityError";
  }
}
