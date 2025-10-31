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
        if (!finalPadding) throw new Error("paddingChar is required when dduChar or dduOptions.dduChar is provided");
        const arr = typeof finalDduChar === "string" ? [...new Set(finalDduChar.trim())] : finalDduChar;
        const len = dduOptions?.requiredLength ?? arr.length;
        if (arr.length < len) throw new Error(`dduChar must be at least ${len} characters long. Provided: ${arr.length}`);
        
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
    this.bitLength = normalized.bitLength;
    this.isPredefinedCharSet = normalized.isPredefined;
    this.encoding = dduOptions?.encoding ?? this.defaultEncoding;

    const dduLength = this.dduChar.length;
    this.usePowerOfTwo = dduLength > 0 && (dduLength & (dduLength - 1)) === 0;
    this.effectiveBitLength = this.usePowerOfTwo ? this.bitLength : this.getBitLength(dduLength);
    this.binaryChunkToIntFn = this.effectiveBitLength <= 26
      ? (chunk) => chunk.split('').reduce((v, c) => (v << 1) | (c.charCodeAt(0) & 1), 0)
      : (chunk) => chunk.split('').reduce((v, c) => v * 2 + (c.charCodeAt(0) & 1), 0);

    this.dduChar.forEach((char, index) => this.dduBinaryLookup.set(char, index));

    if (this.charLength >= 2 && !this.isPredefinedCharSet) {
      this.validateCombinationDuplicates(this.dduChar, this.paddingChar, dduLength);
    }

    if (this.effectiveBitLength <= 16) {
      const size = 1 << this.effectiveBitLength;
      this.indexToBinaryCache = Array.from({ length: size }, (_, i) => 
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

    // 중복 제거 (커스텀 charset만)
    if (!isPredefined) {
      const uniqueChars = new Set(charSet);
      if (uniqueChars.size !== charSet.length) {
        if (shouldThrowError) throw new Error(`Character set contains duplicate characters. Unique: ${uniqueChars.size}, Total: ${charSet.length}`);
        charSet = Array.from(uniqueChars);
        requiredLength = charSet.length;
      }
    }

    // 검증
    if (validate(charSet.length < requiredLength, `${this.constructor.name} requires at least ${requiredLength} characters. Provided: ${charSet.length}`)) {
      return this.normalizeCharSet(charSet, padding, requiredLength, bitLength, isPredefined, shouldThrowError, dduOptions);
    }

    let charLength = charSet[0]?.length ?? 0;
    validate(charLength === 0, `${this.constructor.name} requires at least ${requiredLength} characters. Provided: ${charSet.length}`);

    const invalidIndex = charSet.findIndex(char => char.length !== charLength);
    if (invalidIndex !== -1) {
      if (shouldThrowError) throw new Error(`All characters must have the same length. Expected: ${charLength}, but index ${invalidIndex} has length ${charSet[invalidIndex].length}`);
      charSet = charSet.filter(char => char.length === charLength);
      validate(charSet.length < requiredLength, `${this.constructor.name} requires at least ${requiredLength} characters. Provided: ${charSet.length}`);
      charLength = charSet[0]?.length ?? 0;
    }

    validate(!charSet.length, `${this.constructor.name} requires at least ${requiredLength} characters. Provided: 0`);
    validate(padding.length !== charLength, `Padding character must have length ${charLength}, got ${padding.length}`);

    if (new Set(charSet).has(padding)) {
      if (shouldThrowError) throw new Error(`Padding character "${padding}" cannot be in the character set`);
      charSet = charSet.filter(char => char !== padding);
      validate(charSet.length < requiredLength, `${this.constructor.name} requires at least ${requiredLength} characters. Provided: ${charSet.length}`);
      charLength = charSet[0]?.length ?? 0;
    }

    return { charSet: charSet.slice(0, requiredLength), padding, requiredLength, bitLength, isPredefined, charLength };
  }

  private getBinaryFromIndex(index: number): string {
    return this.indexToBinaryCache?.[index] ?? index.toString(2).padStart(this.effectiveBitLength, "0");
  }

  private validateCombinationDuplicates(charSet: string[], paddingChar: string, requiredLength: number): void {
    const charLength = charSet[0].length;
    const allStrings = new Set([...charSet.slice(0, requiredLength), paddingChar]);
    const limit = Math.min(charSet.length, requiredLength);

    // 2개 조합 검사
    for (let i = 0; i < limit; i++) {
      for (let j = 0; j < limit; j++) {
        const combo = charSet[i] + charSet[j];
        if (allStrings.has(combo)) {
          throw new Error(`Combination conflict: "${charSet[i]}" + "${charSet[j]}" = "${combo}" already exists`);
        }
      }
      
      const charPad = charSet[i] + paddingChar;
      const padChar = paddingChar + charSet[i];
      if (allStrings.has(charPad)) throw new Error(`Combination conflict: "${charSet[i]}" + padding "${paddingChar}" = "${charPad}"`);
      if (allStrings.has(padChar)) throw new Error(`Combination conflict: padding "${paddingChar}" + "${charSet[i]}" = "${padChar}"`);
    }

    // 패딩 + 패딩 조합 검사
    const doublePad = paddingChar + paddingChar;
    if (allStrings.has(doublePad)) {
      throw new Error(`Combination conflict: double padding "${doublePad}" already exists`);
    }

    // 3개 조합 검사 (100개 이하만)
    if (charLength >= 2 && requiredLength <= 100) {
      for (let i = 0; i < limit; i++) {
        for (let j = 0; j < limit; j++) {
          for (let k = 0; k < limit; k++) {
            const combo = charSet[i] + charSet[j] + charSet[k];
            for (let start = 0; start <= combo.length - charLength; start++) {
              const sub = combo.substring(start, start + charLength);
              if (allStrings.has(sub) && sub !== charSet[i] && sub !== charSet[j] && sub !== charSet[k]) {
                throw new Error(`Combination conflict: substring "${sub}" from "${charSet[i]}" + "${charSet[j]}" + "${charSet[k]}"`);
              }
            }
          }
        }
      }
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
      
      if (this.charLength === 1 && !this.usePowerOfTwo) {
        // 가변 길이 조합 인코딩
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

  decode(input: string, _options?: DduOptions): string {
    // options는 구버전 호환성을 위해 유지하지만 사용하지 않음
    
    // 패딩 정보 추출
    let paddingBits = 0;
    const padCharIndex = input.indexOf(this.paddingChar);
    if (padCharIndex >= 0) {
      const paddingStr = input.substring(padCharIndex + this.paddingChar.length);
      paddingBits = parseInt(paddingStr) || 0;
      input = input.substring(0, padCharIndex);
    }

    let dduBinary = "";
    
    // 생성자에서 설정된 값 사용
    const dduLength = this.dduChar.length;
    const effectiveBitLength = this.effectiveBitLength;

    if (this.charLength === 1 && !this.usePowerOfTwo) {
      // 가변 길이 조합 디코딩 (2개씩 읽음)
      for (let i = 0; i < input.length; i += 2) {
        const firstChar = input[i];
        const secondChar = input[i + 1];
        
        const firstIndex = this.dduBinaryLookup.get(firstChar);
        const secondIndex = this.dduBinaryLookup.get(secondChar);
        if (firstIndex === undefined || secondIndex === undefined)
          throw new Error(`Invalid character: ${firstChar} or ${secondChar}`);

        const value = firstIndex * dduLength + secondIndex;
        dduBinary += this.getBinaryFromIndex(value);
      }
    } else {
      // 고정 길이 직접 매핑 (charLength만큼씩 읽음)
      for (let i = 0; i < input.length; i += this.charLength) {
        const charChunk = input.slice(i, i + this.charLength);
        const charIndex = this.dduBinaryLookup.get(charChunk);
        if (charIndex === undefined)
          throw new Error(`Invalid character: ${charChunk}`);
        dduBinary += this.getBinaryFromIndex(charIndex);
      }
    }

    const decoded = this.dduBinaryToBuffer(dduBinary, paddingBits);

    return decoded.toString(this.encoding);
  }
}

