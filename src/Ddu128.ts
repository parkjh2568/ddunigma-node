export class Ddu128 {
  private readonly dduChar: string[];
  private readonly paddingChar: string;
  private readonly charLength: number;
  // 128개의 2글자 URL-safe 문자열 (A-Z, a-z, 0-9, -, _ 사용)
  private readonly dduCharDefault: string[] = [
    "m7", "Bq", "A3", "x9", "pL", "Bf", "Q2", "T8",
    "c5", "Ag", "Wk", "r1", "H6", "dN", "z0", "BY",
    "j4", "AM", "vX", "L9", "oP", "Eu", "S3", "i7",
    "Kb", "nG", "U1", "aq", "Fy", "M5", "hR", "w2",
    "D8", "Vt", "bO", "k6", "Zj", "eA", "I0", "Nc",
    "P9", "gW", "Rl", "s4", "Cx", "uH", "Y7", "fM",
    "a1", "Qv", "Jd", "t5", "Bp", "KE", "lZ", "O3",
    "Wi", "yU", "G8", "XN", "mT", "Ah", "qF", "R2",
    "Vc", "n6", "Er", "Lb", "TJ", "iS", "o9", "Dw",
    "zA", "Pk", "Hu", "C4", "bx", "Ym", "fQ", "gB",
    "U7", "s0", "Ie", "Mv", "Wj", "ap", "dK", "Nl",
    "rY", "hC", "F5", "Bt", "k3", "Zi", "Oa", "vG",
    "Lq", "jR", "Am", "Sx", "e8", "Pu", "D1", "yn",
    "Jw", "cE", "Tf", "bH", "u6", "NO", "Ik", "gV",
    "Ba", "z9", "WX", "lM", "q2", "Hs", "Ry", "mZ",
    "Fc", "oU", "A7", "Kd", "Yn", "vL", "Ep", "Gh",
  ];
  private readonly paddingCharDefault: string = "A-";
  private readonly defaultEncoding: BufferEncoding = "utf-8";

  private readonly binaryLookup: string[] = Array.from(
    { length: 256 },
    (_, i) => i.toString(2).padStart(8, "0")
  );
  private readonly dduBinaryLookup: Map<string, number> = new Map();
  private readonly dduBinaryLookupKr: Map<string, number> = new Map();
  private readonly paddingRegex: Map<string, RegExp> = new Map();

  constructor(dduChar?: string[], paddingChar?: string) {
    // 기본값 설정
    const sourceChar = dduChar || this.dduCharDefault;
    const sourcePadding = paddingChar || this.paddingCharDefault;

    // 유효성 검사: 최소 128개 이상의 문자 필요
    if (sourceChar.length < 128) {
      throw new Error(`Ddu128 requires at least 128 characters in the character set. Provided: ${sourceChar.length}`);
    }

    // 첫 번째 문자의 길이를 기준으로 설정
    this.charLength = sourceChar[0].length;

    // 모든 문자의 길이가 동일한지 검사
    for (let i = 0; i < sourceChar.length; i++) {
      if (sourceChar[i].length !== this.charLength) {
        throw new Error(`All characters must have the same length. Expected: ${this.charLength}, but character at index ${i} ("${sourceChar[i]}") has length ${sourceChar[i].length}`);
      }
    }

    // 패딩 문자 길이 검사
    if (sourcePadding.length !== this.charLength) {
      throw new Error(`Padding character length (${sourcePadding.length}) must match character set length (${this.charLength})`);
    }

    // 중복 검사
    const uniqueChars = new Set(sourceChar);
    if (uniqueChars.size !== sourceChar.length) {
      throw new Error(`Character set contains duplicate characters. Unique: ${uniqueChars.size}, Total: ${sourceChar.length}`);
    }

    // 패딩 문자가 문자셋에 포함되어 있는지 검사
    if (uniqueChars.has(sourcePadding)) {
      throw new Error(`Padding character "${sourcePadding}" cannot be in the character set`);
    }

    // 앞에서부터 정확히 128개만 사용
    this.dduChar = sourceChar.slice(0, 128);
    this.paddingChar = sourcePadding;

    // 룩업 테이블 생성
    this.dduChar.forEach((char, index) =>
      this.dduBinaryLookup.set(char, index)
    );
    this.dduCharDefault.forEach((char, index) =>
      this.dduBinaryLookupKr.set(char, index)
    );

    this.paddingRegex.set("default", new RegExp(this.escapeRegExp(this.paddingChar), "g"));
    this.paddingRegex.set("KR", new RegExp(this.escapeRegExp(this.paddingCharDefault), "g"));
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private *splitString(s: string, length: number): Generator<string> {
    for (let i = 0; i < s.length; i += length) {
      yield s.slice(i, Math.min(i + length, s.length));
    }
  }

  private getSelectedSets(
    dduSetSymbol: string
  ): {
    dduSet: string[];
    padChar: string;
    lookupTable: Map<string, number>;
    paddingRegExp: RegExp;
  } {
    const isKR = dduSetSymbol === "KR";
    const dduSet = isKR ? this.dduCharDefault : this.dduChar;
    const padChar = isKR ? this.paddingCharDefault : this.paddingChar;

    return {
      dduSet,
      padChar,
      lookupTable: isKR ? this.dduBinaryLookupKr : this.dduBinaryLookup,
      paddingRegExp: this.paddingRegex.get(isKR ? "KR" : "default")!,
    };
  }

  private bufferToDduBinary(
    input: Buffer
  ): { dduBinary: string[]; padding: number } {
    const encodedBin = input.reduce(
      (acc, byte) => acc + this.binaryLookup[byte],
      ""
    );
    if (encodedBin.length === 0) {
      return { dduBinary: [], padding: 0 };
    }
    const bitLength = 7; // 128 = 2^7
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
    } = {}
  ): string {
    const {
      dduSetSymbol = "default",
      encoding = this.defaultEncoding,
    } = options;
    const bufferInput =
      typeof input === "string" ? Buffer.from(input, encoding) : input;

    const { dduSet, padChar } = this.getSelectedSets(dduSetSymbol);
    const { dduBinary, padding } = this.bufferToDduBinary(bufferInput);

    let resultString = "";

    // 각 7비트 청크를 3글자 문자열로 변환
    for (const binaryChunk of dduBinary) {
      const charInt = parseInt(binaryChunk, 2);
      resultString += dduSet[charInt];
    }

    // 패딩 비트 정보를 padChar + 패딩비트수(0-6) 형태로 추가
    // padding이 0이 아니면 padChar를 추가
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
    } = {}
  ): string {
    const {
      dduSetSymbol = "default",
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
      dduBinary += charIndex.toString(2).padStart(7, "0");
    }

    const decoded = this.dduBinaryToBuffer(dduBinary, paddingBits);

    return decoded.toString(encoding);
  }
}

