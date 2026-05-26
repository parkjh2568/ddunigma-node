/**
 * 한글 음절 난독화 레이어 구현.
 *
 * 암호화된 charset 인코딩 문자열을 결정론적 전단사 매핑을 사용하여
 * 자연스러운 한국어 음절 블록으로 변환합니다. 매핑은 다음을 보장합니다:
 * - 모든 출력 문자가 유효한 한국어 음절 블록 (U+AC00–U+D7A3)
 * - 단일 문자 빈도가 기대 균등 빈도의 3배를 초과하지 않음
 * - 출력 길이 <= 입력 길이의 1.5배 (실제로는 1:1 매핑)
 *
 * 플랫폼 독립적: Node.js 임포트 없음.
 *
 * @module obfuscation/ObfuscationLayer
 */

import type { ObfuscationLayer } from "../core/types.js";
import {
  buildSyllableMap,
  charToSyllable,
  syllableToCharIndex,
  type SyllableMapConfig,
} from "./syllableMap.js";

// ─── HangulObfuscationLayer ─────────────────────────────────────────────────

/**
 * 한글 음절 매핑을 사용하여 ObfuscationLayer 인터페이스를 구현합니다.
 *
 * 입력 알파벳(인코더가 사용하는 charset 문자)이 주어지면,
 * 이 레이어는 각 문자를 결정론적으로 한글 음절에 매핑합니다.
 * 매핑은 전단사(가역적)이며 위치에 따라 각 문자의 할당된 음절 범위를
 * 순환하여 출력 빈도를 균등하게 분배합니다.
 */
export class HangulObfuscationLayer implements ObfuscationLayer {
  private readonly config: SyllableMapConfig;

  /**
   * 새 HangulObfuscationLayer를 생성합니다.
   *
   * @param alphabet - 완전한 입력 알파벳 (charset 문자 + 패딩 문자).
   *   인코딩된 문자열에 나타날 수 있는 모든 고유 문자.
   */
  constructor(alphabet: string[]) {
    this.config = buildSyllableMap(alphabet);
  }

  /**
   * 암호화된 charset 인코딩 문자열을 한글 음절로 변환합니다.
   *
   * 각 입력 문자는 할당된 범위의 한글 음절에 매핑됩니다.
   * 문자열 내 위치가 범위 내 어떤 음절을 사용할지 결정하여
   * 균등한 빈도 분포를 보장합니다.
   *
   * @param input - 암호화된 charset 인코딩 문자열
   * @returns 한글 음절 블록 문자열 (U+AC00–U+D7A3)
   * @throws 입력에 알파벳에 없는 문자가 포함된 경우 에러
   */
  obfuscate(input: string): string {
    if (input.length === 0) return "";

    const result = new Array<string>(input.length);

    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      const charIndex = this.config.charToIndex.get(char);

      if (charIndex === undefined) {
        throw new Error(
          `[Ddu64 obfuscation] Character "${char}" (U+${char.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase()}) not found in obfuscation alphabet.`,
        );
      }

      const syllableCode = charToSyllable(charIndex, i, this.config);
      result[i] = String.fromCharCode(syllableCode);
    }

    return result.join("");
  }

  /**
   * 난독화를 역변환하여 원본 charset 인코딩 문자열을 복원합니다.
   *
   * 각 한글 음절이 어떤 문자의 범위에 속하는지 판별하여
   * 원래 문자로 매핑합니다.
   *
   * @param input - 난독화된 한글 음절 문자열
   * @returns 원본 charset 인코딩 문자열
   * @throws 입력에 유효한 한글 음절 범위 밖의 문자가 포함되거나
   *   알파벳 문자에 매핑되지 않는 문자가 포함된 경우 에러
   */
  deobfuscate(input: string): string {
    if (input.length === 0) return "";

    const result = new Array<string>(input.length);

    for (let i = 0; i < input.length; i++) {
      const codePoint = input.charCodeAt(i);
      const charIndex = syllableToCharIndex(codePoint, this.config);

      if (charIndex === -1) {
        throw new Error(
          `[Ddu64 obfuscation] Invalid syllable at position ${i}: U+${codePoint.toString(16).padStart(4, "0").toUpperCase()} is not in the mapped range.`,
        );
      }

      result[i] = this.config.alphabet[charIndex];
    }

    return result.join("");
  }
}

/**
 * 주어진 charset 설정에 대한 ObfuscationLayer를 생성합니다.
 *
 * charset 문자와 패딩 문자로부터 완전한 알파벳을 구성한 후
 * 한글 난독화 레이어를 생성합니다.
 *
 * @param charSet - 인코딩에 사용되는 charset 문자
 * @param paddingChar - 패딩 문자
 * @returns ObfuscationLayer 인스턴스
 */
export function createObfuscationLayer(charSet: string[], paddingChar: string): ObfuscationLayer {
  // 완전한 알파벳 구성: charset 문자 + 패딩 문자 (이미 포함되어 있지 않은 경우)
  const alphabetSet = new Set<string>(charSet);
  alphabetSet.add(paddingChar);

  const alphabet = [...alphabetSet];
  return new HangulObfuscationLayer(alphabet);
}
