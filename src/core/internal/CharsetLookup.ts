/**
 * Charset lookup table builders.
 *
 * @module core/internal/CharsetLookup
 */

export interface CharsetLookupTables {
  charCodeLookup: Int32Array;
  charCodes: Uint16Array;
  /** 룩업 테이블의 인덱스 0이 대응하는 코드 유닛(최소 코드). `lookup[code - offset]`. */
  lookupOffset: number;
}

const predefinedLookupCache = new Map<string, CharsetLookupTables>();

/**
 * UTF-16 코드 유닛 → charset 인덱스 직접 룩업 테이블을 생성합니다.
 *
 * 테이블 길이는 charset의 [최소, 최대] 코드 유닛 범위로 맞추고(`maxCode - minCode + 1`),
 * 조회는 `lookup[code - lookupOffset]`로 수행합니다. 클러스터된 charset(예: 한글 종성
 * 결합 64자)에서 테이블 크기가 크게 줄어듭니다(이전엔 `maxCode + 1` 크기였음).
 * 범위를 벗어나는 코드 유닛은 lookupCharIndex가 -1로 처리합니다.
 *
 * @param charset - 단일 BMP 심볼 charset
 * @returns 코드 유닛 룩업 테이블, 인덱스→코드 유닛 배열, 오프셋
 */
export function buildCharsetLookupTables(
  charset: readonly string[],
  cachePredefined = false,
): CharsetLookupTables {
  const cacheKey = cachePredefined ? charset.join("") : undefined;
  if (cacheKey !== undefined) {
    const cached = predefinedLookupCache.get(cacheKey);
    if (cached) return cached;
  }

  const charCodes = new Uint16Array(charset.length);
  let minCode = 0xffff;
  let maxCode = 0;
  for (let i = 0; i < charset.length; i++) {
    const code = charset[i].charCodeAt(0);
    charCodes[i] = code;
    if (code > maxCode) maxCode = code;
    if (code < minCode) minCode = code;
  }
  const lookupOffset = charset.length > 0 ? minCode : 0;

  const charCodeLookup = new Int32Array(maxCode - lookupOffset + 1);
  charCodeLookup.fill(-1);
  for (let i = 0; i < charset.length; i++) {
    charCodeLookup[charCodes[i] - lookupOffset] = i;
  }

  const result = { charCodeLookup, charCodes, lookupOffset };
  if (cacheKey !== undefined) predefinedLookupCache.set(cacheKey, result);
  return result;
}

/**
 * 코드 유닛에 해당하는 charset 인덱스를 반환합니다.
 * 테이블 범위를 벗어나거나 매핑되지 않은 코드 유닛은 -1을 반환합니다.
 *
 * @param lookup - buildCharsetLookupTables가 생성한 룩업 테이블
 * @param code - UTF-16 코드 유닛 (0 ~ 65535)
 * @param offset - 룩업 테이블 오프셋(`lookupOffset`)
 * @returns charset 인덱스, 또는 미등록 코드 유닛이면 -1
 */
export function lookupCharIndex(lookup: Int32Array, code: number, offset: number): number {
  const i = code - offset;
  return i >= 0 && i < lookup.length ? lookup[i] : -1;
}
