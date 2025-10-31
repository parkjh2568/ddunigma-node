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

    // charset 초기화
    let finalCharSet: string[];
    let finalPadding: string;
    let requiredLength: number;
    let bitLength: number;
    let isPredefined = false;

    try {
      const result = this.initializeCharSet(dduChar, paddingChar, dduOptions);
      finalCharSet = [...result.finalCharSet];
      finalPadding = result.finalPadding;
      requiredLength = result.requiredLength;
      bitLength = result.bitLength;
      isPredefined = result.isPredefined;
    } catch (error) {
      // useBuildErrorReturn이 true일 경우 에러를 그대로 throw
      if (dduOptions?.useBuildErrorReturn ?? false) {
        throw error;
      }

      // fallback 처리
      const fallbackResult = this.getFallbackCharSet(dduOptions);
      finalCharSet = [...fallbackResult.finalCharSet];
      finalPadding = fallbackResult.finalPadding;
      requiredLength = fallbackResult.requiredLength;
      bitLength = fallbackResult.bitLength;
      isPredefined = true; // fallback도 predefined charset 사용
    }

    const shouldThrowError = dduOptions?.useBuildErrorReturn ?? false;

    const normalized = this.normalizeCharSet({
      charSet: finalCharSet,
      padding: finalPadding,
      requiredLength,
      bitLength,
      isPredefined,
      shouldThrowError,
      dduOptions,
    });

    this.dduChar = normalized.charSet;
    this.paddingChar = normalized.padding;
    this.charLength = normalized.charLength;
    this.bitLength = normalized.bitLength;
    this.isPredefinedCharSet = normalized.isPredefined;

    const dduLength = this.dduChar.length;
    this.usePowerOfTwo = dduLength > 0 && (dduLength & (dduLength - 1)) === 0;

    this.effectiveBitLength = this.usePowerOfTwo
      ? this.bitLength
      : this.getBitLength(dduLength);

    const canUseBitwise = this.effectiveBitLength <= 26;
    if (canUseBitwise) {
      this.binaryChunkToIntFn = (chunk: string): number => {
        let value = 0;
        for (let i = 0; i < chunk.length; i++) {
          value = (value << 1) | (chunk.charCodeAt(i) & 1);
        }
        return value;
      };
    } else {
      this.binaryChunkToIntFn = (chunk: string): number => {
        let value = 0;
        for (let i = 0; i < chunk.length; i++) {
          value = value * 2 + (chunk.charCodeAt(i) & 1);
        }
        return value;
      };
    }

    this.encoding = dduOptions?.encoding ?? this.defaultEncoding;

    this.dduChar.forEach((char, index) => {
      this.dduBinaryLookup.set(char, index);
    });

    if (this.charLength >= 2 && !this.isPredefinedCharSet) {
      this.validateCombinationDuplicates(
        this.dduChar,
        this.paddingChar,
        this.dduChar.length
      );
    }

    if (this.effectiveBitLength <= 16) {
      const cacheSize = 1 << this.effectiveBitLength;
      this.indexToBinaryCache = new Array(cacheSize);
      for (let i = 0; i < cacheSize; i++) {
        this.indexToBinaryCache[i] = i
          .toString(2)
          .padStart(this.effectiveBitLength, "0");
      }
    } else {
      this.indexToBinaryCache = null;
    }
  }

  /**
   * charset 초기화 (커스텀 또는 미리 정의된 charset)
   */
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

    // 1. 커스텀 charset 사용
    if (finalDduChar) {
      return this.processCustomCharSet(
        finalDduChar,
        finalPaddingChar,
        dduOptions
      );
    }

    // 2. 미리 정의된 charset 사용
    if (dduOptions?.dduSetSymbol) {
      return this.processPredefinedCharSet(
        dduOptions.dduSetSymbol,
        dduOptions
      );
    }

    // 3. 기본 charset 사용
    return this.processDefaultCharSet();
  }

  /**
   * 커스텀 charset 처리
   */
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
      throw new Error(
        "paddingChar is required when dduChar or dduOptions.dduChar is provided"
      );
    }

    // string 타입을 배열로 변환
    const dduCharArray = this.convertToCharArray(dduChar);
    const dduCharLength = dduOptions?.requiredLength ?? dduCharArray.length;

    if (dduCharArray.length < dduCharLength) {
      throw new Error(
        `dduChar must be at least ${dduCharLength} characters long. Provided: ${dduCharArray.length}`
      );
    }

    // usePowerOfTwo 처리
    // charArray의 길이가 2의 제곱수이거나 option에 usePowerOfTwo가 명시적으로 true일 때만 적용
    const shouldUsePowerOfTwo = 
      dduOptions?.usePowerOfTwo === true || 
      (dduOptions?.usePowerOfTwo === undefined && this.isPowerOfTwo(dduCharLength));
    
    const result = this.applyPowerOfTwoOption(
      dduCharArray,
      paddingChar,
      dduCharLength,
      shouldUsePowerOfTwo
    );
    
    return {
      ...result,
      isPredefined: false // 커스텀 charset은 검증 필요
    };
  }

  /**
   * 미리 정의된 charset 처리
   */
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

    // usePowerOfTwo 처리
    // charArray의 길이가 2의 제곱수이거나 option에 usePowerOfTwo가 명시적으로 true일 때만 적용
    const shouldUsePowerOfTwo = 
      dduOptions?.usePowerOfTwo === true || 
      (dduOptions?.usePowerOfTwo === undefined && this.isPowerOfTwo(maxRequiredLength));
    
    if (shouldUsePowerOfTwo) {
      const result = this.applyPowerOfTwoOption(
        charSet,
        paddingChar,
        maxRequiredLength,
        true
      );
      return {
        ...result,
        isPredefined: true // 미리 정의된 charset은 검증 패스
      };
    }

    return {
      finalCharSet: charSet,
      finalPadding: paddingChar,
      requiredLength: maxRequiredLength,
      bitLength,
      isPredefined: true // 미리 정의된 charset은 검증 패스
    };
  }

  /**
   * 기본 charset 처리
   */
  private processDefaultCharSet(): {
    finalCharSet: string[];
    finalPadding: string;
    requiredLength: number;
    bitLength: number;
    isPredefined: boolean;
  } {
    const defaultSymbol =
      dduDefaultConstructorOptions.dduSetSymbol ?? DduSetSymbol.DDU;
    const fixedCharSet = getCharSet(defaultSymbol);

    if (!fixedCharSet) {
      throw new Error(`Default CharSet with symbol ${defaultSymbol} not found`);
    }

    return {
      finalCharSet: fixedCharSet.charSet,
      finalPadding: fixedCharSet.paddingChar,
      requiredLength: fixedCharSet.maxRequiredLength,
      bitLength: fixedCharSet.bitLength,
      isPredefined: true // 기본 charset도 미리 정의된 것이므로 검증 패스
    };
  }

  /**
   * fallback charset 가져오기
   * 우선순위: dduOptions.dduSetSymbol > dduDefaultConstructorOptions.dduSetSymbol > DduSetSymbol.ONECHARSET
   */
  private getFallbackCharSet(dduOptions?: DduConstructorOptions): {
    finalCharSet: string[];
    finalPadding: string;
    requiredLength: number;
    bitLength: number;
  } {
    // 우선순위에 따라 fallback symbol 결정
    const fallbackSymbol =
      dduOptions?.dduSetSymbol ??
      dduDefaultConstructorOptions.dduSetSymbol ??
      DduSetSymbol.ONECHARSET; // DDU 대신 ONECHARSET 사용
    
    const fixedCharSet = getCharSet(fallbackSymbol);

    if (!fixedCharSet) {
      // 최후의 fallback: ONECHARSET
      const lastResort = getCharSet(DduSetSymbol.ONECHARSET);
      if (!lastResort) {
        throw new Error(`Critical: No fallback CharSet available`);
      }
      return {
        finalCharSet: lastResort.charSet,
        finalPadding: lastResort.paddingChar,
        requiredLength: lastResort.maxRequiredLength,
        bitLength: lastResort.bitLength,
      };
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
    let currentCharSet = [...params.charSet];
    let currentPadding = params.padding;
    let currentRequiredLength = params.requiredLength;
    let currentBitLength = params.bitLength;
    let currentIsPredefined = params.isPredefined;
    const { shouldThrowError, dduOptions } = params;

    let fallbackCache:
      | {
          finalCharSet: string[];
          finalPadding: string;
          requiredLength: number;
          bitLength: number;
        }
      | null = null;

    const getFallback = () => {
      if (!fallbackCache) {
        const fallback = this.getFallbackCharSet(dduOptions);
        fallbackCache = {
          finalCharSet: [...fallback.finalCharSet],
          finalPadding: fallback.finalPadding,
          requiredLength: fallback.requiredLength,
          bitLength: fallback.bitLength,
        };
      }
      return fallbackCache;
    };

    const applyFallback = () => {
      const fallback = getFallback();
      currentCharSet = [...fallback.finalCharSet];
      currentPadding = fallback.finalPadding;
      currentRequiredLength = fallback.requiredLength;
      currentBitLength = fallback.bitLength;
      currentIsPredefined = true;
    };

    const ensureMinLength = () => {
      if (currentCharSet.length < currentRequiredLength) {
        if (shouldThrowError) {
          throw new Error(
            `${this.constructor.name} requires at least ${currentRequiredLength} characters in the character set. Provided: ${currentCharSet.length}`
          );
        }
        applyFallback();
      }
    };

    if (!currentIsPredefined) {
      const uniqueChars = new Set(currentCharSet);
      if (uniqueChars.size !== currentCharSet.length) {
        if (shouldThrowError) {
          throw new Error(
            `Character set contains duplicate characters. Unique: ${uniqueChars.size}, Total: ${currentCharSet.length}`
          );
        }
        currentCharSet = Array.from(uniqueChars);
      }
    }

    ensureMinLength();

    let charLength = currentCharSet[0]?.length ?? 0;
    if (charLength === 0) {
      if (shouldThrowError) {
        throw new Error(
          `${this.constructor.name} requires at least ${currentRequiredLength} characters in the character set. Provided: ${currentCharSet.length}`
        );
      }
      applyFallback();
      charLength = currentCharSet[0]?.length ?? 0;
    }

    const invalidIndex = currentCharSet.findIndex(
      (char) => char.length !== charLength
    );
    if (invalidIndex !== -1) {
      if (shouldThrowError) {
        throw new Error(
          `All characters must have the same length. Expected: ${charLength}, but character at index ${invalidIndex} ("${currentCharSet[invalidIndex]}") has length ${currentCharSet[invalidIndex].length}`
        );
      }
      currentCharSet = currentCharSet.filter((char) => char.length === charLength);
      ensureMinLength();
      charLength = currentCharSet[0]?.length ?? 0;
    }

    if (!currentCharSet.length) {
      if (shouldThrowError) {
        throw new Error(
          `${this.constructor.name} requires at least ${currentRequiredLength} characters in the character set. Provided: 0`
        );
      }
      applyFallback();
      charLength = currentCharSet[0]?.length ?? 0;
    }

    if (currentPadding.length !== charLength) {
      if (shouldThrowError) {
        throw new Error(
          `Padding character must have the same length as the characters. Expected: ${charLength}, but padding character has length ${currentPadding.length}`
        );
      }
      applyFallback();
      charLength = currentCharSet[0]?.length ?? 0;
    }

    const charSetLookup = new Set(currentCharSet);
    if (charSetLookup.has(currentPadding)) {
      if (shouldThrowError) {
        throw new Error(
          `Padding character "${currentPadding}" cannot be in the character set`
        );
      }
      currentCharSet = currentCharSet.filter((char) => char !== currentPadding);
      ensureMinLength();
      charLength = currentCharSet[0]?.length ?? 0;
    }

    currentCharSet = currentCharSet.slice(0, currentRequiredLength);

    return {
      charSet: currentCharSet,
      padding: currentPadding,
      requiredLength: currentRequiredLength,
      bitLength: currentBitLength,
      isPredefined: currentIsPredefined,
      charLength,
    };
  }

  private getBinaryFromIndex(index: number): string {
    const cache = this.indexToBinaryCache;
    if (cache && index < cache.length) {
      return cache[index];
    }
    return index.toString(2).padStart(this.effectiveBitLength, "0");
  }

  /**
   * string 또는 배열을 문자 배열로 변환
   */
  private convertToCharArray(input: string[] | string): string[] {
    if (typeof input === "string") {
      return [...new Set(input.trim())].map((c) => c);
    }
    return input;
  }

  /**
   * 숫자가 2의 제곱수인지 확인
   */
  private isPowerOfTwo(n: number): boolean {
    return n > 0 && (n & (n - 1)) === 0;
  }

  /**
   * usePowerOfTwo 옵션 적용
   */
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
      const powerOfTwoExponent = this.getLargestPowerOfTwoExponent(length);
      const powerOfTwoLength = Math.pow(2, powerOfTwoExponent);

      return {
        finalCharSet: charArray.slice(0, powerOfTwoLength),
        finalPadding: padding,
        requiredLength: powerOfTwoLength,
        bitLength: powerOfTwoExponent,
      };
    }

    return {
      finalCharSet: charArray.slice(0, length),
      finalPadding: padding,
      requiredLength: length,
      bitLength: this.getBitLength(length),
    };
  }

  /**
   * 2글자 이상의 문자셋에서 조합으로 인한 중복을 검증
   * 예: ["AB", "CD"] + padding "AB" 또는 "A" + "B" = "AB" 같은 경우 감지
   */
  private validateCombinationDuplicates(
    charSet: string[],
    paddingChar: string,
    requiredLength: number
  ): void {
    const charLength = charSet[0].length;
    const allStrings = new Set<string>();

    // 1. 기본 문자셋과 패딩 문자 추가
    charSet.slice(0, requiredLength).forEach((char) => allStrings.add(char));
    allStrings.add(paddingChar);

    // 2. 2개 조합 검사 (charLength * 2 길이)
    for (let i = 0; i < Math.min(charSet.length, requiredLength); i++) {
      for (let j = 0; j < Math.min(charSet.length, requiredLength); j++) {
        const combination = charSet[i] + charSet[j];
        
        // 조합이 기존 문자와 중복되는지 확인
        if (allStrings.has(combination)) {
          throw new Error(
            `Combination conflict detected: "${charSet[i]}" + "${charSet[j]}" = "${combination}" already exists in the character set or padding`
          );
        }
      }
      
      // 문자 + 패딩 조합 검사
      const charPlusPadding = charSet[i] + paddingChar;
      const paddingPlusChar = paddingChar + charSet[i];
      
      if (allStrings.has(charPlusPadding)) {
        throw new Error(
          `Combination conflict detected: "${charSet[i]}" + padding "${paddingChar}" = "${charPlusPadding}" already exists in the character set`
        );
      }
      
      if (allStrings.has(paddingPlusChar)) {
        throw new Error(
          `Combination conflict detected: padding "${paddingChar}" + "${charSet[i]}" = "${paddingPlusChar}" already exists in the character set`
        );
      }
    }

    // 3. 패딩 + 패딩 조합 검사
    const doublePadding = paddingChar + paddingChar;
    if (allStrings.has(doublePadding)) {
      throw new Error(
        `Combination conflict detected: padding "${paddingChar}" + padding "${paddingChar}" = "${doublePadding}" already exists in the character set`
      );
    }

    // 4. 3개 이상 조합 검사 (선택적, 성능을 위해 샘플링)
    // 모든 조합을 검사하면 O(n^3)이므로 일부만 샘플링
    if (charLength >= 2 && requiredLength <= 100) {
      // 100개 이하일 때만 전체 검사
      for (let i = 0; i < Math.min(charSet.length, requiredLength); i++) {
        for (let j = 0; j < Math.min(charSet.length, requiredLength); j++) {
          for (let k = 0; k < Math.min(charSet.length, requiredLength); k++) {
            const combination = charSet[i] + charSet[j] + charSet[k];
            
            // 조합의 부분 문자열이 기존 문자와 중복되는지 확인
            for (let start = 0; start < combination.length - charLength + 1; start++) {
              const substring = combination.substring(start, start + charLength);
              if (allStrings.has(substring) && substring !== charSet[i] && substring !== charSet[j] && substring !== charSet[k]) {
                throw new Error(
                  `Combination conflict detected: substring "${substring}" from "${charSet[i]}" + "${charSet[j]}" + "${charSet[k]}" conflicts with existing character`
                );
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
