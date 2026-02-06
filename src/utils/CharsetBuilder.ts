/**
 * 커스텀 Charset을 쉽게 생성하기 위한 빌더 클래스
 *
 * @example
 * const chars = CharsetBuilder
 *   .fromUnicodeRange(0x4E00, 0x4E3F)
 *   .excludeConfusing()
 *   .shuffle()
 *   .build();
 */
export class CharsetBuilder {
  private chars: string[] = [];

  private constructor() {}

  /**
   * 빈 빌더를 생성합니다.
   */
  static create(): CharsetBuilder {
    return new CharsetBuilder();
  }

  /**
   * 유니코드 범위에서 문자들을 추가합니다.
   *
   * @param start - 시작 유니코드 코드포인트
   * @param end - 끝 유니코드 코드포인트 (포함)
   */
  static fromUnicodeRange(start: number, end: number): CharsetBuilder {
    const builder = new CharsetBuilder();
    return builder.addUnicodeRange(start, end);
  }

  /**
   * 문자열에서 문자들을 추가합니다.
   *
   * @param chars - 문자열 또는 문자 배열
   */
  static fromString(chars: string | string[]): CharsetBuilder {
    const builder = new CharsetBuilder();
    return builder.addString(chars);
  }

  /**
   * Base64 표준 문자셋으로 시작합니다.
   */
  static base64(): CharsetBuilder {
    const builder = new CharsetBuilder();
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    return builder.addString(chars);
  }

  /**
   * Base32 표준 문자셋으로 시작합니다.
   */
  static base32(): CharsetBuilder {
    const builder = new CharsetBuilder();
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    return builder.addString(chars);
  }

  /**
   * 영문 대문자만 포함합니다.
   */
  static uppercase(): CharsetBuilder {
    return CharsetBuilder.fromUnicodeRange(65, 90); // A-Z
  }

  /**
   * 영문 소문자만 포함합니다.
   */
  static lowercase(): CharsetBuilder {
    return CharsetBuilder.fromUnicodeRange(97, 122); // a-z
  }

  /**
   * 숫자만 포함합니다.
   */
  static digits(): CharsetBuilder {
    return CharsetBuilder.fromUnicodeRange(48, 57); // 0-9
  }

  /**
   * 한글 자모를 포함합니다.
   */
  static hangulJamo(): CharsetBuilder {
    const builder = new CharsetBuilder();
    // 초성 19자 + 중성 21자 + 종성 27자
    return builder
      .addUnicodeRange(0x1100, 0x1112) // 초성
      .addUnicodeRange(0x1161, 0x1175) // 중성
      .addUnicodeRange(0x11A8, 0x11C2); // 종성
  }

  /**
   * 유니코드 범위에서 문자들을 추가합니다.
   */
  addUnicodeRange(start: number, end: number): CharsetBuilder {
    for (let i = start; i <= end; i++) {
      this.chars.push(String.fromCodePoint(i));
    }
    return this;
  }

  /**
   * 문자열에서 문자들을 추가합니다.
   */
  addString(chars: string | string[]): CharsetBuilder {
    if (typeof chars === "string") {
      this.chars.push(...[...chars]);
    } else {
      this.chars.push(...chars);
    }
    return this;
  }

  /**
   * 특정 문자들을 추가합니다.
   */
  add(...chars: string[]): CharsetBuilder {
    this.chars.push(...chars);
    return this;
  }

  /**
   * 혼동하기 쉬운 문자들을 제거합니다.
   * (0, O, o, 1, l, I, i 등)
   */
  excludeConfusing(): CharsetBuilder {
    const confusing = new Set(["0", "O", "o", "1", "l", "I", "i", "|", "L"]);
    this.chars = this.chars.filter((c) => !confusing.has(c));
    return this;
  }

  /**
   * 특정 문자들을 제거합니다.
   */
  exclude(...chars: string[]): CharsetBuilder {
    const excludeSet = new Set(chars);
    this.chars = this.chars.filter((c) => !excludeSet.has(c));
    return this;
  }

  /**
   * URL에서 안전하지 않은 문자들을 제거합니다.
   */
  excludeUrlUnsafe(): CharsetBuilder {
    const unsafe = new Set(["+", "/", "=", "?", "&", "#", "%", " "]);
    this.chars = this.chars.filter((c) => !unsafe.has(c));
    return this;
  }

  /**
   * 중복 문자를 제거합니다.
   */
  unique(): CharsetBuilder {
    this.chars = [...new Set(this.chars)];
    return this;
  }

  /**
   * 문자셋을 무작위로 섞습니다.
   */
  shuffle(seed?: number): CharsetBuilder {
    const random = seed !== undefined ? this.seededRandom(seed) : Math.random;
    for (let i = this.chars.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [this.chars[i], this.chars[j]] = [this.chars[j], this.chars[i]];
    }
    return this;
  }

  /**
   * 시드 기반 난수 생성기
   */
  private seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = Math.sin(s) * 10000;
      return s - Math.floor(s);
    };
  }

  /**
   * 특정 길이로 자릅니다.
   */
  limit(length: number): CharsetBuilder {
    this.chars = this.chars.slice(0, length);
    return this;
  }

  /**
   * 2의 제곱수 길이로 자릅니다.
   */
  limitToPowerOfTwo(): CharsetBuilder {
    const len = this.chars.length;
    if (len === 0) return this;
    const pow2 = Math.pow(2, Math.floor(Math.log2(len)));
    this.chars = this.chars.slice(0, pow2);
    return this;
  }

  /**
   * 문자셋을 정렬합니다.
   */
  sort(): CharsetBuilder {
    this.chars.sort();
    return this;
  }

  /**
   * 역순으로 정렬합니다.
   */
  reverse(): CharsetBuilder {
    this.chars.reverse();
    return this;
  }

  /**
   * 현재 문자 수를 반환합니다.
   */
  get length(): number {
    return this.chars.length;
  }

  /**
   * 문자셋을 문자열로 빌드합니다.
   */
  buildString(): string {
    return this.chars.join("");
  }

  /**
   * 문자셋을 배열로 빌드합니다.
   */
  build(): string[] {
    return [...this.chars];
  }

  /**
   * 문자셋과 패딩 문자를 함께 빌드합니다.
   *
   * @param paddingChar - 패딩 문자 (기본값: charset에서 제외된 첫 번째 문자)
   */
  buildWithPadding(paddingChar?: string): { charset: string[]; padding: string } {
    const charset = [...this.chars];
    let padding = paddingChar;

    if (!padding) {
      // 패딩 문자로 사용할 수 있는 문자 찾기
      const commonPaddings = ["=", ".", "_", "-", "~", "!"];
      for (const p of commonPaddings) {
        if (!charset.includes(p)) {
          padding = p;
          break;
        }
      }
      // 적절한 패딩을 찾지 못한 경우
      if (!padding) {
        throw new Error("Cannot find suitable padding character");
      }
    }

    return { charset, padding };
  }
}

