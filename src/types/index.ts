export enum DduSetSymbol {
  USED = "used",
  DEFAULT = "default",
  DDU = "ddu",
}

export interface EncodeOptions {
  dduSetSymbol?: DduSetSymbol;  
  encoding?: BufferEncoding;
  usePowerOfTwo?: boolean;
}

export interface DecodeOptions {
  dduSetSymbol?: DduSetSymbol;
  encoding?: BufferEncoding;
  usePowerOfTwo?: boolean;
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

