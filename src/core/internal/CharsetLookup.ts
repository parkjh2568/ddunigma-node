/**
 * Charset lookup table builders.
 *
 * @module core/internal/CharsetLookup
 */

export interface CharsetLookupTables {
  charCodeLookup: Int32Array;
  charCodes: Uint16Array;
}

const predefinedLookupCache = new Map<string, CharsetLookupTables>();

/**
 * UTF-16 코드 유닛 → charset 인덱스 직접 룩업 테이블을 생성합니다.
 *
 * 테이블 길이는 charset에서 가장 큰 코드 유닛 + 1로 맞춥니다.
 * (이전 구현은 charset 크기와 무관하게 항상 65536 entry(256KB)를 할당했습니다.
 * ASCII 계열 charset에서는 수백 바이트로 줄어들고, 한글 계열에서도 상한이
 * 줄어듭니다. 테이블 범위를 벗어나는 코드 유닛은 lookupCharIndex가 -1로 처리합니다.)
 *
 * @param charset - 단일 BMP 심볼 charset
 * @returns 코드 유닛 룩업 테이블과 인덱스→코드 유닛 배열
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
  let maxCode = 0;
  for (let i = 0; i < charset.length; i++) {
    const code = charset[i].charCodeAt(0);
    charCodes[i] = code;
    if (code > maxCode) maxCode = code;
  }

  const charCodeLookup = new Int32Array(maxCode + 1);
  charCodeLookup.fill(-1);
  for (let i = 0; i < charset.length; i++) {
    charCodeLookup[charCodes[i]] = i;
  }

  const result = { charCodeLookup, charCodes };
  if (cacheKey !== undefined) predefinedLookupCache.set(cacheKey, result);
  return result;
}

/**
 * 코드 유닛에 해당하는 charset 인덱스를 반환합니다.
 * 테이블 범위를 벗어나거나 매핑되지 않은 코드 유닛은 -1을 반환합니다.
 *
 * @param lookup - buildCharsetLookupTables가 생성한 룩업 테이블
 * @param code - UTF-16 코드 유닛 (0 ~ 65535)
 * @returns charset 인덱스, 또는 미등록 코드 유닛이면 -1
 */
export function lookupCharIndex(lookup: Int32Array, code: number): number {
  return code < lookup.length ? lookup[code] : -1;
}
