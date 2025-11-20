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
    const getCharSetFromSymbol = (symbol: DduSetSymbol) => {
      const cs = getCharSet(symbol);
      if (!cs) throw new Error(`CharSet with symbol ${symbol} not found`);
      return cs;
    };

    // charset 초기화
    let charSet: string[], padding: string, requiredLength: number, bitLength: number, isPredefined: boolean;
    
    try {
      const finalDduChar = dduChar ?? dduOptions?.dduChar;
      const finalPadding = paddingChar ?? dduOptions?.paddingChar;

      if (finalDduChar) {
        // 커스텀 charset
        if (!finalPadding) {
          throw new Error(`[Ddu64 Constructor] paddingChar is required when dduChar is provided. Received: dduChar=${typeof finalDduChar}, paddingChar=${finalPadding}`);
        }
        
        // 문자열을 배열로 변환 (중복 제거 없이)
        const arr = typeof finalDduChar === "string" ? [...finalDduChar.trim()] : finalDduChar;
        
        // 중복 검사 (useBuildErrorReturn이 true일 때만)
        if (shouldThrowError) {
          const uniqueChars = new Set(arr);
          if (uniqueChars.size !== arr.length) {
            const duplicates = arr.filter((char, index) => arr.indexOf(char) !== index);
            throw new Error(`[Ddu64 Constructor] Character set contains duplicate characters. Total: ${arr.length}, Unique: ${uniqueChars.size}, Duplicates: [${[...new Set(duplicates)].join(', ')}]`);
          }
        }
        
        const len = dduOptions?.requiredLength ?? arr.length;
        if (arr.length < len) {
          throw new Error(`[Ddu64 Constructor] Insufficient characters in charset. Required: ${len}, Provided: ${arr.length}`);
        }
        
        const usePow2 = dduOptions?.usePowerOfTwo === true || (dduOptions?.usePowerOfTwo === undefined && len > 0 && (len & (len - 1)) === 0);
        if (usePow2) {
          const exp = this.getLargestPowerOfTwoExponent(len);
          const pow2Len = 1 << exp;
          [charSet, padding, requiredLength, bitLength, isPredefined] = [arr.slice(0, pow2Len), finalPadding, pow2Len, exp, false];
        } else {
          [charSet, padding, requiredLength, bitLength, isPredefined] = [arr.slice(0, len), finalPadding, len, this.getBitLength(len), false];
        }
      } else if (dduOptions?.dduSetSymbol) {
        // 미리 정의된 charset
        const cs = getCharSetFromSymbol(dduOptions.dduSetSymbol);
        const usePow2 = dduOptions?.usePowerOfTwo === true || (dduOptions?.usePowerOfTwo === undefined && cs.maxRequiredLength > 0 && (cs.maxRequiredLength & (cs.maxRequiredLength - 1)) === 0);
        if (usePow2) {
          const exp = this.getLargestPowerOfTwoExponent(cs.maxRequiredLength);
          const pow2Len = 1 << exp;
          [charSet, padding, requiredLength, bitLength, isPredefined] = [cs.charSet.slice(0, pow2Len), cs.paddingChar, pow2Len, exp, true];
        } else {
          [charSet, padding, requiredLength, bitLength, isPredefined] = [cs.charSet, cs.paddingChar, cs.maxRequiredLength, cs.bitLength, true];
        }
      } else {
        // 기본 charset
        const cs = getCharSetFromSymbol(dduDefaultConstructorOptions.dduSetSymbol ?? DduSetSymbol.DDU);
        [charSet, padding, requiredLength, bitLength, isPredefined] = [cs.charSet, cs.paddingChar, cs.maxRequiredLength, cs.bitLength, true];
      }
    } catch (error) {
      if (shouldThrowError) throw error;
      // fallback
      const fallbackSymbol = dduOptions?.dduSetSymbol ?? dduDefaultConstructorOptions.dduSetSymbol ?? DduSetSymbol.ONECHARSET;
      const cs = getCharSet(fallbackSymbol) ?? getCharSet(DduSetSymbol.ONECHARSET);
      if (!cs) throw new Error(`Critical: No fallback CharSet available`);
      [charSet, padding, requiredLength, bitLength, isPredefined] = [cs.charSet, cs.paddingChar, cs.maxRequiredLength, cs.bitLength, true];
    }

    // 정규화 및 검증
    const normalized = this.normalizeCharSet(charSet, padding, requiredLength, bitLength, isPredefined, shouldThrowError, dduOptions);
    
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
    this.binaryChunkToIntFn = (chunk) => chunk.split('').reduce((v, c) => v * 2 + (c.charCodeAt(0) & 1), 0);

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
    const applyFallback = () => {
      const fallbackSymbol = dduOptions?.dduSetSymbol ?? dduDefaultConstructorOptions.dduSetSymbol ?? DduSetSymbol.ONECHARSET;
      const cs = getCharSet(fallbackSymbol) ?? getCharSet(DduSetSymbol.ONECHARSET);
      if (!cs) throw new Error(`Critical: No fallback CharSet available`);
      return { charSet: cs.charSet, padding: cs.paddingChar, requiredLength: cs.maxRequiredLength, bitLength: cs.bitLength, isPredefined: true };
    };

    const validate = (condition: boolean, message: string) => {
      if (condition) {
        if (shouldThrowError) throw new Error(message);
        const fb = applyFallback();
        [charSet, padding, requiredLength, bitLength, isPredefined] = [fb.charSet, fb.padding, fb.requiredLength, fb.bitLength, fb.isPredefined];
        return true;
      }
      return false;
    };

    // 중복 제거 (모든 charset에 적용)
    const uniqueChars = new Set(charSet);
    if (uniqueChars.size !== charSet.length) {
      const duplicates = charSet.filter((char, index) => charSet.indexOf(char) !== index);
      const errorMsg = `[Ddu64 normalizeCharSet] Character set contains duplicate characters. Total: ${charSet.length}, Unique: ${uniqueChars.size}, Duplicates: [${[...new Set(duplicates)].join(', ')}]`;
      
      if (shouldThrowError) throw new Error(errorMsg);
      
      // 중복 제거 후 계속 진행
      charSet = Array.from(uniqueChars);
      if (!isPredefined) {
        requiredLength = charSet.length;
      }
    }

    // 검증
    if (validate(charSet.length < requiredLength, `[Ddu64 normalizeCharSet] Insufficient characters. Required: ${requiredLength}, Provided: ${charSet.length}`)) {
      return this.normalizeCharSet(charSet, padding, requiredLength, bitLength, isPredefined, shouldThrowError, dduOptions);
    }

    if (
      validate(
        requiredLength < 2,
        `[Ddu64 normalizeCharSet] At least 2 unique characters are required. Provided: ${requiredLength}`
      )
    ) {
      return this.normalizeCharSet(charSet, padding, requiredLength, bitLength, isPredefined, shouldThrowError, dduOptions);
    }

    if (
      validate(
        bitLength <= 0,
        `[Ddu64 normalizeCharSet] Invalid bit length (${bitLength}) for charset size ${requiredLength}`
      )
    ) {
      return this.normalizeCharSet(charSet, padding, requiredLength, bitLength, isPredefined, shouldThrowError, dduOptions);
    }

    let charLength = charSet[0]?.length ?? 0;
    validate(charLength === 0, `[Ddu64 normalizeCharSet] Empty charset. Required: ${requiredLength} characters`);

    const invalidIndex = charSet.findIndex(char => char.length !== charLength);
    if (invalidIndex !== -1) {
      if (shouldThrowError) {
        throw new Error(`[Ddu64 normalizeCharSet] Inconsistent character length. Expected: ${charLength}, but character at index ${invalidIndex} ("${charSet[invalidIndex]}") has length ${charSet[invalidIndex].length}`);
      }
      charSet = charSet.filter(char => char.length === charLength);
      validate(charSet.length < requiredLength, `[Ddu64 normalizeCharSet] Insufficient characters after filtering. Required: ${requiredLength}, Remaining: ${charSet.length}`);
      charLength = charSet[0]?.length ?? 0;
    }

    validate(!charSet.length, `[Ddu64 normalizeCharSet] Empty charset after validation`);
    validate(padding.length !== charLength, `[Ddu64 normalizeCharSet] Padding character length mismatch. Expected: ${charLength}, Got: ${padding.length} (padding: "${padding}")`);

    if (new Set(charSet).has(padding)) {
      if (shouldThrowError) {
        throw new Error(`[Ddu64 normalizeCharSet] Padding character "${padding}" conflicts with charset. Padding must not be in the character set.`);
      }
      charSet = charSet.filter(char => char !== padding);
      validate(charSet.length < requiredLength, `[Ddu64 normalizeCharSet] Insufficient characters after removing padding conflict. Required: ${requiredLength}, Remaining: ${charSet.length}`);
      charLength = charSet[0]?.length ?? 0;
    }

    return { charSet: charSet.slice(0, requiredLength), padding, requiredLength, bitLength, isPredefined, charLength };
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

    // 생성자에서 설정된 값 사용
    const dduLength = this.dduChar.length;
    const effectiveBitLength = this.effectiveBitLength;

    const { dduBinary, padding } = this.bufferToDduBinary(
      bufferInput,
      effectiveBitLength
    );

    // 문자열 연결 최적화: Array + join 사용
    const resultParts: string[] = new Array(dduBinary.length);

    // 각 비트 청크를 변환
    for (let i = 0; i < dduBinary.length; i++) {
      const binaryChunk = dduBinary[i];
      const charInt = this.binaryChunkToIntFn(binaryChunk);
      
      if (!this.usePowerOfTwo) {
        // 가변 길이 조합 인코딩 (멀티바이트 문자도 지원)
        const quotient = Math.floor(charInt / dduLength);
        const remainder = charInt % dduLength;
        resultParts[i] = this.dduChar[quotient] + this.dduChar[remainder];
      } else {
        // 고정 길이 직접 매핑
        resultParts[i] = this.dduChar[charInt];
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

    let dduBinary = "";
    
    const dduLength = this.dduChar.length;

    if (!this.usePowerOfTwo) {
      const chunkSize = this.charLength * 2;
      for (let i = 0; i < input.length; i += chunkSize) {
        const firstChar = input.slice(i, i + this.charLength);
        const secondChar = input.slice(i + this.charLength, i + chunkSize);
        
        const firstIndex = this.dduBinaryLookup.get(firstChar);
        const secondIndex = this.dduBinaryLookup.get(secondChar);
        if (firstIndex === undefined || secondIndex === undefined) {
          const invalidChar = firstIndex === undefined ? firstChar : secondChar;
          throw new Error(`[Ddu64 decode] Invalid character in encoded string. Character: "${invalidChar}", Position: ${i}, Expected charset size: ${dduLength}`);
        }

        const value = firstIndex * dduLength + secondIndex;
        if (value >= this.maxBinaryValue) {
          throw new Error(
            `[Ddu64 decode] Invalid character combination detected. Calculated value ${value} exceeds binary range ${this.maxBinaryValue - 1}.`
          );
        }
        dduBinary += this.getBinaryFromIndex(value);
      }
    } else {
      for (let i = 0; i < input.length; i += this.charLength) {
        const charChunk = input.slice(i, i + this.charLength);
        const charIndex = this.dduBinaryLookup.get(charChunk);
        if (charIndex === undefined) {
          throw new Error(`[Ddu64 decode] Invalid character in encoded string. Character: "${charChunk}", Position: ${i}, Charset size: ${dduLength}, Character length: ${this.charLength}`);
        }
        if (charIndex >= this.maxBinaryValue) {
          throw new Error(
            `[Ddu64 decode] Invalid binary index ${charIndex}. Allowed range: 0-${this.maxBinaryValue - 1}`
          );
        }
        dduBinary += this.getBinaryFromIndex(charIndex);
      }
    }

    return this.dduBinaryToBuffer(dduBinary, paddingBits);
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

