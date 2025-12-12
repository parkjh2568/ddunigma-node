import { DduSetSymbol } from "./DduEnums";
import { DduConstructorOptions } from "./DduInterface";

const dduDefaultConstructorOptions: DduConstructorOptions = {
  /** 기본 charset: DDU (한글 + 특수문자) */
  dduSetSymbol: DduSetSymbol.DDU,
  /** 2의 제곱수 강제 */
  usePowerOfTwo: true,
  /** 필요 문자 수: 8개 */
  requiredLength: 8,
  /** 비트 길이: 3 (2^3 = 8) */
  bitLength: 3,
  /** 빌드 에러 시 throw하지 않음 */
  useBuildErrorReturn: false,
};

export { dduDefaultConstructorOptions };
