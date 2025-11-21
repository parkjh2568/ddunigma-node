import { BaseDdu } from "../base/BaseDdu";
import {
  DduConstructorOptions,
  DduOptions,
  DduSetSymbol,
  dduDefaultConstructorOptions,
} from "../types";
import { getCharSet } from "../charSets";

export class Ddu64 extends BaseDdu {
  // =========================================================================================
  // Properties
  // =========================================================================================
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

  // =========================================================================================
  // Constructor
  // =========================================================================================
  constructor(dduChar?: string[] | string, paddingChar?: string, dduOptions?: DduConstructorOptions) {
    super();
    const shouldThrow = dduOptions?.useBuildErrorReturn ?? false;

    // 1. CharSet 초기화 및 검증
    const initial = this.resolveInitialCharSet(dduChar, paddingChar, dduOptions, shouldThrow);
    const normalized = this.normalizeCharSet(initial, shouldThrow, dduOptions);
    
    this.dduChar = normalized.charSet;
    this.paddingChar = normalized.padding;
    this.charLength = normalized.charLength;
    this.isPredefinedCharSet = normalized.isPredefined;
    this.encoding = dduOptions?.encoding ?? this.defaultEncoding;

    // 2. 비트 연산 상수 계산
    const dduLength = this.dduChar.length;
    this.usePowerOfTwo = dduLength > 0 && (dduLength & (dduLength - 1)) === 0;
    
    const computedBitLength = this.getBitLength(dduLength);
    this.bitLength = this.usePowerOfTwo ? this.getLargestPowerOfTwoExponent(dduLength) : computedBitLength;
    this.effectiveBitLength = this.usePowerOfTwo ? this.bitLength : computedBitLength;
    this.maxBinaryValue = 2 ** this.effectiveBitLength;
    
    // 3. Lookup Table 생성 (Decoding용)
    for (let i = 0; i < dduLength; i++) {
      this.dduBinaryLookup.set(this.dduChar[i], i);
    }

    // 4. 안전성 검사
    if (this.charLength === 1 && !this.isPredefinedCharSet) {
      this.validateCombinationDuplicates(this.dduChar, this.paddingChar, dduLength);
    }
  }

  // =========================================================================================
  // Public API
  // =========================================================================================
  
  /**
   * 데이터를 DDU 포맷으로 인코딩합니다.
   * 성능을 위해 24비트 이하는 Fast Path(number 연산)를 사용합니다.
   */
  encode(input: Buffer | string, _options?: DduOptions): string {
    const bufferInput = typeof input === "string" ? Buffer.from(input, this.encoding) : input;
    
    if (this.effectiveBitLength <= 24) {
      return this.encodeFast(bufferInput);
    }
    return this.encodeBigInt(bufferInput);
  }

  /**
   * DDU 포맷 문자열을 버퍼로 디코딩합니다.
   */
  decodeToBuffer(input: string, _options?: DduOptions): Buffer {
    if (this.effectiveBitLength <= 24) {
      return this.decodeFast(input);
    }
    return this.decodeBigInt(input);
  }

  decode(input: string, _options?: DduOptions): string {
    return this.decodeToBuffer(input, _options).toString(this.encoding);
  }

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

  // =========================================================================================
  // Fast Engine (Optimized for Speed)
  // Uses standard JS numbers (safe up to ~24 bits per chunk) to avoid BigInt GC overhead.
  // =========================================================================================

  private encodeFast(bufferInput: Buffer): string {
    const resultParts: string[] = [];
    const { dduChar, effectiveBitLength: bitLength, paddingChar } = this;
    const dduLength = dduChar.length;
    
    let accumulator = 0;
    let accumulatorBits = 0;

    // Loop Unswitching: 조건문을 루프 밖으로 빼서 CPU 분기 예측 효율 향상
    if (this.usePowerOfTwo) {
      for (const byte of bufferInput) {
        accumulator = (accumulator << 8) | byte;
        accumulatorBits += 8;

        while (accumulatorBits >= bitLength) {
          const shift = accumulatorBits - bitLength;
          const index = accumulator >> shift;
          resultParts.push(dduChar[index]);
          
          accumulatorBits -= bitLength;
          accumulator &= (1 << accumulatorBits) - 1;
        }
      }
    } else {
      for (const byte of bufferInput) {
        accumulator = (accumulator << 8) | byte;
        accumulatorBits += 8;

        while (accumulatorBits >= bitLength) {
          const shift = accumulatorBits - bitLength;
          const index = accumulator >> shift;
          
          // 비 2의 제곱수는 나눗셈으로 인덱스 계산
          const div = (index / dduLength) | 0;
          const mod = index % dduLength;
          resultParts.push(dduChar[div] + dduChar[mod]);

          accumulatorBits -= bitLength;
          accumulator &= (1 << accumulatorBits) - 1;
        }
      }
    }

    // 남은 비트 패딩 처리
    if (accumulatorBits > 0) {
      const paddingBits = bitLength - accumulatorBits;
      const index = accumulator << paddingBits;
      
      if (this.usePowerOfTwo) {
        resultParts.push(dduChar[index]);
      } else {
        const div = (index / dduLength) | 0;
        const mod = index % dduLength;
        resultParts.push(dduChar[div] + dduChar[mod]);
      }
      return resultParts.join("") + paddingChar + paddingBits.toString();
    }

    return resultParts.join("");
  }

  private decodeFast(input: string): Buffer {
    const { cleanedInput, paddingBits } = this.parsePaddingAndGetInput(input);
    const inputLen = cleanedInput.length;
    const buffer: number[] = [];
    
    let accumulator = 0;
    let accumulatorBits = 0;
    
    const { effectiveBitLength: bitLength, dduBinaryLookup: lookup, charLength, maxBinaryValue } = this;
    const dduLength = this.dduChar.length;

    if (this.usePowerOfTwo) {
      const chunkSize = charLength;
      for (let i = 0; i < inputLen; i += chunkSize) {
        const chunk = cleanedInput.slice(i, i + charLength);
        const val = lookup.get(chunk);
        
        if (val === undefined) throw new Error(`[Ddu64 decode] Invalid character "${chunk}" at ${i}`);
        if (val >= maxBinaryValue) throw new Error(`[Ddu64 decode] Value ${val} exceeds range`);

        accumulator = (accumulator << bitLength) | val;
        accumulatorBits += bitLength;

        // 마지막 청크 패딩 비트 제거
        if (i + chunkSize >= inputLen && paddingBits > 0) {
          accumulator >>= paddingBits;
          accumulatorBits -= paddingBits;
        }

        while (accumulatorBits >= 8) {
          const shift = accumulatorBits - 8;
          buffer.push((accumulator >> shift) & 0xFF);
          accumulatorBits -= 8;
          accumulator &= (1 << accumulatorBits) - 1;
        }
      }
    } else {
      const chunkSize = charLength * 2;
      for (let i = 0; i < inputLen; i += chunkSize) {
        const c1 = cleanedInput.slice(i, i + charLength);
        const c2 = cleanedInput.slice(i + charLength, i + chunkSize);
        const v1 = lookup.get(c1);
        const v2 = lookup.get(c2);
        
        if (v1 === undefined) throw new Error(`[Ddu64 decode] Invalid character "${c1}" at ${i}`);
        if (v2 === undefined) throw new Error(`[Ddu64 decode] Invalid character "${c2}" at ${i + charLength}`);
        
        const value = v1 * dduLength + v2;
        if (value >= maxBinaryValue) throw new Error(`[Ddu64 decode] Value ${value} exceeds range`);

        accumulator = (accumulator << bitLength) | value;
        accumulatorBits += bitLength;

        if (i + chunkSize >= inputLen && paddingBits > 0) {
          accumulator >>= paddingBits;
          accumulatorBits -= paddingBits;
        }

        while (accumulatorBits >= 8) {
          const shift = accumulatorBits - 8;
          buffer.push((accumulator >> shift) & 0xFF);
          accumulatorBits -= 8;
          accumulator &= (1 << accumulatorBits) - 1;
        }
      }
    }

    return Buffer.from(buffer);
  }

  // =========================================================================================
  // Safe Engine (BigInt)
  // Fallback for huge charsets (> 24 bits per chunk) where 32-bit integers overflow.
  // =========================================================================================

  private encodeBigInt(bufferInput: Buffer): string {
    const resultParts: string[] = [];
    const { dduChar, effectiveBitLength: bitLength } = this;
    const dduLength = dduChar.length;
    const bigBitLength = BigInt(bitLength);
    
    let accumulator = 0n;
    let accumulatorBits = 0;

    if (this.usePowerOfTwo) {
      for (const byte of bufferInput) {
        accumulator = (accumulator << 8n) | BigInt(byte);
        accumulatorBits += 8;

        while (accumulatorBits >= bitLength) {
          const shift = accumulatorBits - bitLength;
          const value = accumulator >> BigInt(shift);
          
          resultParts.push(dduChar[Number(value)]);
          
          accumulator &= ((1n << BigInt(shift)) - 1n);
          accumulatorBits -= bitLength;
        }
      }
    } else {
      for (const byte of bufferInput) {
        accumulator = (accumulator << 8n) | BigInt(byte);
        accumulatorBits += 8;

        while (accumulatorBits >= bitLength) {
          const shift = accumulatorBits - bitLength;
          const value = accumulator >> BigInt(shift);
          const idx = Number(value);
          
          resultParts.push(dduChar[Math.floor(idx / dduLength)] + dduChar[idx % dduLength]);
          
          accumulator &= ((1n << BigInt(shift)) - 1n);
          accumulatorBits -= bitLength;
        }
      }
    }

    if (accumulatorBits > 0) {
      const paddingBits = bitLength - accumulatorBits;
      const index = Number(accumulator << BigInt(paddingBits));
      
      if (this.usePowerOfTwo) {
        resultParts.push(dduChar[index]);
      } else {
        resultParts.push(dduChar[Math.floor(index / dduLength)] + dduChar[index % dduLength]);
      }
      return resultParts.join("") + this.paddingChar + paddingBits.toString();
    }

    return resultParts.join("");
  }

  private decodeBigInt(input: string): Buffer {
    const { cleanedInput, paddingBits } = this.parsePaddingAndGetInput(input);
    const buffer: number[] = [];
    
    let accumulator = 0n;
    let accumulatorBits = 0;
    
    const { effectiveBitLength: bitLength, dduBinaryLookup: lookup } = this;
    const bigBitLength = BigInt(bitLength);
    const dduLength = this.dduChar.length;
    const chunkSize = this.usePowerOfTwo ? this.charLength : this.charLength * 2;

    if (this.usePowerOfTwo) {
      for (let i = 0; i < cleanedInput.length; i += chunkSize) {
        const chunk = cleanedInput.slice(i, i + this.charLength);
        const val = lookup.get(chunk);
        if (val === undefined) throw new Error(`[Ddu64 decode] Invalid character "${chunk}" at ${i}`);

        accumulator = (accumulator << bigBitLength) | BigInt(val);
        accumulatorBits += bitLength;

        if (i + chunkSize >= cleanedInput.length && paddingBits > 0) {
          accumulator >>= BigInt(paddingBits);
          accumulatorBits -= paddingBits;
        }

        while (accumulatorBits >= 8) {
          const shift = accumulatorBits - 8;
          buffer.push(Number((accumulator >> BigInt(shift)) & 0xFFn));
          accumulator &= ((1n << BigInt(shift)) - 1n);
          accumulatorBits -= 8;
        }
      }
    } else {
      for (let i = 0; i < cleanedInput.length; i += chunkSize) {
        const c1 = cleanedInput.slice(i, i + this.charLength);
        const c2 = cleanedInput.slice(i + this.charLength, i + chunkSize);
        const v1 = lookup.get(c1);
        const v2 = lookup.get(c2);
        
        if (v1 === undefined) throw new Error(`[Ddu64 decode] Invalid character "${c1}" at ${i}`);
        if (v2 === undefined) throw new Error(`[Ddu64 decode] Invalid character "${c2}" at ${i + this.charLength}`);
        
        const value = v1 * dduLength + v2;
        if (value >= this.maxBinaryValue) throw new Error(`[Ddu64 decode] Value ${value} exceeds range`);

        accumulator = (accumulator << bigBitLength) | BigInt(value);
        accumulatorBits += bitLength;

        if (i + chunkSize >= cleanedInput.length && paddingBits > 0) {
          accumulator >>= BigInt(paddingBits);
          accumulatorBits -= paddingBits;
        }

        while (accumulatorBits >= 8) {
          const shift = accumulatorBits - 8;
          buffer.push(Number((accumulator >> BigInt(shift)) & 0xFFn));
          accumulator &= ((1n << BigInt(shift)) - 1n);
          accumulatorBits -= 8;
        }
      }
    }

    return Buffer.from(buffer);
  }

  // =========================================================================================
  // Internal Helpers (Normalization & Validation)
  // =========================================================================================

  private parsePaddingAndGetInput(input: string): { cleanedInput: string, paddingBits: number } {
    const padLen = this.paddingChar.length;
    if (input.length < padLen) return { cleanedInput: input, paddingBits: 0 };

    const padIdx = input.lastIndexOf(this.paddingChar);
    // 패딩 문자가 존재하고, 위치가 올바른지(chunk 단위) 확인
    if (padIdx >= 0 && padIdx % this.charLength === 0 && padIdx + padLen <= input.length) {
      const paddingSection = input.slice(padIdx + padLen);
      if (!paddingSection) throw new Error(`[Ddu64 decode] Invalid padding format. Missing padding length`);
      
      const paddingBits = parseInt(paddingSection, 10);
      if (isNaN(paddingBits) || paddingSection !== paddingBits.toString() || paddingBits < 0 || paddingBits >= this.effectiveBitLength) {
        throw new Error(`[Ddu64 decode] Invalid padding format. Got: "${paddingSection}"`);
      }
      return { cleanedInput: input.substring(0, padIdx), paddingBits };
    }
    
    return { cleanedInput: input, paddingBits: 0 };
  }

  /**
   * 입력된 CharSet을 검증하고 정리(Normalization)합니다.
   * 문제가 발생하면 옵션에 따라 Error를 던지거나 Fallback CharSet을 반환합니다.
   */
  private normalizeCharSet(
    current: { charSet: string[]; padding: string; requiredLength: number; bitLength: number; isPredefined: boolean },
    shouldThrow: boolean,
    dduOptions?: DduConstructorOptions
  ): { charSet: string[]; padding: string; charLength: number; isPredefined: boolean } {
    let state = { ...current };

    // 재시도 루프 (Fallback 로직 포함)
    while (true) {
      try {
        // 1. 중복 제거
        const uniqueChars = Array.from(new Set(state.charSet));
        if (uniqueChars.length !== state.charSet.length) {
          if (shouldThrow) {
            const duplicates = state.charSet.filter((c, i) => state.charSet.indexOf(c) !== i);
            throw new Error(`[Ddu64 normalizeCharSet] Character set contains duplicate characters: [${[...new Set(duplicates)].join(", ")}]`);
          }
          state.charSet = uniqueChars;
          if (!state.isPredefined) state.requiredLength = state.charSet.length;
        }

        // 2. 기본 조건 검사
        if (state.charSet.length < state.requiredLength) throw new Error(`[Ddu64 normalizeCharSet] Insufficient characters. Required: ${state.requiredLength}, Has: ${state.charSet.length}`);
        if (state.requiredLength < 2) throw new Error(`[Ddu64 normalizeCharSet] At least 2 unique characters required.`);
        if (state.charSet.length === 0) throw new Error(`[Ddu64 normalizeCharSet] Empty charset.`);

        // 3. 문자 길이 일관성 검사
        const charLength = state.charSet[0].length;
        const invalidChar = state.charSet.find(c => c.length !== charLength);
        if (invalidChar) {
          if (shouldThrow) throw new Error(`[Ddu64 normalizeCharSet] Inconsistent char length. Expected ${charLength}, found "${invalidChar}" (${invalidChar.length})`);
          // 필터링 후 재검증을 위해 예외 발생시켜 Fallback 또는 재시도 유도
          throw new Error("Filtered inconsistent chars (internal retry)");
        }

        // 4. 패딩 충돌 검사
        if (state.padding.length !== charLength) throw new Error(`[Ddu64 normalizeCharSet] Padding length mismatch. Expected ${charLength}, got ${state.padding.length}`);
        if (state.charSet.includes(state.padding)) {
          if (shouldThrow) throw new Error(`[Ddu64 normalizeCharSet] Padding character "${state.padding}" conflicts with charset.`);
          state.charSet = state.charSet.filter(c => c !== state.padding);
        }

        return {
          charSet: state.charSet.slice(0, state.requiredLength),
          padding: state.padding,
          charLength,
          isPredefined: state.isPredefined,
        };

      } catch (e: any) {
        // 사용자가 명시적으로 에러를 요청했거나, 복구 불가능한 에러인 경우
        if (shouldThrow && !e.message.includes("internal retry")) throw e;
        // 그 외에는 Fallback CharSet 사용
        state = this.getFallbackCharSet(dduOptions);
      }
    }
  }

  private resolveInitialCharSet(
    dduChar: string[] | string | undefined,
    paddingChar: string | undefined,
    dduOptions: DduConstructorOptions | undefined,
    shouldThrow: boolean
  ) {
    // 내부 헬퍼: 길이와 옵션에 따라 최종 메타데이터 생성
    const buildMeta = (set: string[], padding: string, length: number, isPredefined: boolean) => {
      const usePow2 = this.shouldUsePowerOfTwo(length, dduOptions?.usePowerOfTwo);
      if (usePow2 && length > 0) {
        const exponent = this.getLargestPowerOfTwoExponent(length);
        const pow2Length = 1 << exponent;
        return { charSet: set.slice(0, pow2Length), padding, requiredLength: pow2Length, bitLength: exponent, isPredefined };
      }
      return { charSet: set.slice(0, length), padding, requiredLength: length, bitLength: length > 0 ? this.getBitLength(length) : 0, isPredefined };
    };

    try {
      const finalDduChar = dduChar ?? dduOptions?.dduChar;
      const finalPadding = paddingChar ?? dduOptions?.paddingChar;

      // Case A: 사용자 제공 CharSet
      if (finalDduChar) {
        if (!finalPadding) throw new Error(`[Ddu64 Constructor] paddingChar is required when dduChar is provided.`);
        
        const arr = typeof finalDduChar === "string" ? [...finalDduChar.trim()] : [...finalDduChar];
        if (shouldThrow) {
            const uniqueSize = new Set(arr).size;
            if (uniqueSize !== arr.length) {
              const duplicates = arr.filter((c, i) => arr.indexOf(c) !== i);
              throw new Error(`[Ddu64 Constructor] Character set contains duplicate characters: [${[...new Set(duplicates)].join(", ")}]`);
            }
        }
        
        const reqLen = dduOptions?.requiredLength ?? arr.length;
        if (arr.length < reqLen) throw new Error(`[Ddu64 Constructor] Insufficient characters.`);
        
        return buildMeta(arr, finalPadding, reqLen, false);
      }

      // Case B: 심볼(Enum)로 지정된 CharSet
      const symbol = dduOptions?.dduSetSymbol ?? dduDefaultConstructorOptions.dduSetSymbol ?? DduSetSymbol.DDU;
      const cs = this.getCharSetOrThrow(symbol);
      return buildMeta(cs.charSet, cs.paddingChar, cs.maxRequiredLength, true);

    } catch (error) {
      if (shouldThrow) throw error;
      return this.getFallbackCharSet(dduOptions);
    }
  }

  private getFallbackCharSet(dduOptions?: DduConstructorOptions) {
    const symbol = dduOptions?.dduSetSymbol ?? dduDefaultConstructorOptions.dduSetSymbol ?? DduSetSymbol.ONECHARSET;
    const cs = getCharSet(symbol) ?? getCharSet(DduSetSymbol.ONECHARSET);
    if (!cs) throw new Error(`Critical: No fallback CharSet available`);
    return { charSet: cs.charSet, padding: cs.paddingChar, requiredLength: cs.maxRequiredLength, bitLength: cs.bitLength, isPredefined: true };
  }

  private shouldUsePowerOfTwo(length: number, preference?: boolean): boolean {
    if (preference !== undefined) return preference ? length > 0 : false;
    return length > 0 && (length & (length - 1)) === 0;
  }

  private getCharSetOrThrow(symbol: DduSetSymbol) {
    const cs = getCharSet(symbol);
    if (!cs) throw new Error(`CharSet with symbol ${symbol} not found`);
    return cs;
  }

  private validateCombinationDuplicates(charSet: string[], paddingChar: string, requiredLength: number): void {
    // 작은 크기의 단일 문자 집합에 대해서만 '조합 충돌' 검사를 수행 (안전장치)
    if (charSet[0].length !== 1 || requiredLength > 256) return;

    const limit = Math.min(charSet.length, requiredLength);
    const targetChars = charSet.slice(0, limit);
    const combinations = new Set<string>();
    
    const add = (s: string, context: string) => {
      if (combinations.has(s)) throw new Error(`Combination conflict: ${context}`);
      combinations.add(s);
    };

    targetChars.forEach(c => combinations.add(c));
    combinations.add(paddingChar);

    for (const c1 of targetChars) {
      for (const c2 of targetChars) add(c1 + c2, `"${c1}" + "${c2}"`);
      add(c1 + paddingChar, `"${c1}" + padding`);
      add(paddingChar + c1, `padding + "${c1}"`);
    }
    add(paddingChar + paddingChar, "double padding");
  }
}
