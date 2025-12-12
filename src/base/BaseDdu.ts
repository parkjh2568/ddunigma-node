import { DduOptions } from "../types";

export abstract class BaseDdu {
  protected readonly defaultEncoding: BufferEncoding = "utf-8";

  protected getLargestPowerOfTwoExponent(n: number): number {
    return Math.floor(Math.log2(n));
  }

  protected getBitLength(setLength: number): number {
    return Math.ceil(Math.log2(setLength));
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

  abstract getCharSetInfo(): {
    charSet: string[];
    paddingChar: string;
    charLength: number;
    bitLength: number;
    usePowerOfTwo: boolean;
    encoding: BufferEncoding;
  };
}

