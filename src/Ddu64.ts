export class Ddu64 {
  private readonly dduChar: string[];
  private readonly paddingChar: string;
  private readonly dduCharDefault: string[] = [
    "뜌",
    "땨",
    "이",
    "우",
    "야",
    "!",
    "?",
    ".",
  ];
  private readonly paddingCharDefault: string = "뭐";
  private readonly defaultEncoding: BufferEncoding = "utf-8";

  private readonly bitLengthMap: Map<number, number> = new Map();
  private readonly binaryLookup: string[] = Array.from(
    { length: 256 },
    (_, i) => i.toString(2).padStart(8, "0")
  );
  private readonly dduBinaryLookup: Map<string, number> = new Map();
  private readonly dduBinaryLookupKr: Map<string, number> = new Map();
  private readonly paddingRegex: Map<string, RegExp> = new Map();

  constructor(dduChar?: string[] | string, paddingChar?: string) {
    if (typeof dduChar === "string") {
      const removeDuplicatesString = [...new Set(dduChar.trim())].join("");
      this.dduChar = removeDuplicatesString.trim().split("");
    } else {
      this.dduChar = dduChar || this.dduCharDefault;
    }
    this.paddingChar = paddingChar || this.paddingCharDefault;

    this.dduChar.forEach((char, index) =>
      this.dduBinaryLookup.set(char, index)
    );
    this.dduCharDefault.forEach((char, index) =>
      this.dduBinaryLookupKr.set(char, index)
    );

    this.paddingRegex.set("default", new RegExp(this.paddingChar, "g"));
    this.paddingRegex.set("KR", new RegExp(this.paddingCharDefault, "g"));
  }

  private getBitLength(setLength: number): number {
    let cached = this.bitLengthMap.get(setLength);
    if (cached === undefined) {
      cached = Math.ceil(Math.log2(setLength));
      this.bitLengthMap.set(setLength, cached);
    }
    return cached;
  }

  private getLargestPowerOfTwo(n: number): number {
    return 2 ** Math.floor(Math.log2(n));
  }

  private *splitString(s: string, length: number): Generator<string> {
    for (let i = 0; i < s.length; i += length) {
      yield s.slice(i, Math.min(i + length, s.length));
    }
  }

  private getSelectedSets(
    dduSetSymbol: string,
    usePowerOfTwo?: boolean
  ): {
    dduSet: string[];
    padChar: string;
    dduLength: number;
    bitLength: number;
    lookupTable: Map<string, number>;
    paddingRegExp: RegExp;
  } {
    const isKR = dduSetSymbol === "KR";
    const dduSet = isKR ? this.dduCharDefault : this.dduChar;
    const padChar = isKR ? this.paddingCharDefault : this.paddingChar;
    let dduLength = dduSet.length;

    if (usePowerOfTwo) {
      const powerOfTwoLength = this.getLargestPowerOfTwo(dduLength);
      dduLength = powerOfTwoLength;
    }

    return {
      dduSet: usePowerOfTwo ? dduSet.slice(0, dduLength) : dduSet,
      padChar,
      dduLength,
      bitLength: this.getBitLength(dduLength),
      lookupTable: isKR ? this.dduBinaryLookupKr : this.dduBinaryLookup,
      paddingRegExp: this.paddingRegex.get(isKR ? "KR" : "default")!,
    };
  }

  private bufferToDduBinary(
    input: Buffer,
    bitLength: number
  ): { dduBinary: string[]; padding: number } {
    const encodedBin = input.reduce(
      (acc, byte) => acc + this.binaryLookup[byte],
      ""
    );
    if (encodedBin.length === 0) {
      return { dduBinary: [], padding: 0 };
    }
    const dduBinary = Array.from(this.splitString(encodedBin, bitLength));
    const padding = bitLength - dduBinary[dduBinary.length - 1].length;

    if (padding > 0) {
      dduBinary[dduBinary.length - 1] += "0".repeat(padding);
    }

    return { dduBinary, padding };
  }

  private dduBinaryToBuffer(decodedBin: string, paddingBits: number): Buffer {
    if (paddingBits > 0) {
      decodedBin = decodedBin.slice(0, -paddingBits);
    }
    const buffer: number[] = [];
    for (let i = 0; i < decodedBin.length; i += 8) {
      buffer.push(parseInt(decodedBin.slice(i, i + 8), 2));
    }

    return Buffer.from(buffer);
  }

  encode(
    input: Buffer | string,
    options: {
      dduSetSymbol?: string;
      encoding?: BufferEncoding;
      usePowerOfTwo?: boolean;
    } = {}
  ): string {
    const {
      dduSetSymbol = "default",
      encoding = this.defaultEncoding,
      usePowerOfTwo = true,
    } = options;
    const bufferInput =
      typeof input === "string" ? Buffer.from(input, encoding) : input;

    const { dduSet, padChar, dduLength, bitLength } = this.getSelectedSets(
      dduSetSymbol,
      usePowerOfTwo
    );
    const { dduBinary, padding } = this.bufferToDduBinary(
      bufferInput,
      bitLength
    );

    let resultString = "";

    for (const binaryChunk of dduBinary) {
      const charInt = parseInt(binaryChunk, 2);
      if (usePowerOfTwo) {
        resultString += dduSet[charInt];
      } else {
        const quotient = Math.floor(charInt / dduLength);
        const remainder = charInt % dduLength;
        resultString += dduSet[quotient] + dduSet[remainder];
      }
    }

    // 패딩 비트 수를 padChar + 숫자로 명시 (모든 모드)
    if (padding > 0) {
      resultString += padChar + padding;
    }
    
    return resultString;
  }

  decode(
    input: string,
    options: {
      dduSetSymbol?: string;
      encoding?: BufferEncoding;
      usePowerOfTwo?: boolean;
    } = {}
  ): string {
    const {
      dduSetSymbol = "default",
      encoding = this.defaultEncoding,
      usePowerOfTwo = true,
    } = options;
    const { dduSet, dduLength, bitLength, lookupTable, padChar, paddingRegExp } =
      this.getSelectedSets(dduSetSymbol, usePowerOfTwo);

    // 패딩 정보 추출: padChar 이후의 숫자가 패딩 비트 수 (모든 모드)
    let paddingBits = 0;
    const padCharIndex = input.indexOf(padChar);
    if (padCharIndex >= 0) {
      const paddingStr = input.substring(padCharIndex + padChar.length);
      paddingBits = parseInt(paddingStr) || 0;
      input = input.substring(0, padCharIndex);
    }

    let dduBinary = "";

    for (let i = 0; i < input.length; i += usePowerOfTwo ? 1 : 2) {
      const firstChar = input[i];
      const secondChar = input[i + 1];
      if (usePowerOfTwo) {
        const charIndex = lookupTable.get(firstChar);
        if (charIndex === undefined)
          throw new Error(`Invalid character: ${firstChar}`);
        dduBinary += charIndex.toString(2).padStart(bitLength, "0");
      } else {
        const firstIndex = lookupTable.get(firstChar);
        const secondIndex = lookupTable.get(secondChar);
        if (firstIndex === undefined || secondIndex === undefined)
          throw new Error(`Invalid character: ${firstChar} or ${secondChar}`);

        const value = firstIndex * dduLength + secondIndex;
        dduBinary += value.toString(2).padStart(bitLength, "0");
      }
    }

    const decoded = this.dduBinaryToBuffer(
      dduBinary,
      paddingBits
    );

    return decoded.toString(encoding);
  }
}