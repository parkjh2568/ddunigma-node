import { DduSetSymbol } from "./DduEnums";

export interface CharSetConfig {
    symbol: DduSetSymbol;
    charSet: string[];
    maxRequiredLength: number;
    bitLength: number;
    paddingChar: string;
  }
  
  export interface DduOptions {
    // options는 현재 사용하지 않지만 호환성을 위해 유지
  }
  
  export interface DduConstructorOptions {
    dduSetSymbol?: DduSetSymbol;
    dduChar?: string[] | string;
    paddingChar?: string;
    requiredLength?: number;
    bitLength?: number;
    usePowerOfTwo?: boolean;
    useBuildErrorReturn?: boolean;
    encoding?: BufferEncoding;
  }
  
export interface BufferToDduBinaryResult {
  dduBinary: string[];
  padding: number;
}
  
  