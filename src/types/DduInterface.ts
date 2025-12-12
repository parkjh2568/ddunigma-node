import { DduSetSymbol } from "./DduEnums";

export interface CharSetConfig {
  symbol: DduSetSymbol;
  charSet: string[];
  maxRequiredLength: number;
  bitLength: number;
  paddingChar: string;
}

export interface DduOptions {
  compress?: boolean;
}

export interface DduConstructorOptions extends DduOptions {
  dduSetSymbol?: DduSetSymbol;
  dduChar?: string[] | string;
  paddingChar?: string;
  requiredLength?: number;
  bitLength?: number;
  usePowerOfTwo?: boolean;
  useBuildErrorReturn?: boolean;
  encoding?: BufferEncoding;
}
