import { DduOptions } from "../types";

export abstract class BaseDdu {
  protected readonly defaultEncoding: BufferEncoding = "utf-8";

  /**
   * 주어진 숫자보다 작거나 같은 가장 큰 2의 제곱수의 지수를 반환합니다.
   * @param n - 대상 숫자
   * @returns 2의 제곱수 지수 (예: n=8 → 3, n=64 → 6)
   * @example getLargestPowerOfTwoExponent(8) // 3
   * @example getLargestPowerOfTwoExponent(100) // 6
   */
  protected getLargestPowerOfTwoExponent(n: number): number {
    return Math.floor(Math.log2(n));
  }

  /**
   * charset 크기에 필요한 비트 길이를 계산합니다.
   * @param setLength - charset 문자 수
   * @returns 필요한 비트 수
   * @example getBitLength(64) // 6
   * @example getBitLength(100) // 7
   */
  protected getBitLength(setLength: number): number {
    return Math.ceil(Math.log2(setLength));
  }

  /**
   * 입력 데이터를 인코딩합니다.
   * @param input - 인코딩할 문자열 또는 Buffer
   * @param options - 인코딩 옵션
   * @returns 인코딩된 문자열
   */
  abstract encode(input: Buffer | string, options?: DduOptions): string;

  /**
   * 인코딩된 문자열을 Buffer로 디코딩합니다.
   * @param input - 인코딩된 문자열
   * @param options - 디코딩 옵션
   * @returns 디코딩된 Buffer
   */
  abstract decodeToBuffer(input: string, options?: DduOptions): Buffer;

  /**
   * 인코딩된 문자열을 원본 문자열로 디코딩합니다.
   * @param input - 인코딩된 문자열
   * @param options - 디코딩 옵션
   * @returns 디코딩된 문자열
   */
  abstract decode(input: string, options?: DduOptions): string;

  /**
   * 현재 인코더의 charset 정보를 반환합니다.
   * @returns charset 설정 정보 객체
   */
  abstract getCharSetInfo(): {
    charSet: string[];
    paddingChar: string;
    charLength: number;
    bitLength: number;
    usePowerOfTwo: boolean;
    encoding: BufferEncoding;
  };
}
