import { BaseDdu } from "../base/BaseDdu";
import {
  DduConstructorOptions,
  DduOptions,
  DduSetSymbol,
  dduDefaultConstructorOptions,
} from "../types";
import { getCharSet } from "../charSets";

export class Ddu64 extends BaseDdu {
  protected readonly dduChar: string[];
  protected readonly paddingChar: string;
  protected readonly charLength: number;
  protected readonly bitLength: number;
  protected readonly usePowerOfTwo: boolean;
  protected readonly encoding: BufferEncoding;

  protected readonly dduBinaryLookup: Map<string, number> = new Map();
  private readonly isPredefinedCharSet: boolean;
  private readonly effectiveBitLength: number;
  private readonly maxBinaryValue: number;
  private readonly binaryChunkToIntFn: (chunk: string) => number;
  private readonly indexToBinaryCache: string[] | null;

  constructor(dduChar?: string[] | string, paddingChar?: string, dduOptions?: DduConstructorOptions) {
    super();

    const shouldThrowError = dduOptions?.useBuildErrorReturn ?? false;
    const {
      charSet,
      padding,
      requiredLength,
      bitLength,
      isPredefined,
    } = this.resolveInitialCharSet(
      dduChar,
      paddingChar,
      dduOptions,
      shouldThrowError
    );

    // 정규화 및 검증
    const normalized = this.normalizeCharSet(
      charSet,
      padding,
      requiredLength,
      bitLength,
      isPredefined,
      shouldThrowError,
      dduOptions
    );
    
    this.dduChar = normalized.charSet;
    this.paddingChar = normalized.padding;
    this.charLength = normalized.charLength;
    this.isPredefinedCharSet = normalized.isPredefined;
    this.encoding = dduOptions?.encoding ?? this.defaultEncoding;

    const dduLength = this.dduChar.length;
    const recalculatedBitLength = this.getBitLength(dduLength);
    this.usePowerOfTwo = dduLength > 0 && (dduLength & (dduLength - 1)) === 0;
    this.bitLength = this.usePowerOfTwo
      ? this.getLargestPowerOfTwoExponent(dduLength)
      : recalculatedBitLength;
    this.effectiveBitLength = this.usePowerOfTwo ? this.bitLength : recalculatedBitLength;
    this.maxBinaryValue = 2 ** this.effectiveBitLength;
    
    // 성능 최적화: 단일 구현 사용 (벤치마크 결과 Method2가 더 빠르고 안정적)
    // Method2는 32비트 이상에서도 오버플로우 없이 정확한 결과 제공
    this.binaryChunkToIntFn = (chunk) => {
      let value = 0;
      for (let i = 0; i < chunk.length; i++) {
        value = value * 2 + (chunk.charCodeAt(i) & 1);
      }
      return value;
    };

    this.dduChar.forEach((char, index) => this.dduBinaryLookup.set(char, index));

    if (this.charLength === 1 && !this.isPredefinedCharSet) {
      this.validateCombinationDuplicates(this.dduChar, this.paddingChar, dduLength);
    }

    if (this.effectiveBitLength <= 16) {
      this.indexToBinaryCache = Array.from({ length: this.maxBinaryValue }, (_, i) =>
        i.toString(2).padStart(this.effectiveBitLength, "0")
      );
    } else {
      this.indexToBinaryCache = null;
    }
  }

  private normalizeCharSet(
    charSet: string[],
    padding: string,
    requiredLength: number,
    bitLength: number,
    isPredefined: boolean,
    shouldThrowError: boolean,
    dduOptions?: DduConstructorOptions
  ): {
    charSet: string[];
    padding: string;
    requiredLength: number;
    bitLength: number;
    isPredefined: boolean;
    charLength: number;
  } {
    const applyFallback = () =>
      this.getFallbackCharSet(dduOptions);

    while (true) {
      const ensure = (condition: boolean, message: string): boolean => {
        if (!condition) return false;
        if (shouldThrowError) throw new Error(message);
        ({
          charSet,
          padding,
          requiredLength,
          bitLength,
          isPredefined,
        } = applyFallback());
        return true;
      };

      const uniqueChars = new Set(charSet);
      if (uniqueChars.size !== charSet.length) {
        const duplicates = charSet.filter(
          (char, index) => charSet.indexOf(char) !== index
        );
        const errorMsg = `[Ddu64 normalizeCharSet] Character set contains duplicate characters. Total: ${charSet.length}, Unique: ${uniqueChars.size}, Duplicates: [${[
          ...new Set(duplicates),
        ].join(", ")}]`;

        if (shouldThrowError) throw new Error(errorMsg);

        charSet = Array.from(uniqueChars);
        if (!isPredefined) {
          requiredLength = charSet.length;
        }
      }

      if (
        ensure(
          charSet.length < requiredLength,
          `[Ddu64 normalizeCharSet] Insufficient characters. Required: ${requiredLength}, Provided: ${charSet.length}`
        )
      ) {
        continue;
      }

      if (
        ensure(
          requiredLength < 2,
          `[Ddu64 normalizeCharSet] At least 2 unique characters are required. Provided: ${requiredLength}`
        )
      ) {
        continue;
      }

      if (
        ensure(
          bitLength <= 0,
          `[Ddu64 normalizeCharSet] Invalid bit length (${bitLength}) for charset size ${requiredLength}`
        )
      ) {
        continue;
      }

      if (
        ensure(
          !charSet.length,
          `[Ddu64 normalizeCharSet] Empty charset. Required: ${requiredLength} characters`
        )
      ) {
        continue;
      }

      let charLength = charSet[0].length;

      const invalidIndex = charSet.findIndex(
        (char) => char.length !== charLength
      );
      if (invalidIndex !== -1) {
        if (shouldThrowError) {
          throw new Error(
            `[Ddu64 normalizeCharSet] Inconsistent character length. Expected: ${charLength}, but character at index ${invalidIndex} ("${charSet[invalidIndex]}") has length ${charSet[invalidIndex].length}`
          );
        }
        charSet = charSet.filter((char) => char.length === charLength);
        if (
          ensure(
            charSet.length < requiredLength,
            `[Ddu64 normalizeCharSet] Insufficient characters after filtering. Required: ${requiredLength}, Remaining: ${charSet.length}`
          )
        ) {
          continue;
        }
        if (
          ensure(
            !charSet.length,
            `[Ddu64 normalizeCharSet] Empty charset after filtering`
          )
        ) {
          continue;
        }
        charLength = charSet[0].length;
      }

      if (
        ensure(
          padding.length !== charLength,
          `[Ddu64 normalizeCharSet] Padding character length mismatch. Expected: ${charLength}, Got: ${padding.length} (padding: "${padding}")`
        )
      ) {
        continue;
      }

      if (charSet.includes(padding)) {
        if (shouldThrowError) {
          throw new Error(
            `[Ddu64 normalizeCharSet] Padding character "${padding}" conflicts with charset. Padding must not be in the character set.`
          );
        }
        charSet = charSet.filter((char) => char !== padding);
        if (
          ensure(
            charSet.length < requiredLength,
            `[Ddu64 normalizeCharSet] Insufficient characters after removing padding conflict. Required: ${requiredLength}, Remaining: ${charSet.length}`
          )
        ) {
          continue;
        }
        if (
          ensure(
            !charSet.length,
            `[Ddu64 normalizeCharSet] Empty charset after removing padding conflict`
          )
        ) {
          continue;
        }
        charLength = charSet[0].length;
      }

      return {
        charSet: charSet.slice(0, requiredLength),
        padding,
        requiredLength,
        bitLength,
        isPredefined,
        charLength,
      };
    }
  }

  private resolveInitialCharSet(
    dduChar: string[] | string | undefined,
    paddingChar: string | undefined,
    dduOptions: DduConstructorOptions | undefined,
    shouldThrowError: boolean
  ): {
    charSet: string[];
    padding: string;
    requiredLength: number;
    bitLength: number;
    isPredefined: boolean;
  } {
    const finalize = (
      set: string[],
      padding: string,
      length: number,
      baseBitLength?: number,
      predefined = false
    ) => {
      const usePow2 = this.shouldUsePowerOfTwo(length, dduOptions?.usePowerOfTwo);
      if (usePow2 && length > 0) {
        const exponent = this.getLargestPowerOfTwoExponent(length);
        const pow2Length = 1 << exponent;
        return {
          charSet: set.slice(0, pow2Length),
          padding,
          requiredLength: pow2Length,
          bitLength: exponent,
          isPredefined: predefined,
        };
      }

      const computedBitLength =
        baseBitLength ?? (length > 0 ? this.getBitLength(length) : 0);

      return {
        charSet: set.slice(0, length),
        padding,
        requiredLength: length,
        bitLength: computedBitLength,
        isPredefined: predefined,
      };
    };

    const fallback = () => this.getFallbackCharSet(dduOptions);

    try {
      const finalDduChar = dduChar ?? dduOptions?.dduChar;
      const finalPadding = paddingChar ?? dduOptions?.paddingChar;

      if (finalDduChar) {
        if (!finalPadding) {
          throw new Error(
            `[Ddu64 Constructor] paddingChar is required when dduChar is provided. Received: dduChar=${typeof finalDduChar}, paddingChar=${finalPadding}`
          );
        }

        const arr =
          typeof finalDduChar === "string"
            ? [...finalDduChar.trim()]
            : [...finalDduChar];

        if (shouldThrowError) {
          const uniqueChars = new Set(arr);
          if (uniqueChars.size !== arr.length) {
            const duplicates = arr.filter(
              (char, index) => arr.indexOf(char) !== index
            );
            throw new Error(
              `[Ddu64 Constructor] Character set contains duplicate characters. Total: ${arr.length}, Unique: ${uniqueChars.size}, Duplicates: [${[
                ...new Set(duplicates),
              ].join(", ")}]`
            );
          }
        }

        const len = dduOptions?.requiredLength ?? arr.length;
        if (arr.length < len) {
          throw new Error(
            `[Ddu64 Constructor] Insufficient characters in charset. Required: ${len}, Provided: ${arr.length}`
          );
        }

        return finalize(arr, finalPadding, len, undefined, false);
      }

      if (dduOptions?.dduSetSymbol) {
        const cs = this.getCharSetOrThrow(dduOptions.dduSetSymbol);
        return finalize(
          cs.charSet,
          cs.paddingChar,
          cs.maxRequiredLength,
          cs.bitLength,
          true
        );
      }

      const defaultSymbol =
        dduDefaultConstructorOptions.dduSetSymbol ?? DduSetSymbol.DDU;
      const cs = this.getCharSetOrThrow(defaultSymbol);
      return finalize(
        cs.charSet,
        cs.paddingChar,
        cs.maxRequiredLength,
        cs.bitLength,
        true
      );
    } catch (error) {
      if (shouldThrowError) throw error;
      return fallback();
    }
  }

  private getFallbackCharSet(dduOptions?: DduConstructorOptions): {
    charSet: string[];
    padding: string;
    requiredLength: number;
    bitLength: number;
    isPredefined: boolean;
  } {
    const fallbackSymbol =
      dduOptions?.dduSetSymbol ??
      dduDefaultConstructorOptions.dduSetSymbol ??
      DduSetSymbol.ONECHARSET;
    const cs =
      getCharSet(fallbackSymbol) ?? getCharSet(DduSetSymbol.ONECHARSET);
    if (!cs) throw new Error(`Critical: No fallback CharSet available`);
    return {
      charSet: cs.charSet,
      padding: cs.paddingChar,
      requiredLength: cs.maxRequiredLength,
      bitLength: cs.bitLength,
      isPredefined: true,
    };
  }

  private shouldUsePowerOfTwo(length: number, preference?: boolean): boolean {
    if (preference === true) {
      return length > 0;
    }
    if (preference === false) {
      return false;
    }
    return length > 0 && (length & (length - 1)) === 0;
  }

  private getCharSetOrThrow(symbol: DduSetSymbol) {
    const cs = getCharSet(symbol);
    if (!cs) throw new Error(`CharSet with symbol ${symbol} not found`);
    return cs;
  }

  private getBinaryFromIndex(index: number): string {
    if (index < 0 || index >= this.maxBinaryValue) {
      throw new Error(
        `[Ddu64] Binary index overflow. Received: ${index}, Allowed range: 0-${this.maxBinaryValue - 1}`
      );
    }
    return this.indexToBinaryCache?.[index] ?? index.toString(2).padStart(this.effectiveBitLength, "0");
  }

  private validateCombinationDuplicates(charSet: string[], paddingChar: string, requiredLength: number): void {
    const charLength = charSet[0].length;
    // 조합 충돌 검사는 단일 문자 집합이면서 비교적 작은 경우(<=256)에만 적용한다.
    if (charLength !== 1 || requiredLength > 256) {
      return;
    }

    const allStrings = new Set([...charSet.slice(0, requiredLength), paddingChar]);
    const limit = Math.min(charSet.length, requiredLength);

    for (let i = 0; i < limit; i++) {
      for (let j = 0; j < limit; j++) {
        const combo = charSet[i] + charSet[j];
        if (allStrings.has(combo)) {
          throw new Error(
            `Combination conflict: "${charSet[i]}" + "${charSet[j]}" = "${combo}" already exists`
          );
        }
      }

      const charPad = charSet[i] + paddingChar;
      const padChar = paddingChar + charSet[i];
      if (allStrings.has(charPad)) {
        throw new Error(`Combination conflict: "${charSet[i]}" + padding "${paddingChar}" = "${charPad}"`);
      }
      if (allStrings.has(padChar)) {
        throw new Error(`Combination conflict: padding "${paddingChar}" + "${charSet[i]}" = "${padChar}"`);
      }
    }

    const doublePad = paddingChar + paddingChar;
    if (allStrings.has(doublePad)) {
      throw new Error(`Combination conflict: double padding "${doublePad}" already exists`);
    }
  }

  encode(input: Buffer | string, _options?: DduOptions): string {
    // options는 구버전 호환성을 위해 유지하지만 사용하지 않음
    const bufferInput =
      typeof input === "string" ? Buffer.from(input, this.encoding) : input;

    const { dduBinary, padding } = this.bufferToDduBinary(
      bufferInput,
      this.effectiveBitLength
    );

    const resultParts: string[] = new Array(dduBinary.length);

    if (this.usePowerOfTwo) {
      for (let i = 0; i < dduBinary.length; i++) {
        const charInt = this.binaryChunkToIntFn(dduBinary[i]);
        resultParts[i] = this.dduChar[charInt];
      }
    } else {
      const dduLength = this.dduChar.length;
      for (let i = 0; i < dduBinary.length; i++) {
        const value = this.binaryChunkToIntFn(dduBinary[i]);
        const quotient = Math.floor(value / dduLength);
        const remainder = value % dduLength;
        resultParts[i] = this.dduChar[quotient] + this.dduChar[remainder];
      }
    }

    let resultString = resultParts.join("");

    // 패딩 비트 정보를 padChar + 패딩비트수 형태로 추가
    if (padding > 0) {
      resultString += this.paddingChar + padding;
    }

    return resultString;
  }

  decodeToBuffer(input: string, _options?: DduOptions): Buffer {
    let paddingBits = 0;

    if (input.length >= this.paddingChar.length) {
      const padCharIndex = input.lastIndexOf(this.paddingChar);

      if (
        padCharIndex >= 0 &&
        padCharIndex % this.charLength === 0 &&
        padCharIndex + this.paddingChar.length <= input.length
      ) {
        const paddingSection = input.slice(
          padCharIndex + this.paddingChar.length
        );

        if (paddingSection.length === 0) {
          throw new Error(
            `[Ddu64 decode] Invalid padding format. Missing padding length after "${this.paddingChar}"`
          );
        }

        paddingBits = parseInt(paddingSection, 10);

        if (
          isNaN(paddingBits) ||
          paddingSection !== paddingBits.toString() ||
          paddingBits < 0 ||
          paddingBits >= this.effectiveBitLength
        ) {
          throw new Error(
            `[Ddu64 decode] Invalid padding format. Expected integer between 0 and ${this.effectiveBitLength - 1}, Got: "${paddingSection}"`
          );
        }

        input = input.substring(0, padCharIndex);
      }
    }

    const binaryParts: string[] = [];
    const charLength = this.charLength;
    const dduLength = this.dduChar.length;

    if (!this.usePowerOfTwo) {
      const chunkSize = charLength * 2;
      for (let i = 0; i < input.length; i += chunkSize) {
        const firstChar = input.slice(i, i + charLength);
        const secondChar = input.slice(i + charLength, i + chunkSize);

        const firstIndex = this.dduBinaryLookup.get(firstChar);
        const secondIndex = this.dduBinaryLookup.get(secondChar);
        if (firstIndex === undefined || secondIndex === undefined) {
          const invalidChar = firstIndex === undefined ? firstChar : secondChar;
          throw new Error(
            `[Ddu64 decode] Invalid character in encoded string. Character: "${invalidChar}", Position: ${i}, Expected charset size: ${dduLength}`
          );
        }

        const value = firstIndex * dduLength + secondIndex;
        if (value >= this.maxBinaryValue) {
          throw new Error(
            `[Ddu64 decode] Invalid character combination detected. Calculated value ${value} exceeds binary range ${this.maxBinaryValue - 1}.`
          );
        }
        binaryParts.push(this.getBinaryFromIndex(value));
      }
    } else {
      for (let i = 0; i < input.length; i += charLength) {
        const charChunk = input.slice(i, i + charLength);
        const charIndex = this.dduBinaryLookup.get(charChunk);
        if (charIndex === undefined) {
          throw new Error(
            `[Ddu64 decode] Invalid character in encoded string. Character: "${charChunk}", Position: ${i}, Charset size: ${dduLength}, Character length: ${charLength}`
          );
        }
        if (charIndex >= this.maxBinaryValue) {
          throw new Error(
            `[Ddu64 decode] Invalid binary index ${charIndex}. Allowed range: 0-${this.maxBinaryValue - 1}`
          );
        }
        binaryParts.push(this.getBinaryFromIndex(charIndex));
      }
    }

    return this.dduBinaryToBuffer(binaryParts.join(""), paddingBits);
  }

  decode(input: string, _options?: DduOptions): string {
    return this.decodeToBuffer(input, _options).toString(this.encoding);
  }

  /**
   * 테스트 및 디버깅용 getter 메서드
   * 인코더의 내부 상태 정보를 반환
   */
  getCharSetInfo() {
    return {
      charSet: [...this.dduChar],
      paddingChar: this.paddingChar,
      charLength: this.charLength,
      bitLength: this.bitLength,
      usePowerOfTwo: this.usePowerOfTwo,
      encoding: this.encoding,
    };
  }
}

