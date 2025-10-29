import { BaseDdu } from "../../base";
import { DduOptions, SelectedSets, DduSetSymbol, DduConstructorOptions, dduDefaultConstructorOptions } from "../../types";

export class Ddu64 extends BaseDdu {
  private readonly dduChar: string[];
  private readonly paddingChar: string;
  
  // DDU 문자셋 (한글 기반 - 원래 Ddu64 기본값)
  private readonly dduCharDdu: string[] = [
    "뜌",
    "땨",
    "이",
    "우",
    "야",
    "!",
    "?",
    ".",
  ];
  private readonly paddingCharDdu: string = "뭐";
  
  // DEFAULT 문자셋 (Custom64 기반 - Base64 스타일)
  private readonly dduCharDefault: string[] = [
    "A",
    "s",
    "q",
    "r",
    "0",
    "z",
    "3",
    "t",
    "y",
    "1",
    "5",
    "2",
    "4",
    "E",
    "B",
    "C",
    "Q",
    "F",
    "R",
    "T",
    "U",
    "W",
    "V",
    "X",
    "Y",
    "Z",
    "b",
    "a",
    "c",
    "d",
    "D",
    "G",
    "L",
    "H",
    "I",
    "-",
    "J",
    "K",
    "M",
    "O",
    "N",
    "f",
    "e",
    "h",
    "g",
    "P",
    "i",
    "S",
    "k",
    "l",
    "m",
    "u",
    "j",
    "v",
    "n",
    "o",
    "p",
    "9",
    "w",
    "6",
    "7",
    "8",
    "x",
    "_",
  ];
  private readonly paddingCharDefault: string = "=";

  private readonly bitLengthMap: Map<number, number> = new Map();
  private readonly dduBinaryLookup: Map<string, number> = new Map();
  private readonly dduBinaryLookupDefault: Map<string, number> = new Map();
  private readonly dduBinaryLookupDdu: Map<string, number> = new Map();
  private readonly paddingRegex: Map<string, RegExp> = new Map();

  constructor(dduChar?: string[] | string, paddingChar?: string, dduOptions?: DduConstructorOptions) {
    super();
    
    if (typeof dduChar === "string") {
      const removeDuplicatesString = [...new Set(dduChar.trim())].join("");
      this.dduChar = removeDuplicatesString.trim().split("");
    } else {
      this.dduChar = dduChar || this.dduCharDefault;
    }
    this.paddingChar = paddingChar || this.paddingCharDefault;

    // USED 문자셋 룩업 테이블
    this.dduChar.forEach((char, index) =>
      this.dduBinaryLookup.set(char, index)
    );
    
    // DEFAULT 문자셋 룩업 테이블 (Custom64 스타일)
    this.dduCharDefault.forEach((char, index) =>
      this.dduBinaryLookupDefault.set(char, index)
    );
    
    // DDU 문자셋 룩업 테이블 (한글 스타일)
    this.dduCharDdu.forEach((char, index) =>
      this.dduBinaryLookupDdu.set(char, index)
    );

    this.paddingRegex.set(DduSetSymbol.USED, new RegExp(this.paddingChar, "g"));
    this.paddingRegex.set(DduSetSymbol.DEFAULT, new RegExp(this.paddingCharDefault, "g"));
    this.paddingRegex.set(DduSetSymbol.DDU, new RegExp(this.paddingCharDdu, "g"));
  }

  private getBitLengthCached(setLength: number): number {
    let cached = this.bitLengthMap.get(setLength);
    if (cached === undefined) {
      cached = this.getBitLength(setLength);
      this.bitLengthMap.set(setLength, cached);
    }
    return cached;
  }

  private getSelectedSets(
    dduSetSymbol: string,
    usePowerOfTwo?: boolean
  ): SelectedSets {
    let dduSet: string[];
    let padChar: string;
    let lookupTable: Map<string, number>;
    
    // 문자셋 선택
    if (dduSetSymbol === DduSetSymbol.DEFAULT) {
      // Custom64 스타일 (Base64 호환)
      dduSet = this.dduCharDefault;
      padChar = this.paddingCharDefault;
      lookupTable = this.dduBinaryLookupDefault;
    } else if (dduSetSymbol === DduSetSymbol.DDU) {
      // 한글 스타일 (원래 Ddu64)
      dduSet = this.dduCharDdu;
      padChar = this.paddingCharDdu;
      lookupTable = this.dduBinaryLookupDdu;
    } else {
      // USED (사용자 정의)
      dduSet = this.dduChar;
      padChar = this.paddingChar;
      lookupTable = this.dduBinaryLookup;
    }
    
    let dduLength = dduSet.length;

    if (usePowerOfTwo) {
      const powerOfTwoLength = this.getLargestPowerOfTwo(dduLength);
      dduLength = powerOfTwoLength;
    }

    return {
      dduSet: usePowerOfTwo ? dduSet.slice(0, dduLength) : dduSet,
      padChar,
      dduLength,
      bitLength: this.getBitLengthCached(dduLength),
      lookupTable,
      paddingRegExp: this.paddingRegex.get(dduSetSymbol)!,
    };
  }

  encode(
    input: Buffer | string,
    options: DduOptions = {}
  ): string {
    const {
      dduSetSymbol = DduSetSymbol.USED,
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
    options: DduOptions = {}
  ): string {
    const {
      dduSetSymbol = DduSetSymbol.USED,
      encoding = this.defaultEncoding,
      usePowerOfTwo = true,
    } = options;
    const { dduSet, dduLength, bitLength, lookupTable, padChar } =
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

