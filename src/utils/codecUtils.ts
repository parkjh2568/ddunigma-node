/** URL-Safe 충돌 문자 목록 */
export const URL_SAFE_CONFLICT_CHARS = ["-", "_", "."] as const;

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
 * @param char - 기본 한글 문자 (종성 없는 상태)
 * @param coda - 결합할 종성 자모 (빈 문자열이면 종성 없음)
 * @returns 종성이 결합된 한글 문자
 */
export function combineCoda(char: string, coda: string): string {
  const code = char.charCodeAt(0);
  if (code < 44032 || code > 55203) return char;
  const baseOrd = code - ((code - 44032) % 28);
  const codaIdx = CODA_INDEX_MAP[coda] ?? 0;
  return String.fromCharCode(baseOrd + codaIdx);
}

/**
 * dduChar × codaChar 조합으로 최종 charset을 동적 생성합니다.
 * @param dduChar - 기본 문자 배열
 * @param codaChar - 종성 문자 배열
 * @returns 조합된 charset 배열 (dduChar.length × codaChar.length 크기)
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

/** CRC32 룩업 테이블 (바이트 단위 연산으로 비트 루프 대비 4~8배 빠름) */
const CRC32_TABLE: Uint32Array = (() => {
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

/** 압축 데이터 식별 마커 (Deflate) */
export const COMPRESS_MARKER = "ELYSIA";

/** 압축 데이터 식별 마커 (Brotli) */
export const BROTLI_MARKER = "GRISEO";

/** 체크섬 마커 */
export const CHECKSUM_MARKER = "CHK";

/** 암호화 마커 */
export const ENCRYPT_MARKER = "ENC";

/**
 * URL-Safe 변환을 수행합니다.
 * 전송 문자열은 항상 ASCII 영역에서만 치환하여 payload encoding과 분리합니다.
 */
export function toUrlSafeFast(input: string): string {
  if (input.length === 0) return input;
  return input.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ".");
}

/**
 * URL-Safe를 원본 Base64 포맷으로 복원합니다.
 */
export function fromUrlSafeFast(input: string): string {
  if (input.length === 0) return input;
  return input.replaceAll("-", "+").replaceAll("_", "/").replaceAll(".", "=");
}

/**
 * 문자열을 chunkSize로 분할하여 separator로 잇습니다.
 */
export function splitIntoChunksFast(input: string, chunkSize: number, separator: string): string {
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
 * 청크 구분자를 빠르게 제거합니다.
 */
export function removeChunksFast(input: string, defaultSeparator: string): string {
  if (input.length === 0) return input;

  // 줄바꿈 제거는 항상 수행
  let result = input.replace(/[\r\n]/g, "");

  // 커스텀 separator가 있으면 추가 제거
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

/**
 * CRC32 체크섬을 계산합니다. (룩업 테이블 사용)
 */
export function calculateCRC32(data: Buffer): string {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xff];
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

/**
 * 인코딩된 문자열에서 체크섬을 추출합니다.
 */
export function extractChecksum(input: string): { data: string; checksum: string | null } {
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

/**
 * 압축 레벨을 알고리즘별 지원 범위에 맞춰 정규화합니다.
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
