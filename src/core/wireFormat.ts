/**
 * ddunigma 와이어 포맷 파서 및 상수.
 *
 * 이 모듈은 ddunigma가 페이로드 푸터와 스트림 헤더에 메타데이터를 인코딩하기 위해
 * 사용하는 바이너리 와이어 포맷을 정의합니다.
 *
 * ## 와이어 포맷 개요
 *
 * ### 단일 페이로드 푸터
 * ```
 * [encoded_chars] [ELYSIA|GRISEO|∅] [ENC|∅] [pad] [0-7]
 *                  ↑ 압축             ↑ 암호화  ↑패딩  ↑비트
 *                  마커               마커     문자  수
 * 선택: CHK[8 hex chars]  (압축 전 페이로드의 CRC32)
 * ```
 *
 * ### 스트림 헤더
 * ```
 * [pad] DDS1 [D|B|N] [1|0] [pad]
 *  ↑          ↑ 압축       ↑ 암호화
 *  패딩       플래그        플래그
 * ```
 *
 * ### 암호화 페이로드 레이아웃
 * ```
 * IV (12 bytes) │ authTag (16 bytes) │ ciphertext (N bytes)
 * 최소 합계: 28 bytes
 * ```
 *
 * @module core/wireFormat
 */

// ─── 와이어 포맷 버전 ─────────────────────────────────────────────────────────

/**
 * 와이어 포맷 버전 식별자.
 * 스트림 헤더에서 포맷 리비전을 구분하는 데 사용됩니다.
 * 디코더는 4자 매직 필드를 알려진 버전 문자열과 비교할 수 있습니다.
 */
export const WIRE_FORMAT_VERSION = "DDS1";

// ─── 마커 상수 ────────────────────────────────────────────────────────────────

/** deflate 알고리즘 압축 마커 */
export const COMPRESS_MARKER = "ELYSIA";

/** brotli 알고리즘 압축 마커 */
export const BROTLI_MARKER = "GRISEO";

/** 페이로드가 암호화되었음을 나타내는 암호화 마커 */
export const ENCRYPT_MARKER = "ENC";

/** 압축 후 암호화 파이프라인을 나타내는 v3 마커 */
export const PIPELINE_V3_MARKER = "V3";

/** 체크섬 마커 접두사 (뒤에 8자리 16진수 CRC32가 따름) */
export const CHECKSUM_MARKER = "CHK";

// ─── 푸터 파싱 ────────────────────────────────────────────────────────────────

/** 와이어 포맷 푸터 파싱 결과 */
export interface FooterParseResult {
  /** 푸터가 제거된 인코딩된 페이로드 */
  cleanedInput: string;
  /** 마지막 인코딩 청크의 패딩 비트 수 (0 ~ effectiveBitLength-1) */
  paddingBits: number;
  /** 감지된 압축 알고리즘 (있는 경우) */
  compressionAlgorithm?: "deflate" | "brotli";
  /** 페이로드가 암호화되었는지 여부 */
  isEncrypted: boolean;
  /** 단일 페이로드 파이프라인 버전 */
  pipelineVersion: 2 | 3;
}

/**
 * 인코딩된 문자열에서 와이어 포맷 푸터를 파싱합니다.
 *
 * 푸터는 인코딩된 페이로드 뒤에 추가되며 압축, 암호화, 패딩에 대한
 * 메타데이터를 포함합니다. 문자열 끝에서 역방향으로 파싱됩니다:
 *
 * 1. Node 스타일 푸터: `{payload}{padChar}[ELYSIA|GRISEO][ENC]{paddingBits}`
 * 2. 반복 패딩: `{payload}{padChar}{padChar}...` (각 패딩 문자 = bitsPerPadChar 비트)
 *
 * @param input - 푸터를 포함한 전체 인코딩 문자열
 * @param paddingChar - 인코더가 사용하는 패딩 문자
 * @param effectiveBitLength - charset의 유효 비트 길이 (charset 크기의 log2)
 * @param bitsPerPadChar - 반복 패딩 시 패딩 문자 1개가 나타내는 비트 수 (기본값: 2)
 * @returns 파싱된 푸터 정보
 */
export function parseFooter(
  input: string,
  paddingChar: string,
  effectiveBitLength: number,
  bitsPerPadChar: number = 2,
): FooterParseResult {
  const inputLen = input.length;
  const padLen = paddingChar.length;
  const noFooter: FooterParseResult = {
    cleanedInput: input,
    paddingBits: 0,
    isEncrypted: false,
    pipelineVersion: 2,
  };

  if (inputLen < padLen) return noFooter;

  const maxPaddingBits = Math.max(0, effectiveBitLength - 1);
  const maxDigits = maxPaddingBits.toString().length;

  // 단계 1: Node 스타일 푸터 시도 (padChar + 마커 + 숫자)
  for (let digitCount = Math.min(maxDigits, inputLen); digitCount >= 1; digitCount--) {
    const digitsStart = inputLen - digitCount;

    // 후행 숫자 확인
    let allDigits = true;
    for (let i = digitsStart; i < inputLen; i++) {
      const c = input.charCodeAt(i);
      if (c < 48 || c > 57) {
        allDigits = false;
        break;
      }
    }
    if (!allDigits) continue;

    const digitStr = input.substring(digitsStart);
    const paddingBits = parseInt(digitStr, 10);
    if (
      Number.isNaN(paddingBits) ||
      paddingBits < 0 ||
      paddingBits >= effectiveBitLength ||
      digitStr !== paddingBits.toString()
    )
      continue;

    // 숫자 앞의 마커를 역순으로 확인
    let pos = digitsStart;
    let isEncrypted = false;
    let compressionAlgorithm: "deflate" | "brotli" | undefined;
    let pipelineVersion: 2 | 3 = 2;

    if (
      pos >= PIPELINE_V3_MARKER.length &&
      input.substring(pos - PIPELINE_V3_MARKER.length, pos) === PIPELINE_V3_MARKER
    ) {
      pipelineVersion = 3;
      pos -= PIPELINE_V3_MARKER.length;
    }

    if (
      pos >= ENCRYPT_MARKER.length &&
      input.substring(pos - ENCRYPT_MARKER.length, pos) === ENCRYPT_MARKER
    ) {
      isEncrypted = true;
      pos -= ENCRYPT_MARKER.length;
    }

    if (
      pos >= COMPRESS_MARKER.length &&
      input.substring(pos - COMPRESS_MARKER.length, pos) === COMPRESS_MARKER
    ) {
      compressionAlgorithm = "deflate";
      pos -= COMPRESS_MARKER.length;
    } else if (
      pos >= BROTLI_MARKER.length &&
      input.substring(pos - BROTLI_MARKER.length, pos) === BROTLI_MARKER
    ) {
      compressionAlgorithm = "brotli";
      pos -= BROTLI_MARKER.length;
    }

    // 마커 앞의 패딩 문자 확인
    const padStart = pos - padLen;
    if (padStart >= 0 && input.substring(padStart, pos) === paddingChar) {
      return {
        cleanedInput: input.substring(0, padStart),
        paddingBits,
        compressionAlgorithm,
        isEncrypted,
        pipelineVersion,
      };
    }
  }

  // 단계 2: V2 반복 패딩 시도 (후행 padChar, 각각 bitsPerPadChar 비트를 나타냄)
  if (input.endsWith(paddingChar)) {
    let trailingPadCount = 0;
    let pos = inputLen;
    while (pos >= padLen) {
      if (input.substring(pos - padLen, pos) === paddingChar) {
        trailingPadCount++;
        pos -= padLen;
      } else {
        break;
      }
    }

    if (trailingPadCount > 0) {
      const paddingBits = trailingPadCount * bitsPerPadChar;
      if (paddingBits < effectiveBitLength) {
        return {
          cleanedInput: input.substring(0, pos),
          paddingBits,
          isEncrypted: false,
          pipelineVersion: 2,
        };
      }
    }
  }

  return noFooter;
}

// ─── 체크섬 포맷 ─────────────────────────────────────────────────────────────

/** 인코딩된 문자열에서 체크섬을 추출한 결과 */
export interface ChecksumExtractResult {
  /** 체크섬이 제거된 데이터 부분 */
  data: string;
  /** 추출된 8자리 16진수 체크섬, 또는 찾지 못한 경우 null */
  checksum: string | null;
}

/**
 * 인코딩된 문자열 끝에서 CRC32 체크섬을 추출합니다.
 *
 * 체크섬 형식: `CHK` 뒤에 정확히 8자리 소문자 16진수 문자.
 * 체크섬은 압축 전, 암호화 후 페이로드에 대해 계산됩니다.
 *
 * @param input - 체크섬 접미사를 포함할 수 있는 인코딩된 문자열
 * @returns 체크섬 없는 데이터와 추출된 체크섬 (또는 null)
 */
export function extractChecksum(input: string): ChecksumExtractResult {
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

// ─── 스트림 헤더 ─────────────────────────────────────────────────────────────

/** 스트림 헤더에 인코딩된 메타데이터 */
export interface StreamHeaderMeta {
  /** 스트림에서 사용된 압축 알고리즘 (있는 경우) */
  compressionAlgorithm?: "deflate" | "brotli";
  /** 스트림 페이로드가 암호화되었는지 여부 */
  encrypted: boolean;
}

/**
 * 주어진 패딩 문자에 대한 스트림 헤더의 문자 길이를 계산합니다.
 *
 * 스트림 헤더 형식: `{pad}DDS1{compressFlag}{encryptFlag}{pad}`
 * - pad: 패딩 문자 (시작과 끝에 나타남)
 * - DDS1: 4자 매직/버전 식별자
 * - compressFlag: 1자 ("D" deflate, "B" brotli, "N" 없음)
 * - encryptFlag: 1자 ("1" 암호화됨, "0" 비암호화)
 *
 * @param paddingChar - 인코더가 사용하는 패딩 문자
 * @returns 스트림 헤더의 총 문자 길이
 */
export function getStreamHeaderLength(paddingChar: string): number {
  return paddingChar.length * 2 + WIRE_FORMAT_VERSION.length + 2;
}

/**
 * 스트림 헤더 문자열을 생성합니다.
 *
 * @param paddingChar - 인코더가 사용하는 패딩 문자
 * @param meta - 스트림 메타데이터 (압축 알고리즘 및 암호화 플래그)
 * @returns 포맷된 스트림 헤더 문자열
 */
export function buildStreamHeader(paddingChar: string, meta: StreamHeaderMeta): string {
  const compressionCode =
    meta.compressionAlgorithm === "brotli"
      ? "B"
      : meta.compressionAlgorithm === "deflate"
        ? "D"
        : "N";
  const encryptionCode = meta.encrypted ? "1" : "0";
  return `${paddingChar}${WIRE_FORMAT_VERSION}${compressionCode}${encryptionCode}${paddingChar}`;
}

/**
 * 인코딩된 스트림의 시작 부분에서 스트림 헤더를 파싱합니다.
 *
 * 매직 바이트(DDS1), 압축 플래그, 암호화 플래그,
 * 그리고 양쪽 패딩 문자를 검증합니다.
 *
 * @param input - 인코딩된 스트림의 시작 부분 (최소 헤더 길이 이상이어야 함)
 * @param paddingChar - 인코더가 사용하는 패딩 문자
 * @returns 파싱된 스트림 메타데이터, 또는 유효한 헤더가 아닌 경우 null
 * @throws 헤더가 패딩 문자로 시작하지만 구조가 유효하지 않은 경우
 */
export function parseStreamHeader(input: string, paddingChar: string): StreamHeaderMeta | null {
  const headerLength = getStreamHeaderLength(paddingChar);
  if (input.length < headerLength || !input.startsWith(paddingChar)) {
    return null;
  }

  const bodyStart = paddingChar.length;
  const magic = input.slice(bodyStart, bodyStart + WIRE_FORMAT_VERSION.length);
  if (magic !== WIRE_FORMAT_VERSION) {
    throw new Error("[wireFormat] Invalid stream header magic");
  }

  const compressionCode = input[bodyStart + WIRE_FORMAT_VERSION.length];
  const encryptionCode = input[bodyStart + WIRE_FORMAT_VERSION.length + 1];
  const endPadding = input.slice(headerLength - paddingChar.length, headerLength);
  if (endPadding !== paddingChar) {
    throw new Error("[wireFormat] Invalid stream header terminator");
  }

  const compressionAlgorithm =
    compressionCode === "B"
      ? "brotli"
      : compressionCode === "D"
        ? "deflate"
        : compressionCode === "N"
          ? undefined
          : null;

  if (compressionAlgorithm === null) {
    throw new Error("[wireFormat] Invalid stream header compression flag");
  }
  if (encryptionCode !== "0" && encryptionCode !== "1") {
    throw new Error("[wireFormat] Invalid stream header encryption flag");
  }

  return {
    compressionAlgorithm,
    encrypted: encryptionCode === "1",
  };
}

// ─── 푸터 생성 ────────────────────────────────────────────────────────────────

/** 와이어 포맷 푸터 생성 옵션 */
export interface FooterOptions {
  /** 패딩 비트 수 (0 ~ effectiveBitLength-1) */
  paddingBits: number;
  /** 사용된 압축 알고리즘 (있는 경우) */
  compressionAlgorithm?: "deflate" | "brotli";
  /** 페이로드가 암호화되었는지 여부 */
  isEncrypted: boolean;
  /** 패딩 문자 */
  paddingChar: string;
  /** V2 반복 패딩 모드 사용 여부 (padChar를 반복) */
  useRepeatPadding?: boolean;
  /** 반복 패딩 시 패딩 문자 1개가 나타내는 비트 수 (기본값: 2) */
  bitsPerPadChar?: number;
  /** v3 파이프라인 마커 사용 여부 */
  pipelineVersion?: 2 | 3;
}

/**
 * 와이어 포맷 푸터 문자열을 생성합니다.
 *
 * 두 가지 모드를 지원합니다:
 * 1. Node 스타일: `{padChar}{compressionMarker}{encryptMarker}{paddingBits}`
 * 2. 반복 패딩: `{padChar}`를 `paddingBits / bitsPerPadChar`회 반복
 *    (압축/암호화 마커가 필요 없을 때만)
 *
 * @param options - 푸터 생성 옵션
 * @returns 인코딩된 페이로드 뒤에 추가할 푸터 문자열
 */
export function buildFooter(options: FooterOptions): string {
  const {
    paddingBits,
    compressionAlgorithm,
    isEncrypted,
    paddingChar,
    useRepeatPadding,
    bitsPerPadChar = 2,
    pipelineVersion = 2,
  } = options;

  // 패딩 비트가 없고 마커도 필요 없으면 빈 문자열 반환
  if (paddingBits === 0 && !compressionAlgorithm && !isEncrypted && pipelineVersion === 2) {
    return "";
  }

  // V2 반복 패딩 모드: 압축/암호화 마커가 없을 때만
  if (
    useRepeatPadding &&
    !compressionAlgorithm &&
    !isEncrypted &&
    pipelineVersion === 2 &&
    paddingBits > 0 &&
    paddingBits % bitsPerPadChar === 0
  ) {
    const repeatCount = paddingBits / bitsPerPadChar;
    return paddingChar.repeat(repeatCount);
  }

  // Node 스타일 푸터
  const compressionMarker =
    compressionAlgorithm === "deflate"
      ? COMPRESS_MARKER
      : compressionAlgorithm === "brotli"
        ? BROTLI_MARKER
        : "";

  return (
    paddingChar +
    compressionMarker +
    (isEncrypted ? ENCRYPT_MARKER : "") +
    (pipelineVersion === 3 ? PIPELINE_V3_MARKER : "") +
    paddingBits.toString()
  );
}
