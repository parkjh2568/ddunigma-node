import {
  DduOptions,
  BufferToDduBinaryResult,
} from "../types";

export abstract class BaseDdu {
  protected readonly defaultEncoding: BufferEncoding = "utf-8";
  
  protected readonly binaryLookup: string[] = Array.from(
    { length: 256 },
    (_, i) => i.toString(2).padStart(8, "0")
  );

  protected escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  protected *splitString(s: string, length: number): Generator<string> {
    for (let i = 0; i < s.length; i += length) {
      yield s.slice(i, Math.min(i + length, s.length));
    }
  }

  protected getLargestPowerOfTwo(n: number): number {
    return 2 ** Math.floor(Math.log2(n));
  }

  protected getLargestPowerOfTwoExponent(n: number): number {
    return Math.floor(Math.log2(n));
  }

  protected getBitLength(setLength: number): number {
    return Math.ceil(Math.log2(setLength));
  }

  protected bufferToDduBinary(
    input: Buffer,
    bitLength: number
  ): BufferToDduBinaryResult {
    // 성능 최적화: reduce 대신 for loop + join 사용
    if (input.length === 0) {
      return { dduBinary: [], padding: 0 };
    }
    
    const binaryParts: string[] = new Array(input.length);
    for (let i = 0; i < input.length; i++) {
      binaryParts[i] = this.binaryLookup[input[i]];
    }
    const encodedBin = binaryParts.join("");
    
    const dduBinary = Array.from(this.splitString(encodedBin, bitLength));
    const padding = bitLength - dduBinary[dduBinary.length - 1].length;

    if (padding > 0) {
      dduBinary[dduBinary.length - 1] += "0".repeat(padding);
    }

    return { dduBinary, padding };
  }

  protected dduBinaryToBuffer(decodedBin: string, paddingBits: number): Buffer {
    if (paddingBits > 0) {
      decodedBin = decodedBin.slice(0, -paddingBits);
    }
    const buffer: number[] = [];
    for (let i = 0; i < decodedBin.length; i += 8) {
      buffer.push(parseInt(decodedBin.slice(i, i + 8), 2));
    }

    return Buffer.from(buffer);
  }

  abstract encode(
    input: Buffer | string,
    options?: DduOptions
  ): string;

  abstract decodeToBuffer(
    input: string,
    options?: DduOptions
  ): Buffer;

  abstract decode(
    input: string,
    options?: DduOptions
  ): string;

  /**
   * 테스트 및 디버깅용 추상 메서드
   * 구현 클래스의 내부 상태 정보를 반환
   */
  abstract getCharSetInfo(): {
    charSet: string[];
    paddingChar: string;
    charLength: number;
    bitLength: number;
    usePowerOfTwo: boolean;
    encoding: BufferEncoding;
  };
}

