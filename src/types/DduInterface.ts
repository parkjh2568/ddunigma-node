import { DduSetSymbol } from "./DduEnums";

export interface CharSetConfig {
    symbol: DduSetSymbol;
    charSet: string[];
    maxRequiredLength: number;
    bitLength: number;
    paddingChar: string;
  }
  
  export interface DduOptions {
    dduSetSymbol?: DduSetSymbol;
    encoding?: BufferEncoding;
    usePowerOfTwo?: boolean;
  }
  
  export interface DduConstructorOptions extends DduOptions {
    dduChar?: string[] | string;
    paddingChar?: string;
    requiredLength?: number;
    bitLength?: number;
    useBuildErrorReturn?: boolean;
  }
  
  export interface SelectedSets {
    dduSet: string[];
    padChar: string;
    dduLength: number;
    bitLength: number;
    lookupTable: Map<string, number>;
    paddingRegExp: RegExp;
  }
  
  export interface BufferToDduBinaryResult {
    dduBinary: string[];
    padding: number;
  }
  
  export interface EncoderConstructorOptions {
    dduChar?: string[] | string;
    paddingChar?: string;
  }
  
  export interface FixedLengthEncoderOptions {
    dduChar?: string[];
    paddingChar?: string;
  }
  
  