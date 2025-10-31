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
  
  private readonly binaryToIntLookup: Map<string, number> = new Map();

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
    let isPredefined: boolean = false;

    try {
      const result = this.initializeCharSet(dduChar, paddingChar, dduOptions);
      finalCharSet = result.finalCharSet;
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
      finalCharSet = fallbackResult.finalCharSet;
      finalPadding = fallbackResult.finalPadding;
      requiredLength = fallbackResult.requiredLength;
      bitLength = fallbackResult.bitLength;
      isPredefined = true; // fallback도 predefined charset 사용
    }

    // 유효성 검사: 최소 requiredLength개 이상의 문자 필요
    if (finalCharSet.length < requiredLength) {
      throw new Error(
        `${this.constructor.name} requires at least ${requiredLength} characters in the character set. Provided: ${finalCharSet.length}`
      );
    }

    // 첫 번째 문자의 길이를 기준으로 설정
    this.charLength = finalCharSet[0].length;

    // 모든 문자의 길이가 동일한지 검사
    for (let i = 0; i < finalCharSet.length; i++) {
      if (finalCharSet[i].length !== this.charLength) {
        throw new Error(
          `All characters must have the same length. Expected: ${this.charLength}, but character at index ${i} ("${finalCharSet[i]}") has length ${finalCharSet[i].length}`
        );
      }
    }

    // 패딩 문자 길이 검사
    if (finalPadding.length !== this.charLength) {
      throw new Error(
        `Padding character must have the same length as the characters. Expected: ${this.charLength}, but padding character has length ${finalPadding.length}`
      );
    }

    // 중복 검사
    const uniqueChars = new Set(finalCharSet);
    if (uniqueChars.size !== finalCharSet.length) {
      throw new Error(
        `Character set contains duplicate characters. Unique: ${uniqueChars.size}, Total: ${finalCharSet.length}`
      );
    }

    // 패딩 문자가 문자셋에 포함되어 있는지 검사
    if (uniqueChars.has(finalPadding)) {
      throw new Error(
        `Padding character "${finalPadding}" cannot be in the character set`
      );
    }

    // 2글자 이상의 문자셋인 경우 조합 중복 검사 (미리 정의된 charset은 건너뜀)
    if (this.charLength >= 2 && !isPredefined) {
      this.validateCombinationDuplicates(
        finalCharSet,
        finalPadding,
        requiredLength
      );
    }

    // 앞에서부터 정확히 requiredLength개만 사용
    this.dduChar = finalCharSet.slice(0, requiredLength);
    this.paddingChar = finalPadding;
    this.bitLength = bitLength;
    this.isPredefinedCharSet = isPredefined;
    
    // requiredLength가 2의 제곱수인 경우 자동으로 usePowerOfTwo 활성화
    const isPowerOfTwo = (requiredLength & (requiredLength - 1)) === 0 && requiredLength > 0;
    this.usePowerOfTwo = isPowerOfTwo || (dduOptions?.usePowerOfTwo ?? true);
    
    // encoding 설정
    this.encoding = dduOptions?.encoding ?? this.defaultEncoding;

    // 룩업 테이블 생성
    this.dduChar.forEach((char, index) =>
      this.dduBinaryLookup.set(char, index)
    );
    
    // parseInt 최적화: 이진수 문자열 → 정수 룩업 테이블 생성
    // 가능한 모든 비트 패턴을 미리 계산
    // 성능 최적화: bitLength가 12 이하일 때만 룩업 테이블 사용 (4096 엔트리 이하)
    // 그 이상은 parseInt가 더 효율적 (캐시 미스 감소)
    const dduLength = this.dduChar.length;
    const effectiveBitLength = this.usePowerOfTwo 
      ? this.bitLength 
      : this.getBitLength(dduLength);
    
    if (effectiveBitLength <= 12) {
      const maxValue = Math.pow(2, effectiveBitLength);
      
      for (let i = 0; i < maxValue; i++) {
        const binaryStr = i.toString(2).padStart(effectiveBitLength, "0");
        this.binaryToIntLookup.set(binaryStr, i);
      }
    }
    // effectiveBitLength > 12인 경우 룩업 테이블을 생성하지 않음 (parseInt 사용)
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
    const result = this.applyPowerOfTwoOption(
      dduCharArray,
      paddingChar,
      dduCharLength,
      dduOptions?.usePowerOfTwo ?? true
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
    if (dduOptions?.usePowerOfTwo ?? true) {
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
   */
  private getFallbackCharSet(dduOptions?: DduConstructorOptions): {
    finalCharSet: string[];
    finalPadding: string;
    requiredLength: number;
    bitLength: number;
  } {
    const fallbackSymbol =
      dduOptions?.dduSetSymbol ??
      dduDefaultConstructorOptions.dduSetSymbol ??
      DduSetSymbol.DDU;
    const fixedCharSet = getCharSet(fallbackSymbol);

    if (!fixedCharSet) {
      throw new Error(`Fallback CharSet with symbol ${fallbackSymbol} not found`);
    }

    return {
      finalCharSet: fixedCharSet.charSet,
      finalPadding: fixedCharSet.paddingChar,
      requiredLength: fixedCharSet.maxRequiredLength,
      bitLength: fixedCharSet.bitLength,
    };
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
    const effectiveBitLength = this.usePowerOfTwo 
      ? this.bitLength 
      : this.getBitLength(dduLength);
    
    const { dduBinary, padding } = this.bufferToDduBinary(
      bufferInput,
      effectiveBitLength
    );

    // 문자열 연결 최적화: Array + join 사용
    const resultParts: string[] = new Array(dduBinary.length);

    // 각 비트 청크를 변환
    for (let i = 0; i < dduBinary.length; i++) {
      const binaryChunk = dduBinary[i];
      // parseInt 최적화: 룩업 테이블 사용
      const charInt = this.binaryToIntLookup.get(binaryChunk) ?? parseInt(binaryChunk, 2);
      
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
    const effectiveBitLength = this.usePowerOfTwo 
      ? this.bitLength 
      : this.getBitLength(dduLength);

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
        dduBinary += value.toString(2).padStart(effectiveBitLength, "0");
      }
    } else {
      // 고정 길이 직접 매핑 (charLength만큼씩 읽음)
      for (let i = 0; i < input.length; i += this.charLength) {
        const charChunk = input.slice(i, i + this.charLength);
        const charIndex = this.dduBinaryLookup.get(charChunk);
        if (charIndex === undefined)
          throw new Error(`Invalid character: ${charChunk}`);
        dduBinary += charIndex.toString(2).padStart(effectiveBitLength, "0");
      }
    }

    const decoded = this.dduBinaryToBuffer(dduBinary, paddingBits);

    return decoded.toString(this.encoding);
  }
}
