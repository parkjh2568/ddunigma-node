/**
 * 핵심 코덱 유틸리티.
 * Buffer 대신 Uint8Array와 TextEncoder/TextDecoder를 사용합니다.
 *
 * @module core/codecUtils
 */

// ─── CRC32 ───────────────────────────────────────────────────────────────────

/** CRC32 룩업 테이블 (바이트 단위 연산, 비트 루프 대비 4-8배 빠름) */
const CRC32_TABLE: Uint32Array = /* @__PURE__ */ (() => {
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

/**
 * Uint8Array에서 CRC32 체크섬을 계산합니다.
 * 8자리 소문자 16진수 문자열을 반환합니다.
 *
 * @param data - 체크섬을 계산할 입력 바이트
 * @returns CRC32 값을 나타내는 8자리 소문자 16진수 문자열
 */
export function calculateCRC32(data: Uint8Array): string {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xff];
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

export function constantTimeEquals(a: string, b: string): boolean {
  const maxLength = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;

  for (let i = 0; i < maxLength; i++) {
    const aCode = i < a.length ? a.charCodeAt(i) : 0;
    const bCode = i < b.length ? b.charCodeAt(i) : 0;
    diff |= aCode ^ bCode;
  }

  return diff === 0;
}

// ─── URL-Safe 변환 ───────────────────────────────────────────────────────────

/** URL-Safe 충돌 문자 */
export const URL_SAFE_CONFLICT_CHARS = ["-", "_", "."] as const;

/**
 * 문자열을 URL-safe 형식으로 변환합니다.
 * Base64 특수 문자를 URL 안전 대체 문자로 교체합니다:
 *   + → -
 *   / → _
 *   = → .
 *
 * ASCII 문자에만 작동하며, 페이로드 인코딩과 분리됩니다.
 */
export function toUrlSafe(input: string): string {
  if (input.length === 0) return input;
  return input.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ".");
}

/**
 * URL-safe 문자열을 원래 Base64 형식으로 복원합니다.
 * URL-safe 변환을 역변환합니다:
 *   - → +
 *   _ → /
 *   . → =
 */
export function fromUrlSafe(input: string): string {
  if (input.length === 0) return input;
  return input.replaceAll("-", "+").replaceAll("_", "/").replaceAll(".", "=");
}

// ─── 청킹 ────────────────────────────────────────────────────────────────────

/**
 * 문자열을 주어진 크기의 청크로 분할하고 구분자로 연결합니다.
 *
 * @param input - 분할할 문자열
 * @param chunkSize - 청크당 최대 문자 수
 * @param separator - 청크 사이에 삽입할 문자열
 * @returns 청크로 분할된 문자열
 */
export function splitIntoChunks(input: string, chunkSize: number, separator: string): string {
  if (chunkSize <= 0 || input.length <= chunkSize) return input;

  const chunkCount = Math.ceil(input.length / chunkSize);
  const parts = new Array<string>(chunkCount * 2 - 1);
  let partIndex = 0;

  for (let i = 0; i < input.length; i += chunkSize) {
    parts[partIndex++] = input.slice(i, i + chunkSize);
    if (i + chunkSize < input.length) {
      parts[partIndex++] = separator;
    }
  }

  return parts.join("");
}

/**
 * 문자열에서 청크 구분자를 제거합니다.
 * 항상 줄바꿈(\r, \n)을 제거합니다. 커스텀 구분자가 제공되면
 * (줄바꿈이 아닌 경우) 해당 구분자도 제거합니다.
 *
 * @param input - 청크로 분할된 문자열
 * @param defaultSeparator - 청킹 시 사용된 구분자
 * @returns 구분자가 제거된 문자열
 */
export function removeChunks(input: string, defaultSeparator: string): string {
  if (input.length === 0) return input;

  // 항상 줄바꿈 제거
  let result = input.replace(/[\r\n]/g, "");

  // 줄바꿈 변형이 아닌 커스텀 구분자 제거
  const separator =
    defaultSeparator &&
    defaultSeparator !== "\n" &&
    defaultSeparator !== "\r\n" &&
    defaultSeparator !== "\r"
      ? defaultSeparator
      : "";

  if (separator.length > 0 && result.includes(separator)) {
    result = result.replaceAll(separator, "");
  }

  return result;
}

// ─── 한글 종성 Charset ───────────────────────────────────────────────────────

/** 한글 종성 인덱스 맵 */
const CODA_INDEX_MAP: Record<string, number> = {
  "": 0,
  ㄱ: 1,
  ㄲ: 2,
  ㄳ: 3,
  ㄴ: 4,
  ㄵ: 5,
  ㄶ: 6,
  ㄷ: 7,
  ㄹ: 8,
  ㄺ: 9,
  ㄻ: 10,
  ㄼ: 11,
  ㄽ: 12,
  ㄾ: 13,
  ㄿ: 14,
  ㅀ: 15,
  ㅁ: 16,
  ㅂ: 17,
  ㅄ: 18,
  ㅅ: 19,
  ㅆ: 20,
  ㅇ: 21,
  ㅈ: 22,
  ㅊ: 23,
  ㅋ: 24,
  ㅌ: 25,
  ㅍ: 26,
  ㅎ: 27,
};

/**
 * 한글 문자에 종성을 결합합니다.
 *
 * @param char - 기본 한글 문자 (종성 없음)
 * @param coda - 결합할 종성 문자 (빈 문자열 = 종성 없음)
 * @returns 결합된 한글 문자
 */
export function combineCoda(char: string, coda: string): string {
  const code = char.charCodeAt(0);
  // 한글 음절 블록 범위(U+AC00–U+D7A3)만 처리
  if (code < 0xac00 || code > 0xd7a3) return char;
  const baseOrd = code - ((code - 0xac00) % 28);
  const codaIdx = CODA_INDEX_MAP[coda] ?? 0;
  return String.fromCharCode(baseOrd + codaIdx);
}

/**
 * 기본 문자와 종성 문자로부터 결합 charset을 생성합니다.
 * 각 기본 문자와 각 종성 문자를 결합하여
 * dduChar.length × codaChar.length개의 문자를 생성합니다.
 *
 * @param dduChar - 기본 문자 배열
 * @param codaChar - 종성 문자 배열
 * @returns 결합된 charset 배열
 */
export function buildCodaCharset(dduChar: string[], codaChar: string[]): string[] {
  const result: string[] = new Array(dduChar.length * codaChar.length);
  let idx = 0;
  for (const base of dduChar) {
    for (const coda of codaChar) {
      result[idx++] = combineCoda(base, coda);
    }
  }
  return result;
}

// ─── 압축 레벨 ───────────────────────────────────────────────────────────────

/**
 * 주어진 알고리즘의 유효 범위로 압축 레벨을 정규화합니다.
 * - deflate: 0–9 (기본값 6)
 * - brotli: 0–11 (기본값 6)
 *
 * @param value - 원시 압축 레벨 (undefined이거나 범위 밖일 수 있음)
 * @param algorithm - 압축 알고리즘 ("deflate" 또는 "brotli")
 * @returns 유효 범위 내로 정규화된 압축 레벨
 */
export function normalizeCompressionLevel(
  value: number | undefined,
  algorithm: "deflate" | "brotli",
): number {
  const fallback = 6;
  const normalized = value === undefined || !Number.isFinite(value) ? fallback : Math.floor(value);

  return algorithm === "brotli"
    ? Math.min(11, Math.max(0, normalized))
    : Math.min(9, Math.max(0, normalized));
}

// ─── 텍스트 인코딩 유틸리티 ──────────────────────────────────────────────────

/** 공유 TextEncoder 인스턴스 (상태 없음, 재사용 안전) */
const textEncoder = /* @__PURE__ */ new TextEncoder();

/** 공유 TextDecoder 인스턴스 (상태 없음, 재사용 안전) */
const textDecoder = /* @__PURE__ */ new TextDecoder();

/**
 * TextEncoder를 사용하여 문자열을 UTF-8 바이트로 인코딩합니다.
 * Buffer.from(str, 'utf-8')의 플랫폼 독립적 대체.
 *
 * @param str - 입력 문자열
 * @returns UTF-8 인코딩된 바이트
 */
export function stringToBytes(str: string): Uint8Array {
  return textEncoder.encode(str);
}

/**
 * TextDecoder를 사용하여 UTF-8 바이트를 문자열로 디코딩합니다.
 * Buffer.toString('utf-8')의 플랫폼 독립적 대체.
 *
 * @param bytes - UTF-8 인코딩된 바이트
 * @returns 디코딩된 문자열
 */
export function bytesToString(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}
