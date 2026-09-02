/**
 * Charset 초기화 및 검증 로직.
 *
 * @module core/CharsetResolver
 */

import { buildCodaCharset, isKnownCodaChar, URL_SAFE_CONFLICT_CHARS } from "./codecUtils.js";
import type { DduConstructorOptions, EncodingProfile } from "./types.js";
import { DduSetSymbol, dduDefaultConstructorOptions } from "./types.js";
import { getCharSet } from "../presets.js";

// ─── Types ───────────────────────────────────────────────────────────────────

/** charset 해석 결과 */
export interface ResolvedCharSet {
  charSet: string[];
  padding: string;
  requiredLength: number;
  bitLength: number;
  isPredefined: boolean;
  useRepeatPadding?: boolean;
  bitsPerPadChar?: number;
  usePowerOfTwo?: boolean;
  encodingProfile?: EncodingProfile;
}

/** charset 정규화 결과 */
export interface NormalizedCharSet {
  charSet: string[];
  padding: string;
  isPredefined: boolean;
}

// ─── Charset 해석 ────────────────────────────────────────────────────────────

/**
 * 생성자 인자로부터 초기 charset을 해석합니다.
 *
 * @param dduChar - 사용자 제공 charset (문자열 또는 배열)
 * @param paddingChar - 사용자 제공 패딩 문자
 * @param dduOptions - 생성자 옵션
 * @param shouldThrow - 에러 시 throw 여부
 * @returns 해석된 charset 정보
 */
export function resolveInitialCharSet(
  dduChar: string[] | string | undefined,
  paddingChar: string | undefined,
  dduOptions: DduConstructorOptions | undefined,
  shouldThrow: boolean,
): ResolvedCharSet {
  const buildMeta = (
    set: string[],
    padding: string,
    length: number,
    isPredefined: boolean,
    useRepeatPadding?: boolean,
  ): ResolvedCharSet => {
    const usePow2 =
      dduOptions?.usePowerOfTwo === undefined
        ? length > 0 && (length & (length - 1)) === 0
        : dduOptions.usePowerOfTwo && length > 0;
    if (usePow2 && length > 0) {
      const exponent = Math.floor(Math.log2(length));
      const pow2Length = 1 << exponent;
      const selected = set.length === pow2Length ? set : set.slice(0, pow2Length);
      return {
        charSet: selected,
        padding,
        requiredLength: pow2Length,
        bitLength: exponent,
        isPredefined,
        useRepeatPadding,
      };
    }
    const selected = set.length === length ? set : set.slice(0, length);
    return {
      charSet: selected,
      padding,
      requiredLength: length,
      bitLength: length > 0 ? Math.ceil(Math.log2(length)) : 0,
      isPredefined,
      useRepeatPadding,
    };
  };

  try {
    const finalDduChar = dduChar ?? dduOptions?.dduChar;
    const finalPadding = paddingChar ?? dduOptions?.paddingChar;

    if (finalDduChar !== undefined) {
      if (!finalPadding) {
        throw new Error(`[Ddu64 Constructor] paddingChar is required when dduChar is provided.`);
      }

      let arr = typeof finalDduChar === "string" ? [...finalDduChar] : [...finalDduChar];

      const codaChar = dduOptions?.codaChar;
      const hasCoda = codaChar !== undefined && codaChar.length > 0;
      const useRepeatPad = hasCoda ? true : (dduOptions?.useRepeatPadding ?? false);
      if (hasCoda) {
        // 알 수 없는 종성은 combineCoda에서 종성-없음(인덱스 0)으로 접혀 중복 심볼을
        // 만들 수 있으므로, throwOnError일 때 명확한 에러로 알립니다.
        if (shouldThrow) {
          const unknownCoda = codaChar.filter((c) => !isKnownCodaChar(c));
          if (unknownCoda.length > 0) {
            throw new Error(
              `[Ddu64 Constructor] Unknown coda character(s): [${unknownCoda.join(", ")}]. ` +
                `Coda must be empty ("") or a Hangul jongseong jamo (ㄱ, ㄲ, ㄳ, … ㅎ). ` +
                `Unknown coda collapses to no-coda and can create duplicate symbols.`,
            );
          }
        }
        arr = buildCodaCharset(arr, codaChar);
      }

      if (shouldThrow) {
        const uniqueSize = new Set(arr).size;
        if (uniqueSize !== arr.length) {
          const duplicates = arr.filter((c, i) => arr.indexOf(c) !== i);
          throw new Error(
            `[Ddu64 Constructor] Character set contains duplicate characters: [${[...new Set(duplicates)].join(", ")}]`,
          );
        }
      }

      const reqLen = dduOptions?.requiredLength ?? arr.length;
      if (arr.length < reqLen) {
        throw new Error(`[Ddu64 Constructor] Insufficient characters.`);
      }

      return buildMeta(arr, finalPadding, reqLen, false, useRepeatPad);
    }

    const symbol =
      dduOptions?.dduSetSymbol ?? dduDefaultConstructorOptions.dduSetSymbol ?? DduSetSymbol.DDU;
    const cs = getCharSet(symbol);
    if (!cs) throw new Error(`CharSet with symbol ${symbol} not found`);
    const resolvedCharSet = cs.codaChar ? buildCodaCharset(cs.charSet, cs.codaChar) : cs.charSet;
    const result = buildMeta(
      resolvedCharSet,
      cs.paddingChar,
      cs.maxRequiredLength,
      true,
      cs.useRepeatPadding,
    );
    const profile = cs.encodingProfile;
    if (profile) {
      result.encodingProfile = profile;
      result.bitLength = profile.bitLength;
      result.usePowerOfTwo = profile.usePowerOfTwo;
      result.bitsPerPadChar = profile.bitsPerPadChar;
    } else {
      result.bitsPerPadChar = cs.bitsPerPadChar;
      result.usePowerOfTwo = cs.usePowerOfTwo;
      if (cs.usePowerOfTwo === false) {
        result.bitLength = cs.bitLength;
      }
    }
    return result;
  } catch (error) {
    if (shouldThrow) throw error;
    return getFallbackCharSet(dduOptions);
  }
}

// ─── Charset 정규화 ──────────────────────────────────────────────────────────

/**
 * 해석된 charset을 검증하고 정규화합니다.
 *
 * @param current - 해석된 charset 정보
 * @param shouldThrow - 에러 시 throw 여부
 * @param dduOptions - 생성자 옵션
 * @returns 정규화된 charset 정보
 */
export function normalizeCharSet(
  current: ResolvedCharSet,
  shouldThrow: boolean,
  dduOptions?: DduConstructorOptions,
): NormalizedCharSet {
  const attempts = [current, null] as const;

  for (const attempt of attempts) {
    const state = attempt ? { ...attempt } : getFallbackCharSet(dduOptions);

    try {
      let charSet = state.charSet;
      let requiredLength = state.requiredLength;
      const uniqueChars = Array.from(new Set(charSet));
      if (uniqueChars.length !== charSet.length) {
        if (shouldThrow) {
          const duplicates = charSet.filter((c, i) => charSet.indexOf(c) !== i);
          throw new Error(
            `[Ddu64 normalizeCharSet] Character set contains duplicate characters: [${[...new Set(duplicates)].join(", ")}]`,
          );
        }
        charSet = uniqueChars;
        if (!state.isPredefined) requiredLength = charSet.length;
      }

      if (charSet.length < requiredLength) {
        throw new Error(
          `[Ddu64 normalizeCharSet] Insufficient characters. Required: ${requiredLength}, Has: ${charSet.length}`,
        );
      }
      if (requiredLength < 2) {
        throw new Error(`[Ddu64 normalizeCharSet] At least 2 unique characters required.`);
      }
      const multiCharSymbol = charSet.find((c) => c.length !== 1);
      if (multiCharSymbol) {
        if (shouldThrow) {
          throw new Error(`[Ddu64 normalizeCharSet] Multi-character symbols are not supported.`);
        }
        continue;
      }

      if (state.padding.length !== 1) {
        throw new Error(
          `[Ddu64 normalizeCharSet] Padding length mismatch. Expected 1, got ${state.padding.length}`,
        );
      }
      if (charSet.includes(state.padding)) {
        if (shouldThrow) {
          throw new Error(
            `[Ddu64 normalizeCharSet] Padding character "${state.padding}" conflicts with charset.`,
          );
        }
        charSet = charSet.filter((c) => c !== state.padding);
        if (charSet.length < requiredLength || charSet.length < 2) {
          throw new Error(
            `[Ddu64 normalizeCharSet] Padding removal left too few characters. Required: ${requiredLength}, Has: ${charSet.length}`,
          );
        }
      }

      for (const c of charSet) {
        if (c.includes("\n") || c.includes("\r")) {
          throw new Error(
            `[Ddu64 normalizeCharSet] Newline and carriage return characters are reserved.`,
          );
        }
        if (isLoneSurrogate(c)) {
          throw new Error(
            `[Ddu64 normalizeCharSet] Lone surrogate code unit (U+${c
              .charCodeAt(0)
              .toString(16)
              .toUpperCase()}) is not allowed; it corrupts on UTF-8/URL/JSON boundaries.`,
          );
        }
      }
      if (state.padding.includes("\n") || state.padding.includes("\r")) {
        throw new Error(
          `[Ddu64 normalizeCharSet] Newline and carriage return characters are reserved.`,
        );
      }
      if (isLoneSurrogate(state.padding)) {
        throw new Error(
          `[Ddu64 normalizeCharSet] Padding character must not be a lone surrogate code unit.`,
        );
      }

      const finalSet =
        charSet.length === requiredLength ? charSet : charSet.slice(0, requiredLength);

      return { charSet: finalSet, padding: state.padding, isPredefined: state.isPredefined };
    } catch (e: unknown) {
      if (shouldThrow) throw e;
    }
  }

  const fallback = getFallbackCharSet(dduOptions);
  return {
    charSet: fallback.charSet.slice(0, fallback.requiredLength),
    padding: fallback.padding,
    isPredefined: true,
  };
}

// ─── URL-Safe 검증 ───────────────────────────────────────────────────────────

/**
 * charset과 패딩 문자가 URL-Safe 모드와 호환되는지 검증합니다.
 */
export function isUrlSafeCompatible(
  charSet: string[],
  paddingChar: string,
  shouldThrow: boolean,
): boolean {
  for (const ch of URL_SAFE_CONFLICT_CHARS) {
    for (const c of charSet) {
      if (c.includes(ch)) {
        const msg = `[Ddu64 Constructor] URL-Safe mode conflict: charset character "${c}" contains "${ch}".`;
        if (shouldThrow) throw new Error(msg);
        return false;
      }
    }
    if (paddingChar.includes(ch)) {
      const msg = `[Ddu64 Constructor] URL-Safe mode conflict: padding character "${paddingChar}" contains "${ch}".`;
      if (shouldThrow) throw new Error(msg);
      return false;
    }
  }
  return true;
}

// ─── 내부 헬퍼 ───────────────────────────────────────────────────────────────

/** 단일 UTF-16 코드 유닛이 짝 없는 surrogate(U+D800–U+DFFF)인지 판별합니다. */
function isLoneSurrogate(symbol: string): boolean {
  if (symbol.length !== 1) return false;
  const code = symbol.charCodeAt(0);
  return code >= 0xd800 && code <= 0xdfff;
}

function getFallbackCharSet(dduOptions?: DduConstructorOptions): ResolvedCharSet {
  const symbol =
    dduOptions?.dduSetSymbol ??
    dduDefaultConstructorOptions.dduSetSymbol ??
    DduSetSymbol.ONECHARSET;
  const cs = getCharSet(symbol) ?? getCharSet(DduSetSymbol.ONECHARSET);
  if (!cs) throw new Error(`Critical: No fallback CharSet available`);
  const charSet = cs.codaChar ? buildCodaCharset(cs.charSet, cs.codaChar) : cs.charSet;
  return {
    charSet,
    padding: cs.paddingChar,
    requiredLength: cs.maxRequiredLength,
    bitLength: cs.encodingProfile?.bitLength ?? cs.bitLength,
    isPredefined: true,
    useRepeatPadding: cs.useRepeatPadding,
    bitsPerPadChar: cs.encodingProfile?.bitsPerPadChar ?? cs.bitsPerPadChar,
    usePowerOfTwo: cs.encodingProfile?.usePowerOfTwo ?? cs.usePowerOfTwo,
    encodingProfile: cs.encodingProfile,
  };
}
