import { BaseDdu } from "./BaseDdu";
import { EncodeOptions, DecodeOptions, DduSetSymbol } from "../types";

export abstract class FixedLengthDdu extends BaseDdu {
  protected readonly dduChar: string[];
  protected readonly paddingChar: string;
  protected readonly charLength: number;
  protected readonly bitLength: number;
  protected readonly dduCharDefault: string[];
  protected readonly paddingCharDefault: string;
  
  protected readonly dduBinaryLookup: Map<string, number> = new Map();
  protected readonly dduBinaryLookupDefault: Map<string, number> = new Map();
  protected readonly paddingRegex: Map<string, RegExp> = new Map();

  constructor(
    dduCharDefault: string[],
    paddingCharDefault: string,
    requiredLength: number,
    bitLength: number,
    dduChar?: string[],
    paddingChar?: string
  ) {
    super();
    
    this.dduCharDefault = dduCharDefault;
    this.paddingCharDefault = paddingCharDefault;
    
    const sourceChar = dduChar || dduCharDefault;
    const sourcePadding = paddingChar || paddingCharDefault;

    // 유효성 검사: 최소 requiredLength개 이상의 문자 필요
    if (sourceChar.length < requiredLength) {
      throw new Error(
        `${this.constructor.name} requires at least ${requiredLength} characters in the character set. Provided: ${sourceChar.length}`
      );
    }

    // 첫 번째 문자의 길이를 기준으로 설정
    this.charLength = sourceChar[0].length;

    // 모든 문자의 길이가 동일한지 검사
    for (let i = 0; i < sourceChar.length; i++) {
      if (sourceChar[i].length !== this.charLength) {
        throw new Error(
          `All characters must have the same length. Expected: ${this.charLength}, but character at index ${i} ("${sourceChar[i]}") has length ${sourceChar[i].length}`
        );
      }
      if (sourcePadding.length !== this.charLength) {
        throw new Error(
          `Padding character must have the same length as the characters. Expected: ${this.charLength}, but padding character has length ${sourcePadding.length}`
        );
      }
    }

    // 중복 검사
    const uniqueChars = new Set(sourceChar);
    if (uniqueChars.size !== sourceChar.length) {
      throw new Error(
        `Character set contains duplicate characters. Unique: ${uniqueChars.size}, Total: ${sourceChar.length}`
      );
    }

    // 패딩 문자가 문자셋에 포함되어 있는지 검사
    if (uniqueChars.has(sourcePadding)) {
      throw new Error(
        `Padding character "${sourcePadding}" cannot be in the character set`
      );
    }

    // 앞에서부터 정확히 requiredLength개만 사용
    this.dduChar = sourceChar.slice(0, requiredLength);
    this.paddingChar = sourcePadding;
    this.bitLength = bitLength;

    // 룩업 테이블 생성
    this.dduChar.forEach((char, index) =>
      this.dduBinaryLookup.set(char, index)
    );
    dduCharDefault.forEach((char, index) =>
      this.dduBinaryLookupDefault.set(char, index)
    );

    this.paddingRegex.set(DduSetSymbol.USED, new RegExp(this.escapeRegExp(this.paddingChar), "g"));
    this.paddingRegex.set(DduSetSymbol.DEFAULT, new RegExp(this.escapeRegExp(paddingCharDefault), "g"));
  }

  protected getSelectedSets(dduSetSymbol: string): {
    dduSet: string[];
    padChar: string;
    lookupTable: Map<string, number>;
    paddingRegExp: RegExp;
  } {
    const isDefault = dduSetSymbol === DduSetSymbol.DEFAULT;
    const dduSet = isDefault ? this.dduCharDefault : this.dduChar;
    const padChar = isDefault ? this.paddingCharDefault : this.paddingChar;

    return {
      dduSet,
      padChar,
      lookupTable: isDefault ? this.dduBinaryLookupDefault : this.dduBinaryLookup,
      paddingRegExp: this.paddingRegex.get(isDefault ? DduSetSymbol.DEFAULT : DduSetSymbol.USED)!,
    };
  }

  encode(
    input: Buffer | string,
    options: EncodeOptions = {}
  ): string {
    const {
      dduSetSymbol = DduSetSymbol.USED,
      encoding = this.defaultEncoding,
    } = options;
    const bufferInput =
      typeof input === "string" ? Buffer.from(input, encoding) : input;

    const { dduSet, padChar } = this.getSelectedSets(dduSetSymbol);
    const { dduBinary, padding } = this.bufferToDduBinary(bufferInput, this.bitLength);

    let resultString = "";

    // 각 비트 청크를 charLength 글자 문자열로 변환
    for (const binaryChunk of dduBinary) {
      const charInt = parseInt(binaryChunk, 2);
      resultString += dduSet[charInt];
    }

    // 패딩 비트 정보를 padChar + 패딩비트수 형태로 추가
    if (padding > 0) {
      resultString += padChar + padding;
    }
    
    return resultString;
  }

  decode(
    input: string,
    options: DecodeOptions = {}
  ): string {
    const {
      dduSetSymbol = DduSetSymbol.USED,
      encoding = this.defaultEncoding,
    } = options;
    const { lookupTable, padChar } = this.getSelectedSets(dduSetSymbol);

    // 패딩 정보 추출
    let paddingBits = 0;
    const padCharIndex = input.indexOf(padChar);
    if (padCharIndex >= 0) {
      // padChar 이후의 숫자가 패딩 비트 수
      const paddingStr = input.substring(padCharIndex + padChar.length);
      paddingBits = parseInt(paddingStr) || 0;
      // 패딩 정보 제거
      input = input.substring(0, padCharIndex);
    }

    let dduBinary = "";

    // charLength 길이만큼 읽어서 디코딩
    for (let i = 0; i < input.length; i += this.charLength) {
      const charChunk = input.slice(i, i + this.charLength);
      const charIndex = lookupTable.get(charChunk);
      if (charIndex === undefined)
        throw new Error(`Invalid character: ${charChunk}`);
      dduBinary += charIndex.toString(2).padStart(this.bitLength, "0");
    }

    const decoded = this.dduBinaryToBuffer(dduBinary, paddingBits);

    return decoded.toString(encoding);
  }
}

