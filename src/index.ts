export class Ddu64Original {
  private dduChar: string[];
  private paddingChar: string;
  private dduCharKr: string[] = ["뜌", "땨", "이", "우", "야", "!", "?", "."];
  private paddingCharKr: string = "뭐";
  private defaultEncoding: BufferEncoding = "utf-8";

  constructor(dduChar?: string[], paddingChar?: string) {
    this.dduChar = dduChar || this.dduCharKr;
    this.paddingChar = paddingChar || this.paddingCharKr;
  }

  private getBitLength(setLength: number): number {
    return Math.ceil(Math.log2(setLength));
  }

  private *splitString(s: string, length: number): Generator<string> {
    for (let i = 0; i < s.length; i += length) {
      yield s.slice(i, i + length);
    }
  }
  private getSelectedSets(option: string): {
    dduSet: string[];
    padChar: string;
    dduLength: number;
    bitLength: number;
  } {
    if (option === "KR") {
      return {
        dduSet: this.dduCharKr,
        padChar: this.paddingCharKr,
        dduLength: this.dduCharKr.length,
        bitLength: this.getBitLength(this.dduCharKr.length),
      };
    }
    return {
      dduSet: this.dduChar,
      padChar: this.paddingChar,
      dduLength: this.dduChar.length,
      bitLength: this.getBitLength(this.dduChar.length),
    };
  }

  private bufferToDdduBinary(
    input: Buffer,
    bitLength: number
  ): { dduBinary: string[]; padding: number } {
    let encodedBin = "";
    for (const byte of input) {
      const charRaw = byte.toString(2);
      encodedBin += "0".repeat(8 - charRaw.length) + charRaw;
    }
    const dduBinary: string[] = [];
    for (const chunk of this.splitString(encodedBin, bitLength)) {
      dduBinary.push(chunk);
    }
    const padding = bitLength - dduBinary[dduBinary.length - 1].length;
    dduBinary[dduBinary.length - 1] =
      dduBinary[dduBinary.length - 1] + "0".repeat(padding);

    return { dduBinary, padding };
  }

  encode(
    input: Buffer | string,
    option: string = "default",
    encoding?: BufferEncoding
  ): string {
    let bufferInput: Buffer;
    if (typeof input === "string") {
      bufferInput = Buffer.from(input, encoding ?? this.defaultEncoding);
    } else {
      bufferInput = input;
    }
    const { dduSet, padChar, dduLength, bitLength } =
      this.getSelectedSets(option);
    const { dduBinary, padding } = this.bufferToDdduBinary(
      bufferInput,
      bitLength
    );
    let result = "";

    for (const char of dduBinary) {
      const charInt = parseInt(char, 2);
      result +=
        dduSet[Math.floor(charInt / dduLength)] + dduSet[charInt % dduLength];
    }
    result += padChar.repeat(Math.floor(padding / 2));
    return result;
  }

  encode64(
    input: Buffer | string,
    option = "default",
    encoding?: BufferEncoding
  ): string {
    let bufferInput: Buffer;
    if (typeof input === "string") {
      bufferInput = Buffer.from(input, encoding ?? this.defaultEncoding);
    } else {
      bufferInput = input;
    }
    const { dduSet, padChar, dduLength, bitLength } =
      this.getSelectedSets(option);
    const { dduBinary, padding } = this.bufferToDdduBinary(
      bufferInput,
      bitLength
    );
    let result = "";

    for (const char of dduBinary) {
      const charInt = parseInt(char, 2);
      result += dduSet[charInt];
    }
    result += padChar.repeat(Math.floor(padding / 2));
    return result;
  }

  private dduBinaryToBuffer(
    decodedBin: string,
    paddingCount: number
  ): number[] {
    // 패딩 비트 제거
    const paddingBits = paddingCount * 2;
    if (paddingBits > 0) {
      decodedBin = decodedBin.slice(0, -paddingBits);
    }

    const decoded: number[] = [];
    for (const chunk of this.splitString(decodedBin, 8)) {
      if (chunk.length === 8) {
        decoded.push(parseInt(chunk, 2));
      }
    }
    return decoded;
  }

  decode(
    input: string,
    option: string = "default",
    encoding?: BufferEncoding
  ): string {
    const { dduSet, padChar, dduLength, bitLength } =
      this.getSelectedSets(option);

    // 패딩 문자 제거
    const paddingCount = (input.match(new RegExp(padChar, "g")) || []).length;
    input = input.replace(new RegExp(padChar, "g"), "");

    let decodedBin = "";
    for (const chunk of this.splitString(input, 2)) {
      const firstIndex = dduSet.indexOf(chunk[0]);
      const secondIndex = dduSet.indexOf(chunk[1]);
      if (firstIndex === -1 || secondIndex === -1) continue;

      const value = firstIndex * dduLength + secondIndex;
      let char = value.toString(2);
      char = "0".repeat(bitLength - char.length) + char;
      decodedBin += char;
    }

    const decoded: number[] = this.dduBinaryToBuffer(decodedBin, paddingCount);

    return Buffer.from(decoded).toString(encoding ?? this.defaultEncoding);
  }

  decode64(
    input: string,
    option = "default",
    encoding?: BufferEncoding
  ): string {
    const { dduSet, padChar, dduLength, bitLength } =
      this.getSelectedSets(option);

    const paddingCount = (input.match(new RegExp(padChar, "g")) || []).length;
    input = input.replace(new RegExp(padChar, "g"), "");

    let decodedBin = "";
    for (const chunk of this.splitString(input, 1)) {
      const firstIndex = dduSet.indexOf(chunk[0]);
      if (firstIndex === -1) continue;
      const value = firstIndex;
      let char = value.toString(2);
      char = "0".repeat(bitLength - char.length) + char;
      decodedBin += char;
    }
    const decoded: number[] = this.dduBinaryToBuffer(decodedBin, paddingCount);

    return Buffer.from(decoded).toString(encoding ?? this.defaultEncoding);
  }
}
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

  private getLargestPowerOfTwo(n: number): number {
    let power = Math.floor(Math.log2(n));
    return 2**power;
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

  private getSelectedSets64(option: string): {
    dduSet: string[];
    padChar: string;
    dduLength: number;
    bitLength: number;
    lookupTable: Map<string, number>;
    paddingRegExp: RegExp;
  } {
    const baseSet = this.getSelectedSets(option);
    const powerOfTwoLength = this.getLargestPowerOfTwo(baseSet.dduSet.length);
    
    return {
      ...baseSet,
      dduSet: baseSet.dduSet.slice(0, powerOfTwoLength),
      dduLength: powerOfTwoLength,
      bitLength: Math.log2(powerOfTwoLength)
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
    const padding = bitLength - dduBinary[dduBinary.length - 1].length;
    
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
    
    let resultString = "";
    
    for (const char of dduBinary) {
      const charInt = parseInt(char, 2);
      const quotient = Math.floor(charInt / dduLength);
      const remainder = charInt % dduLength;
      resultString += dduSet[quotient] + dduSet[remainder];
    }
    
    if (padding > 0) {
      return resultString + padChar.repeat(Math.floor(padding / 2));
    }
    
    return resultString;
  }

  encode64(
    input: Buffer | string,
    option: string = "default",
    encoding: BufferEncoding = this.defaultEncoding
  ): string {
    const bufferInput = typeof input === 'string' ? Buffer.from(input, encoding) : input;
    const { dduSet, padChar, bitLength } = this.getSelectedSets64(option);
    const { dduBinary, padding } = this.bufferToDdduBinary(bufferInput, bitLength);
    
    let resultString = "";
    
    for (let i = 0; i < dduBinary.length; i++) {
      const charInt = parseInt(dduBinary[i], 2);
      resultString += dduSet[charInt];
    }
    
    if (padding > 0) {
      return resultString + padChar.repeat(Math.floor(padding / 2));
    }
    
    return resultString;
  }

  decode(
    input: string,
    option: string = "default",
    encoding: BufferEncoding = this.defaultEncoding
  ): string {
    const { dduSet, dduLength, bitLength, lookupTable, paddingRegExp } = this.getSelectedSets(option);
    
    const paddingCount = (input.match(paddingRegExp) || []).length;
    input = input.replace(paddingRegExp, '');
    
    let dduBinary = "";
    
    for (let i = 0; i < input.length; i += 2) {
      const firstIndex = lookupTable.get(input[i]);
      const secondIndex = lookupTable.get(input[i + 1]);
      
      if (firstIndex === undefined || secondIndex === undefined) continue;
      
      const value = firstIndex * dduLength + secondIndex;
      dduBinary += value.toString(2).padStart(bitLength, '0');
    }
    
    const decoded = this.dduBinaryToBuffer(dduBinary, paddingCount);
    
    return Buffer.from(decoded).toString(encoding);
  }

  decode64(
    input: string,
    option: string = "default",
    encoding: BufferEncoding = this.defaultEncoding
  ): string {
    const { dduSet, bitLength, lookupTable, paddingRegExp } = this.getSelectedSets64(option);
    
    const paddingCount = (input.match(paddingRegExp) || []).length;
    input = input.replace(paddingRegExp, '');
    
    let dduBinary = '';
    
    for (let i = 0; i < input.length; i++) {
      const charIndex = lookupTable.get(input[i]);
      if (charIndex === undefined) continue;
      dduBinary += charIndex.toString(2).padStart(bitLength, '0');
    }
    
    const decoded = this.dduBinaryToBuffer(dduBinary, paddingCount);
    
    return Buffer.from(decoded).toString(encoding);
  }
}