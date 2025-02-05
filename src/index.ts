export class Ddu64 {
  private readonly dduChar: string[];
  private readonly paddingChar: string;
  private readonly dduCharKr: string[] = ["뜌", "땨", "이", "우", "야", "!", "?", "."];
  private readonly paddingCharKr: string = "뭐";
  private readonly defaultEncoding: BufferEncoding = "utf-8";

  private readonly bitLengthMap: Map<number, number>;
  private readonly binaryLookup: string[];
  private readonly dduBinaryLookup: Map<string, number>;
  private readonly dduBinaryLookupKr: Map<string, number>;
  private readonly paddingRegex: Map<string, RegExp>;

  constructor(dduChar?: string[], paddingChar?: string) {
    this.dduChar = dduChar || this.dduCharKr;
    this.paddingChar = paddingChar || this.paddingCharKr;
    
    this.bitLengthMap = new Map();
    this.binaryLookup = new Array(256);
    this.dduBinaryLookup = new Map();
    this.dduBinaryLookupKr = new Map();
    this.paddingRegex = new Map();
    
    for (let i = 0; i < 256; i++) {
      this.binaryLookup[i] = i.toString(2).padStart(8, '0');
    }
    
    this.dduChar.forEach((char, index) => {
      this.dduBinaryLookup.set(char, index);
    });

    this.dduCharKr.forEach((char, index) => {
      this.dduBinaryLookupKr.set(char, index);
    });

    this.paddingRegex.set('default', new RegExp(this.paddingChar, "g"));
    this.paddingRegex.set('KR', new RegExp(this.paddingCharKr, "g"));
  }

  private getBitLength(setLength: number): number {
    let cached = this.bitLengthMap.get(setLength);
    if (cached === undefined) {
      cached = Math.ceil(Math.log2(setLength));
      this.bitLengthMap.set(setLength, cached);
    }
    return cached;
  }

  private *splitString(s: string, length: number): Generator<string> {
    const len = s.length;
    for (let i = 0; i < len; i += length) {
      yield s.slice(i, Math.min(i + length, len));
    }
  }

  private getSelectedSets(option: string): {
    dduSet: string[];
    padChar: string;
    dduLength: number;
    bitLength: number;
    lookupTable: Map<string, number>;
    paddingRegExp: RegExp;
  } {
    if (option === "KR") {
      return {
        dduSet: this.dduCharKr,
        padChar: this.paddingCharKr,
        dduLength: this.dduCharKr.length,
        bitLength: this.getBitLength(this.dduCharKr.length),
        lookupTable: this.dduBinaryLookupKr,
        paddingRegExp: this.paddingRegex.get('KR')!
      };
    }
    return {
      dduSet: this.dduChar,
      padChar: this.paddingChar,
      dduLength: this.dduChar.length,
      bitLength: this.getBitLength(this.dduChar.length),
      lookupTable: this.dduBinaryLookup,
      paddingRegExp: this.paddingRegex.get('default')!
    };
  }

  private bufferToDdduBinary(
    input: Buffer,
    bitLength: number
  ): { dduBinary: string[]; padding: number } {
    const bufferLength = input.length;
    let encodedBin = '';
    
    for (let i = 0; i < bufferLength; i++) {
      encodedBin += this.binaryLookup[input[i]];
    }

    const dduBinary = Array.from(this.splitString(encodedBin, bitLength));
    const lastChunkLength = dduBinary[dduBinary.length - 1].length;
    const padding = bitLength - lastChunkLength;
    
    if (padding > 0) {
      dduBinary[dduBinary.length - 1] += '0'.repeat(padding);
    }

    return { dduBinary, padding };
  }

  private dduBinaryToBuffer(
    decodedBin: string,
    paddingCount: number
  ): number[] {
    const paddingBits = paddingCount * 2;
    if (paddingBits > 0) {
      decodedBin = decodedBin.slice(0, -paddingBits);
    }

    const chunkCount = Math.floor(decodedBin.length / 8);
    const buffer = new Array(chunkCount);
    
    for (let i = 0; i < chunkCount; i++) {
      const start = i * 8;
      buffer[i] = parseInt(decodedBin.slice(start, start + 8), 2);
    }
    
    return buffer;
  }

  encode(
    input: Buffer | string,
    option: string = "default",
    encoding: BufferEncoding = this.defaultEncoding
  ): string {
    const bufferInput = typeof input === 'string' ? Buffer.from(input, encoding) : input;
    const { dduSet, padChar, dduLength, bitLength } = this.getSelectedSets(option);
    const { dduBinary, padding } = this.bufferToDdduBinary(bufferInput, bitLength);
    
    const resultArray = new Array(dduBinary.length * 2);
    let arrayIndex = 0;
    
    for (const char of dduBinary) {
      const charInt = parseInt(char, 2);
      const quotient = Math.floor(charInt / dduLength);
      const remainder = charInt % dduLength;
      resultArray[arrayIndex++] = dduSet[quotient];
      resultArray[arrayIndex++] = dduSet[remainder];
    }
    
    if (padding > 0) {
      return resultArray.join('') + padChar.repeat(Math.floor(padding / 2));
    }
    
    return resultArray.join('');
  }

  encode64(
    input: Buffer | string,
    option: string = "default",
    encoding: BufferEncoding = this.defaultEncoding
  ): string {
    const bufferInput = typeof input === 'string' ? Buffer.from(input, encoding) : input;
    const { dduSet, padChar, bitLength } = this.getSelectedSets(option);
    const { dduBinary, padding } = this.bufferToDdduBinary(bufferInput, bitLength);
    
    const resultArray = new Array(dduBinary.length);
    
    for (let i = 0; i < dduBinary.length; i++) {
      const charInt = parseInt(dduBinary[i], 2);
      resultArray[i] = dduSet[charInt];
    }
    
    if (padding > 0) {
      return resultArray.join('') + padChar.repeat(Math.floor(padding / 2));
    }
    
    return resultArray.join('');
  }

  decode(
    input: string,
    option: string = "default",
    encoding: BufferEncoding = this.defaultEncoding
  ): string {
    const { dduSet, dduLength, bitLength, lookupTable, paddingRegExp } = this.getSelectedSets(option);
    
    const paddingCount = (input.match(paddingRegExp) || []).length;
    input = input.replace(paddingRegExp, '');
    
    const decodedBinParts = new Array(Math.floor(input.length / 2));
    let partIndex = 0;
    
    for (let i = 0; i < input.length; i += 2) {
      const firstIndex = lookupTable.get(input[i]);
      const secondIndex = lookupTable.get(input[i + 1]);
      
      if (firstIndex === undefined || secondIndex === undefined) continue;
      
      const value = firstIndex * dduLength + secondIndex;
      decodedBinParts[partIndex++] = value.toString(2).padStart(bitLength, '0');
    }
    
    const decodedBin = decodedBinParts.join('');
    const decoded = this.dduBinaryToBuffer(decodedBin, paddingCount);
    
    return Buffer.from(decoded).toString(encoding);
  }

  decode64(
    input: string,
    option: string = "default",
    encoding: BufferEncoding = this.defaultEncoding
  ): string {
    const { dduSet, bitLength, lookupTable, paddingRegExp } = this.getSelectedSets(option);
    
    const paddingCount = (input.match(paddingRegExp) || []).length;
    input = input.replace(paddingRegExp, '');
    
    const decodedBinParts = new Array(input.length);
    let partIndex = 0;
    
    for (let i = 0; i < input.length; i++) {
      const charIndex = lookupTable.get(input[i]);
      if (charIndex === undefined) continue;
      
      decodedBinParts[partIndex++] = charIndex.toString(2).padStart(bitLength, '0');
    }
    
    const decodedBin = decodedBinParts.join('');
    const decoded = this.dduBinaryToBuffer(decodedBin, paddingCount);
    
    return Buffer.from(decoded).toString(encoding);
  }
}