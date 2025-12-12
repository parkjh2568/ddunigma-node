import { DduSetSymbol } from "./DduEnums";

export interface CharSetConfig {
  /** charset 식별 심볼 */
  symbol: DduSetSymbol;
  /** 인코딩에 사용할 문자 배열 */
  charSet: string[];
  /** 최대 필요 문자 수 */
  maxRequiredLength: number;
  /** 비트 길이 (log2) */
  bitLength: number;
  /** 패딩 문자 */
  paddingChar: string;
}

export interface DduOptions {
  /** 압축 사용 여부 (zlib deflate) */
  compress?: boolean;
  /** 최대 디코딩 바이트 수 (Zip Bomb 방어) */
  maxDecodedBytes?: number;
  /** 최대 압축해제 바이트 수 (Zip Bomb 방어) */
  maxDecompressedBytes?: number;
}

export interface DduConstructorOptions extends DduOptions {
  /** 미리 정의된 charset 심볼 */
  dduSetSymbol?: DduSetSymbol;
  /** 커스텀 charset 문자 배열 또는 문자열 */
  dduChar?: string[] | string;
  /** 패딩 문자 */
  paddingChar?: string;
  /** 필요 문자 수 */
  requiredLength?: number;
  /** 비트 길이 */
  bitLength?: number;
  /** 2의 제곱수 강제 여부 */
  usePowerOfTwo?: boolean;
  /** 빌드 에러 시 throw 여부 */
  useBuildErrorReturn?: boolean;
  /** Buffer 인코딩 방식 */
  encoding?: BufferEncoding;
}
