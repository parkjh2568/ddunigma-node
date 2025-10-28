import {
  EncodeOptions,
  DecodeOptions,
  BufferToDduBinaryResult,
} from "../types";

export abstract class BaseDdu {
  protected readonly defaultEncoding: BufferEncoding = "utf-8";
  
  /**
   * 이진수 변환 룩업 테이블 (0-255 -> 8비트 이진 문자열)
   */
  protected readonly binaryLookup: string[] = Array.from(
    { length: 256 },
    (_, i) => i.toString(2).padStart(8, "0")
  );

  /**
   * 정규표현식 특수문자 이스케이프
   */
  protected escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * 문자열을 지정된 길이로 분할하는 제너레이터
   */
  protected *splitString(s: string, length: number): Generator<string> {
    for (let i = 0; i < s.length; i += length) {
      yield s.slice(i, Math.min(i + length, s.length));
    }
  }

  /**
   * 2의 거듭제곱 길이 계산
   */
  protected getLargestPowerOfTwo(n: number): number {
    return 2 ** Math.floor(Math.log2(n));
  }

  /**
   * 비트 길이 계산
   */
  protected getBitLength(setLength: number): number {
    return Math.ceil(Math.log2(setLength));
  }

  /**
   * Buffer를 DDU Binary 배열로 변환
   */
  protected bufferToDduBinary(
    input: Buffer,
    bitLength: number
  ): BufferToDduBinaryResult {
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

  /**
   * DDU Binary를 Buffer로 변환
   */
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
    options?: EncodeOptions
  ): string;

  abstract decode(
    input: string,
    options?: DecodeOptions
  ): string;
}

