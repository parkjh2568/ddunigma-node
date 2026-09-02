/**
 * 난독화 레이어를 위한 한글 음절 매핑 유틸리티.
 *
 * 한국어 음절 블록 범위 U+AC00–U+D7A3에는 11,172개의 조합형 음절이 포함됩니다.
 * 이 모듈은 입력 알파벳별로 가역 변환에 사용할 연속 음절 범위를 구성합니다.
 *
 * 플랫폼 독립적: Node.js 임포트 없음.
 *
 * @module obfuscation/syllableMap
 */

import { Ddu64ObfuscationError } from "../core/errors.js";

// ─── Constants ───────────────────────────────────────────────────────────────

/** 첫 번째 한글 음절 블록 (가) */
export const HANGUL_SYLLABLE_START = 0xac00;

/** 마지막 한글 음절 블록 (힣) */
export const HANGUL_SYLLABLE_END = 0xd7a3;

/** 한글 음절 블록 총 개수 */
export const HANGUL_SYLLABLE_COUNT = HANGUL_SYLLABLE_END - HANGUL_SYLLABLE_START + 1; // 11,172

// ─── Syllable Map ────────────────────────────────────────────────────────────

/**
 * 음절 매핑 설정.
 * 각 입력 문자에 연속된 한글 음절 범위가 할당됩니다.
 */
export interface SyllableMapConfig {
  /** 입력 알파벳 (매핑할 고유 문자) */
  readonly alphabet: string[];
  /** 각 입력 문자에 할당된 음절 수 */
  readonly syllablesPerChar: number;
  /** 문자 → 인덱스 룩업 */
  readonly charToIndex: Map<string, number>;
}

/**
 * 주어진 입력 알파벳에 대한 음절 맵 설정을 생성합니다.
 *
 * 11,172개의 한글 음절을 입력 문자에 균등하게 분배합니다.
 * 각 문자는 `floor(11172 / alphabetSize)`개의 음절을 할당받습니다.
 *
 * @param alphabet - 고유 입력 문자 배열
 * @returns obfuscate/deobfuscate에서 사용할 SyllableMapConfig
 * @throws 알파벳이 비어있거나 음절 범위보다 큰 경우 에러
 */
export function buildSyllableMap(alphabet: string[]): SyllableMapConfig {
  if (alphabet.length === 0) {
    throw new Ddu64ObfuscationError("[Ddu64 obfuscation] Alphabet must not be empty.");
  }
  if (alphabet.length > HANGUL_SYLLABLE_COUNT) {
    throw new Ddu64ObfuscationError(
      `[Ddu64 obfuscation] Alphabet size (${alphabet.length}) exceeds available Hangul syllables (${HANGUL_SYLLABLE_COUNT}).`,
    );
  }

  const syllablesPerChar = Math.floor(HANGUL_SYLLABLE_COUNT / alphabet.length);

  const charToIndex = new Map<string, number>();
  for (let i = 0; i < alphabet.length; i++) {
    charToIndex.set(alphabet[i], i);
  }

  return {
    alphabet,
    syllablesPerChar,
    charToIndex,
  };
}
