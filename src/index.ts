export class Ddu64 {
  private dduChar: string[];
  private paddingChar: string;
  private dduCharKr: string[] = ["뜌", "땨", "이", "우", "야", "!", "?", "."];
  private paddingCharKr: string = "뭐";
  private defaultEncoding: BufferEncoding = "utf-8";

  constructor(dduChar?: string[], paddingChar?: string) {
    const stringEncoding = "utf-8";
    if (!dduChar) {
      dduChar = this.dduCharKr;
    }
    if (!paddingChar) {
      paddingChar = this.paddingCharKr;
    }
    this.dduChar = dduChar;
    this.paddingChar = paddingChar;
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
