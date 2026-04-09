/** URL-Safe 역방향 매핑 */
export const URL_SAFE_REVERSE_MAP: Record<string, string> = {
  "-": "+",
  "_": "/",
  ".": "=",
};

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

  const chars = new Array<string>(input.length);
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "+") chars[i] = "-";
    else if (ch === "/") chars[i] = "_";
    else if (ch === "=") chars[i] = ".";
    else chars[i] = ch;
  }
  return chars.join("");
}

/**
 * URL-Safe를 원본 Base64 포맷으로 복원합니다.
 */
export function fromUrlSafeFast(input: string): string {
  if (input.length === 0) return input;

  const chars = new Array<string>(input.length);
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "-") chars[i] = "+";
    else if (ch === "_") chars[i] = "/";
    else if (ch === ".") chars[i] = "=";
    else chars[i] = ch;
  }
  return chars.join("");
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

  const separator =
    defaultSeparator &&
    defaultSeparator !== "\n" &&
    defaultSeparator !== "\r\n" &&
    defaultSeparator !== "\r"
      ? defaultSeparator
      : "";
  const separatorLength = separator.length;
  let result = "";

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "\n" || ch === "\r") {
      continue;
    }

    if (
      separatorLength > 0 &&
      ch === separator[0] &&
      input.startsWith(separator, i)
    ) {
      i += separatorLength - 1;
      continue;
    }

    result += ch;
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
