export class Ddu64 {
  private readonly dduChar: string[];
  private readonly paddingChar: string;
  private readonly dduCharKr: string[] = [
    "뜌",
    "땨",
    "이",
    "우",
    "야",
    "!",
    "?",
    ".",
  ];
  private readonly paddingCharKr: string = "뭐";
  private readonly defaultEncoding: BufferEncoding = "utf-8";

  private readonly bitLengthMap: Map<number, number> = new Map();
  private readonly binaryLookup: string[] = Array.from(
    { length: 256 },
    (_, i) => i.toString(2).padStart(8, "0")
  );
  private readonly dduBinaryLookup: Map<string, number> = new Map();
  private readonly dduBinaryLookupKr: Map<string, number> = new Map();
  private readonly paddingRegex: Map<string, RegExp> = new Map();

  constructor(dduChar?: string[], paddingChar?: string) {
    this.dduChar = dduChar || this.dduCharKr;
    this.paddingChar = paddingChar || this.paddingCharKr;

    this.dduChar.forEach((char, index) =>
      this.dduBinaryLookup.set(char, index)
    );
    this.dduCharKr.forEach((char, index) =>
      this.dduBinaryLookupKr.set(char, index)
    );

    this.paddingRegex.set("default", new RegExp(this.paddingChar, "g"));
    this.paddingRegex.set("KR", new RegExp(this.paddingCharKr, "g"));
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
    const dduSet = isKR ? this.dduCharKr : this.dduChar;
    const padChar = isKR ? this.paddingCharKr : this.paddingChar;
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
      usePowerOfTwo = false,
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

    return padding > 0
      ? resultString + padChar.repeat(Math.floor(padding / 2))
      : resultString;
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
      usePowerOfTwo = false,
    } = options;
    const { dduSet, dduLength, bitLength, lookupTable, paddingRegExp } =
      this.getSelectedSets(dduSetSymbol, usePowerOfTwo);

    const paddingCount = (input.match(paddingRegExp) || []).length;
    const paddingBits = paddingCount * 2;
    input = input.replace(paddingRegExp, "");

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
      usePowerOfTwo ? paddingBits : paddingCount * bitLength
    );

    return decoded.toString(encoding);
  }
}

export class Custom64 {
  private readonly dduChar: string[];
  private readonly paddingChar: string;
  private readonly dduCharKr: string[] = [
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V",
    "W",
    "X",
    "Y",
    "Z",
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "+",
    "/",
  ];
  private readonly paddingCharKr: string = "=";
  private readonly defaultEncoding: BufferEncoding = "utf-8";

  private readonly bitLengthMap: Map<number, number> = new Map();
  private readonly binaryLookup: string[] = Array.from(
    { length: 256 },
    (_, i) => i.toString(2).padStart(8, "0")
  );
  private readonly dduBinaryLookup: Map<string, number> = new Map();
  private readonly dduBinaryLookupKr: Map<string, number> = new Map();
  private readonly paddingRegex: Map<string, RegExp> = new Map();

  constructor(dduChar?: string[], paddingChar?: string) {
    this.dduChar = dduChar || this.dduCharKr;
    this.paddingChar = paddingChar || this.paddingCharKr;

    this.dduChar.forEach((char, index) =>
      this.dduBinaryLookup.set(char, index)
    );
    this.dduCharKr.forEach((char, index) =>
      this.dduBinaryLookupKr.set(char, index)
    );

    this.paddingRegex.set("default", new RegExp(this.paddingChar, "g"));
    this.paddingRegex.set("KR", new RegExp(this.paddingCharKr, "g"));
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
    const dduSet = isKR ? this.dduCharKr : this.dduChar;
    const padChar = isKR ? this.paddingCharKr : this.paddingChar;
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
      usePowerOfTwo = false,
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

    return padding > 0
      ? resultString + padChar.repeat(Math.floor(padding / 2))
      : resultString;
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
      usePowerOfTwo = false,
    } = options;
    const { dduSet, dduLength, bitLength, lookupTable, paddingRegExp } =
      this.getSelectedSets(dduSetSymbol, usePowerOfTwo);

    const paddingCount = (input.match(paddingRegExp) || []).length;
    const paddingBits = paddingCount * 2;
    input = input.replace(paddingRegExp, "");

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
      usePowerOfTwo ? paddingBits : paddingCount * bitLength
    );

    return decoded.toString(encoding);
  }
}
