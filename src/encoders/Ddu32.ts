import { Ddu64 } from "./Ddu64";
import { DduConstructorOptions, DduSetSymbol } from "../types";

/**
 * Base32 스타일 인코더 (32개 문자, 5비트)
 *
 * 대소문자 구분이 없는 환경(DNS, 파일명 등)에서 사용하기 적합합니다.
 *
 * @example
 * const encoder = new Ddu32();
 * const encoded = encoder.encode("Hello");
 * const decoded = encoder.decode(encoded);
 *
 * @example
 * // RFC 4648 Base32
 * const encoder = Ddu32.rfc4648();
 *
 * @example
 * // Crockford's Base32
 * const encoder = Ddu32.crockford();
 */
export class Ddu32 extends Ddu64 {
  /**
   * 기본 Base32 문자셋 (RFC 4648)
   */
  static readonly RFC4648_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

  /**
   * Crockford's Base32 문자셋 (혼동 문자 제외)
   */
  static readonly CROCKFORD_CHARS = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

  /**
   * Extended Hex Base32 문자셋
   */
  static readonly EXTENDED_HEX_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUV";

  /**
   * z-base-32 문자셋 (사람이 읽기 쉬운)
   */
  static readonly ZBASE32_CHARS = "ybndrfg8ejkmcpqxot1uwisza345h769";

  /**
   * Ddu32 인코더를 생성합니다.
   *
   * @param dduChar - 32개 문자 배열 또는 문자열 (기본값: RFC 4648)
   * @param paddingChar - 패딩 문자 (기본값: '=')
   * @param options - 옵션
   */
  constructor(
    dduChar?: string[] | string,
    paddingChar?: string,
    options?: DduConstructorOptions
  ) {
    const chars = dduChar ?? Ddu32.RFC4648_CHARS;
    const padding = paddingChar ?? "=";
    super(chars, padding, {
      ...options,
      requiredLength: 32,
      usePowerOfTwo: true,
    });
  }

  /**
   * RFC 4648 Base32 인코더를 생성합니다.
   */
  static rfc4648(options?: Omit<DduConstructorOptions, "requiredLength" | "usePowerOfTwo">): Ddu32 {
    return new Ddu32(Ddu32.RFC4648_CHARS, "=", options);
  }

  /**
   * Crockford's Base32 인코더를 생성합니다.
   * (혼동되는 문자 I, L, O, U 제외)
   */
  static crockford(options?: Omit<DduConstructorOptions, "requiredLength" | "usePowerOfTwo">): Ddu32 {
    return new Ddu32(Ddu32.CROCKFORD_CHARS, "-", options);
  }

  /**
   * Extended Hex Base32 인코더를 생성합니다.
   */
  static extendedHex(options?: Omit<DduConstructorOptions, "requiredLength" | "usePowerOfTwo">): Ddu32 {
    return new Ddu32(Ddu32.EXTENDED_HEX_CHARS, "=", options);
  }

  /**
   * z-base-32 인코더를 생성합니다.
   * (사람이 발음하기 쉬운 문자셋)
   */
  static zbase32(options?: Omit<DduConstructorOptions, "requiredLength" | "usePowerOfTwo">): Ddu32 {
    return new Ddu32(Ddu32.ZBASE32_CHARS, "=", options);
  }

  /**
   * 한글 기반 32자 인코더를 생성합니다.
   */
  static hangul(options?: Omit<DduConstructorOptions, "requiredLength" | "usePowerOfTwo">): Ddu32 {
    // 한글 초성 19자 + 숫자 등 보충
    const chars = [
      "ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ",
      "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ", "ㄲ", "ㄸ",
      "ㅃ", "ㅆ", "ㅉ", "ㅏ", "ㅑ", "ㅓ", "ㅕ", "ㅗ",
      "ㅛ", "ㅜ", "ㅠ", "ㅡ", "ㅣ", "ㅐ", "ㅔ", "ㅚ",
    ];
    return new Ddu32(chars, "뭐", options);
  }
}

