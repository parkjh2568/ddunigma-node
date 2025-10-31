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

  constructor(
    dduChar?: string[] | string,
    paddingChar?: string,
    dduOptions?: DduConstructorOptions
  ) {
    super();

    // charset 초기화 및 fallback 처리
    const shouldThrowError = dduOptions?.useBuildErrorReturn ?? false;
    let charSetInfo;
    
    try {
      charSetInfo = this.initializeCharSet(dduChar, paddingChar, dduOptions);
    } catch (error) {
      if (shouldThrowError) throw error;
      charSetInfo = { ...this.getFallbackCharSet(dduOptions), isPredefined: true };
    }

    // 정규화 및 검증
    const normalized = this.normalizeCharSet({ 
      charSet: charSetInfo.finalCharSet, 
      padding: charSetInfo.finalPadding, 
      requiredLength: charSetInfo.requiredLength, 
      bitLength: charSetInfo.bitLength, 
      isPredefined: charSetInfo.isPredefined, 
      shouldThrowError, 
      dduOptions 
    });
    
    this.dduChar = normalized.charSet;
    this.paddingChar = normalized.padding;
    this.charLength = normalized.charLength;
    this.bitLength = normalized.bitLength;
    this.isPredefinedCharSet = normalized.isPredefined;
    this.encoding = dduOptions?.encoding ?? this.defaultEncoding;

    // 2의 제곱수 여부 및 효율적인 비트 길이 계산
    const dduLength = this.dduChar.length;
    this.usePowerOfTwo = dduLength > 0 && (dduLength & (dduLength - 1)) === 0;
    this.effectiveBitLength = this.usePowerOfTwo ? this.bitLength : this.getBitLength(dduLength);

    // 바이너리 변환 함수 설정 (비트 연산 가능 여부에 따라)
    this.binaryChunkToIntFn = this.effectiveBitLength <= 26
      ? (chunk) => chunk.split('').reduce((v, c) => (v << 1) | (c.charCodeAt(0) & 1), 0)
      : (chunk) => chunk.split('').reduce((v, c) => v * 2 + (c.charCodeAt(0) & 1), 0);

    // lookup 테이블 생성
    this.dduChar.forEach((char, index) => this.dduBinaryLookup.set(char, index));

    // 조합 중복 검증 (2글자 이상 커스텀 charset만)
    if (this.charLength >= 2 && !this.isPredefinedCharSet) {
      this.validateCombinationDuplicates(this.dduChar, this.paddingChar, dduLength);
    }

    // 인덱스-바이너리 캐시 생성 (16비트 이하만)
    if (this.effectiveBitLength <= 16) {
      const size = 1 << this.effectiveBitLength;
      this.indexToBinaryCache = Array.from({ length: size }, (_, i) => 
        i.toString(2).padStart(this.effectiveBitLength, "0")
      );
    } else {
      this.indexToBinaryCache = null;
    }
  }

  private initializeCharSet(
    dduChar?: string[] | string,
    paddingChar?: string,
    dduOptions?: DduConstructorOptions
  ): {
    finalCharSet: string[];
    finalPadding: string;
    requiredLength: number;
    bitLength: number;
    isPredefined: boolean;
  } {
    const finalDduChar = dduChar ?? dduOptions?.dduChar;
    const finalPaddingChar = paddingChar ?? dduOptions?.paddingChar;

    if (finalDduChar) {
      return this.processCustomCharSet(finalDduChar, finalPaddingChar, dduOptions);
    }
    if (dduOptions?.dduSetSymbol) {
      return this.processPredefinedCharSet(dduOptions.dduSetSymbol, dduOptions);
    }
    return this.processDefaultCharSet();
  }

  private processCustomCharSet(
    dduChar: string[] | string,
    paddingChar: string | undefined,
    dduOptions?: DduConstructorOptions
  ): {
    finalCharSet: string[];
    finalPadding: string;
    requiredLength: number;
    bitLength: number;
    isPredefined: boolean;
  } {
    if (!paddingChar) {
      throw new Error("paddingChar is required when dduChar or dduOptions.dduChar is provided");
    }

    const dduCharArray = this.convertToCharArray(dduChar);
    const dduCharLength = dduOptions?.requiredLength ?? dduCharArray.length;

    if (dduCharArray.length < dduCharLength) {
      throw new Error(`dduChar must be at least ${dduCharLength} characters long. Provided: ${dduCharArray.length}`);
    }

    const shouldUsePowerOfTwo = dduOptions?.usePowerOfTwo === true || 
      (dduOptions?.usePowerOfTwo === undefined && this.isPowerOfTwo(dduCharLength));
    
    return {
      ...this.applyPowerOfTwoOption(dduCharArray, paddingChar, dduCharLength, shouldUsePowerOfTwo),
      isPredefined: false
    };
  }

  private processPredefinedCharSet(
    symbol: DduSetSymbol,
    dduOptions?: DduConstructorOptions
  ): {
    finalCharSet: string[];
    finalPadding: string;
    requiredLength: number;
    bitLength: number;
    isPredefined: boolean;
  } {
    const fixedCharSet = getCharSet(symbol);
    if (!fixedCharSet) {
      throw new Error(`CharSet with symbol ${symbol} not found`);
    }

    const { charSet, paddingChar, maxRequiredLength, bitLength } = fixedCharSet;
    const shouldUsePowerOfTwo = dduOptions?.usePowerOfTwo === true || 
      (dduOptions?.usePowerOfTwo === undefined && this.isPowerOfTwo(maxRequiredLength));
    
    if (shouldUsePowerOfTwo) {
      return { ...this.applyPowerOfTwoOption(charSet, paddingChar, maxRequiredLength, true), isPredefined: true };
    }

    return { finalCharSet: charSet, finalPadding: paddingChar, requiredLength: maxRequiredLength, bitLength, isPredefined: true };
  }

  private processDefaultCharSet(): {
    finalCharSet: string[];
    finalPadding: string;
    requiredLength: number;
    bitLength: number;
    isPredefined: boolean;
  } {
    const defaultSymbol = dduDefaultConstructorOptions.dduSetSymbol ?? DduSetSymbol.DDU;
    const fixedCharSet = getCharSet(defaultSymbol);
    if (!fixedCharSet) {
      throw new Error(`Default CharSet with symbol ${defaultSymbol} not found`);
    }
    return {
      finalCharSet: fixedCharSet.charSet,
      finalPadding: fixedCharSet.paddingChar,
      requiredLength: fixedCharSet.maxRequiredLength,
      bitLength: fixedCharSet.bitLength,
      isPredefined: true
    };
  }

  private getFallbackCharSet(dduOptions?: DduConstructorOptions): {
    finalCharSet: string[];
    finalPadding: string;
    requiredLength: number;
    bitLength: number;
  } {
    const fallbackSymbol = dduOptions?.dduSetSymbol ?? dduDefaultConstructorOptions.dduSetSymbol ?? DduSetSymbol.ONECHARSET;
    const fixedCharSet = getCharSet(fallbackSymbol) ?? getCharSet(DduSetSymbol.ONECHARSET);
    
    if (!fixedCharSet) {
      throw new Error(`Critical: No fallback CharSet available`);
    }

    return {
      finalCharSet: fixedCharSet.charSet,
      finalPadding: fixedCharSet.paddingChar,
      requiredLength: fixedCharSet.maxRequiredLength,
      bitLength: fixedCharSet.bitLength,
    };
  }

  private normalizeCharSet(params: {
    charSet: string[];
    padding: string;
    requiredLength: number;
    bitLength: number;
    isPredefined: boolean;
    shouldThrowError: boolean;
    dduOptions?: DduConstructorOptions;
  }): {
    charSet: string[];
    padding: string;
    requiredLength: number;
    bitLength: number;
    isPredefined: boolean;
    charLength: number;
  } {
    let { charSet, padding, requiredLength, bitLength, isPredefined } = params;
    const { shouldThrowError, dduOptions } = params;
    let fallbackCache: ReturnType<typeof this.getFallbackCharSet> | null = null;

    const applyFallback = () => {
      if (!fallbackCache) fallbackCache = this.getFallbackCharSet(dduOptions);
      charSet = [...fallbackCache.finalCharSet];
      padding = fallbackCache.finalPadding;
      requiredLength = fallbackCache.requiredLength;
      bitLength = fallbackCache.bitLength;
      isPredefined = true;
    };

    const validate = (condition: boolean, message: string) => {
      if (condition) {
        if (shouldThrowError) throw new Error(message);
        applyFallback();
        return true;
      }
      return false;
    };

    // 중복 제거 (커스텀 charset만)
    if (!isPredefined) {
      const uniqueChars = new Set(charSet);
      if (uniqueChars.size !== charSet.length) {
        if (shouldThrowError) {
          throw new Error(`Character set contains duplicate characters. Unique: ${uniqueChars.size}, Total: ${charSet.length}`);
        }
        charSet = Array.from(uniqueChars);
        requiredLength = charSet.length;
      }
    }

    // 최소 길이 검증
    if (validate(charSet.length < requiredLength, 
      `${this.constructor.name} requires at least ${requiredLength} characters. Provided: ${charSet.length}`)) {
      return this.normalizeCharSet({ ...params, charSet, padding, requiredLength, bitLength, isPredefined });
    }

    // 문자 길이 검증
    let charLength = charSet[0]?.length ?? 0;
    if (validate(charLength === 0, `${this.constructor.name} requires at least ${requiredLength} characters. Provided: ${charSet.length}`)) {
      charLength = charSet[0]?.length ?? 0;
    }

    // 일관된 문자 길이 검증
    const invalidIndex = charSet.findIndex(char => char.length !== charLength);
    if (invalidIndex !== -1) {
      if (shouldThrowError) {
        throw new Error(`All characters must have the same length. Expected: ${charLength}, but index ${invalidIndex} has length ${charSet[invalidIndex].length}`);
      }
      charSet = charSet.filter(char => char.length === charLength);
      if (validate(charSet.length < requiredLength, `${this.constructor.name} requires at least ${requiredLength} characters. Provided: ${charSet.length}`)) {
        charLength = charSet[0]?.length ?? 0;
      }
    }

    // 빈 charset 검증
    if (validate(!charSet.length, `${this.constructor.name} requires at least ${requiredLength} characters. Provided: 0`)) {
      charLength = charSet[0]?.length ?? 0;
    }

    // 패딩 길이 검증
    if (validate(padding.length !== charLength, `Padding character must have length ${charLength}, got ${padding.length}`)) {
      charLength = charSet[0]?.length ?? 0;
    }

    // 패딩 중복 검증
    if (new Set(charSet).has(padding)) {
      if (shouldThrowError) {
        throw new Error(`Padding character "${padding}" cannot be in the character set`);
      }
      charSet = charSet.filter(char => char !== padding);
      if (validate(charSet.length < requiredLength, `${this.constructor.name} requires at least ${requiredLength} characters. Provided: ${charSet.length}`)) {
        charLength = charSet[0]?.length ?? 0;
      }
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

  private getBinaryFromIndex(index: number): string {
    return this.indexToBinaryCache?.[index] ?? index.toString(2).padStart(this.effectiveBitLength, "0");
  }

  private convertToCharArray(input: string[] | string): string[] {
    return typeof input === "string" ? [...new Set(input.trim())] : input;
  }

  private isPowerOfTwo(n: number): boolean {
    return n > 0 && (n & (n - 1)) === 0;
  }

  private applyPowerOfTwoOption(
    charArray: string[],
    padding: string,
    length: number,
    usePowerOfTwo: boolean
  ): {
    finalCharSet: string[];
    finalPadding: string;
    requiredLength: number;
    bitLength: number;
  } {
    if (usePowerOfTwo) {
      const exp = this.getLargestPowerOfTwoExponent(length);
      const len = 1 << exp;
      return { finalCharSet: charArray.slice(0, len), finalPadding: padding, requiredLength: len, bitLength: exp };
    }
    return { finalCharSet: charArray.slice(0, length), finalPadding: padding, requiredLength: length, bitLength: this.getBitLength(length) };
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

