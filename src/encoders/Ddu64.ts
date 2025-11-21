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

  constructor(dduChar?: string[] | string, paddingChar?: string, dduOptions?: DduConstructorOptions) {
    super();

    const shouldThrowError = dduOptions?.useBuildErrorReturn ?? false;
    
    // 1. 초기 CharSet 해석
    const initial = this.resolveInitialCharSet(dduChar, paddingChar, dduOptions, shouldThrowError);

    // 2. 정규화 및 검증 (재시도 로직 포함)
    const normalized = this.normalizeCharSet(initial, shouldThrowError, dduOptions);
    
    this.dduChar = normalized.charSet;
    this.paddingChar = normalized.padding;
    this.charLength = normalized.charLength;
    this.isPredefinedCharSet = normalized.isPredefined;
    this.encoding = dduOptions?.encoding ?? this.defaultEncoding;

    // 3. 비트 길이 및 내부 상수 계산
    const dduLength = this.dduChar.length;
    this.usePowerOfTwo = dduLength > 0 && (dduLength & (dduLength - 1)) === 0;
    
    const computedBitLength = this.getBitLength(dduLength);
    this.bitLength = this.usePowerOfTwo ? this.getLargestPowerOfTwoExponent(dduLength) : computedBitLength;
    this.effectiveBitLength = this.usePowerOfTwo ? this.bitLength : computedBitLength;
    this.maxBinaryValue = 2 ** this.effectiveBitLength;
    
    // 4. Lookup Table 초기화
    for (let i = 0; i < dduLength; i++) {
      this.dduBinaryLookup.set(this.dduChar[i], i);
    }

    // 5. 조합 중복 검사 (조건부)
    if (this.charLength === 1 && !this.isPredefinedCharSet) {
      this.validateCombinationDuplicates(this.dduChar, this.paddingChar, dduLength);
    }
  }

  private normalizeCharSet(
    current: { charSet: string[]; padding: string; requiredLength: number; bitLength: number; isPredefined: boolean },
    shouldThrowError: boolean,
    dduOptions?: DduConstructorOptions
  ): { charSet: string[]; padding: string; charLength: number; isPredefined: boolean } {
    let state = { ...current };

    while (true) {
      try {
        const uniqueChars = Array.from(new Set(state.charSet));
        if (uniqueChars.length !== state.charSet.length) {
          const duplicates = state.charSet.filter((c, i) => state.charSet.indexOf(c) !== i);
          if (shouldThrowError) {
            throw new Error(`[Ddu64 normalizeCharSet] Character set contains duplicate characters. Total: ${state.charSet.length}, Unique: ${uniqueChars.length}, Duplicates: [${[...new Set(duplicates)].join(", ")}]`);
          }
          state.charSet = uniqueChars;
          if (!state.isPredefined) state.requiredLength = state.charSet.length;
        }

        const check = (condition: boolean, msg: string) => {
          if (condition) throw new Error(`[Ddu64 normalizeCharSet] ${msg}`);
        };

        check(state.charSet.length < state.requiredLength, 
          `Insufficient characters. Required: ${state.requiredLength}, Provided: ${state.charSet.length}`);
        check(state.requiredLength < 2, 
          `At least 2 unique characters are required. Provided: ${state.requiredLength}`);
        check(state.bitLength <= 0, 
          `Invalid bit length (${state.bitLength}) for charset size ${state.requiredLength}`);
        check(state.charSet.length === 0, 
          `Empty charset. Required: ${state.requiredLength} characters`);

        // 문자 길이 일관성 체크
        let charLength = state.charSet[0].length;
        const invalidIdx = state.charSet.findIndex(c => c.length !== charLength);
        
        if (invalidIdx !== -1) {
          if (shouldThrowError) {
            throw new Error(`[Ddu64 normalizeCharSet] Inconsistent character length. Expected: ${charLength}, but character at index ${invalidIdx} ("${state.charSet[invalidIdx]}") has length ${state.charSet[invalidIdx].length}`);
          }
          state.charSet = state.charSet.filter(c => c.length === charLength);
          // 필터링 후 재검증을 위해 에러 throw
          check(true, "Filtered inconsistent length chars"); 
        }

        check(state.padding.length !== charLength, 
          `Padding character length mismatch. Expected: ${charLength}, Got: ${state.padding.length} (padding: "${state.padding}")`);

        if (state.charSet.includes(state.padding)) {
          if (shouldThrowError) {
            throw new Error(`[Ddu64 normalizeCharSet] Padding character "${state.padding}" conflicts with charset. Padding must not be in the character set.`);
          }
          state.charSet = state.charSet.filter(c => c !== state.padding);
          check(true, "Removed padding conflict");
        }

        return {
          charSet: state.charSet.slice(0, state.requiredLength),
          padding: state.padding,
          charLength,
          isPredefined: state.isPredefined,
        };

      } catch (e: any) {
        if (shouldThrowError && !e.message.includes("Filtered") && !e.message.includes("Removed")) {
          throw e;
        }
        // Fallback 적용
        state = this.getFallbackCharSet(dduOptions);
      }
    }
  }

  private resolveInitialCharSet(
    dduChar: string[] | string | undefined,
    paddingChar: string | undefined,
    dduOptions: DduConstructorOptions | undefined,
    shouldThrowError: boolean
  ) {
    const finalize = (set: string[], padding: string, length: number, predefined = false) => {
      const usePow2 = this.shouldUsePowerOfTwo(length, dduOptions?.usePowerOfTwo);
      if (usePow2 && length > 0) {
        const exponent = this.getLargestPowerOfTwoExponent(length);
        const pow2Length = 1 << exponent;
        return { charSet: set.slice(0, pow2Length), padding, requiredLength: pow2Length, bitLength: exponent, isPredefined: predefined };
      }
      return { charSet: set.slice(0, length), padding, requiredLength: length, bitLength: length > 0 ? this.getBitLength(length) : 0, isPredefined: predefined };
    };

    try {
      const finalDduChar = dduChar ?? dduOptions?.dduChar;
      const finalPadding = paddingChar ?? dduOptions?.paddingChar;

      if (finalDduChar) {
        if (!finalPadding) throw new Error(`[Ddu64 Constructor] paddingChar is required when dduChar is provided.`);
        
        const arr = typeof finalDduChar === "string" ? [...finalDduChar.trim()] : [...finalDduChar];
        if (shouldThrowError) {
          const unique = new Set(arr);
          if (unique.size !== arr.length) {
            const duplicates = arr.filter((c, i) => arr.indexOf(c) !== i);
            throw new Error(`[Ddu64 Constructor] Character set contains duplicate characters. Duplicates: [${[...new Set(duplicates)].join(", ")}]`);
          }
        }
        
        const len = dduOptions?.requiredLength ?? arr.length;
        if (arr.length < len) throw new Error(`[Ddu64 Constructor] Insufficient characters in charset.`);
        
        return finalize(arr, finalPadding, len, false);
      }

      if (dduOptions?.dduSetSymbol) {
        const cs = this.getCharSetOrThrow(dduOptions.dduSetSymbol);
        return finalize(cs.charSet, cs.paddingChar, cs.maxRequiredLength, true);
      }

      const defaultSymbol = dduDefaultConstructorOptions.dduSetSymbol ?? DduSetSymbol.DDU;
      const cs = this.getCharSetOrThrow(defaultSymbol);
      return finalize(cs.charSet, cs.paddingChar, cs.maxRequiredLength, true);

    } catch (error) {
      if (shouldThrowError) throw error;
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
    // 단일 문자 집합이면서 비교적 작은 경우(<=256)에만 충돌 검사
    if (charSet[0].length !== 1 || requiredLength > 256) return;

    const limit = Math.min(charSet.length, requiredLength);
    const targetChars = charSet.slice(0, limit);
    const combinations = new Set<string>();
    
    // 조합 생성 및 검사
    const addOrThrow = (s: string, msg: string) => {
      if (combinations.has(s)) throw new Error(`Combination conflict: ${msg}`);
      combinations.add(s);
    };

    // 1. 기본 문자 및 패딩 등록
    targetChars.forEach(c => combinations.add(c));
    combinations.add(paddingChar);

    // 2. 조합 검사
    for (const c1 of targetChars) {
      for (const c2 of targetChars) {
        addOrThrow(c1 + c2, `"${c1}" + "${c2}" already exists`);
      }
      addOrThrow(c1 + paddingChar, `"${c1}" + padding`);
      addOrThrow(paddingChar + c1, `padding + "${c1}"`);
    }
    addOrThrow(paddingChar + paddingChar, "double padding");
  }

  encode(input: Buffer | string, _options?: DduOptions): string {
    const bufferInput = typeof input === "string" ? Buffer.from(input, this.encoding) : input;
    
    if (this.effectiveBitLength <= 24) {
      return this.encodeFast(bufferInput);
    }
    return this.encodeBigInt(bufferInput);
  }

  private encodeFast(bufferInput: Buffer): string {
    const resultParts: string[] = [];
    const dduChar = this.dduChar;
    const dduLength = dduChar.length;
    const bitLength = this.effectiveBitLength;
    
    let accumulator = 0;
    let accumulatorBits = 0;

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
                
                const div = (index / dduLength) | 0;
                const mod = index % dduLength;
                resultParts.push(dduChar[div] + dduChar[mod]);

                accumulatorBits -= bitLength;
                accumulator &= (1 << accumulatorBits) - 1;
            }
        }
    }

    let paddingStr = "";
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
        
        paddingStr = this.paddingChar + paddingBits.toString();
    }

    return resultParts.join("") + paddingStr;
  }

  private encodeBigInt(bufferInput: Buffer): string {
    const resultParts: string[] = [];
    const dduChar = this.dduChar;
    const bitLength = this.effectiveBitLength;
    
    let accumulator = 0n;
    let accumulatorBits = 0;

    if (this.usePowerOfTwo) {
        for (const byte of bufferInput) {
            accumulator = (accumulator << 8n) | BigInt(byte);
            accumulatorBits += 8;

            while (accumulatorBits >= bitLength) {
                const shift = accumulatorBits - bitLength;
                const value = accumulator >> BigInt(shift);
                const index = Number(value);
                
                accumulator = accumulator & ((1n << BigInt(shift)) - 1n);
                accumulatorBits -= bitLength;

                resultParts.push(dduChar[index]);
            }
        }
    } else {
        const dduLen = dduChar.length;
        for (const byte of bufferInput) {
            accumulator = (accumulator << 8n) | BigInt(byte);
            accumulatorBits += 8;

            while (accumulatorBits >= bitLength) {
                const shift = accumulatorBits - bitLength;
                const value = accumulator >> BigInt(shift);
                const index = Number(value);
                
                accumulator = accumulator & ((1n << BigInt(shift)) - 1n);
                accumulatorBits -= bitLength;

                resultParts.push(dduChar[Math.floor(index / dduLen)] + dduChar[index % dduLen]);
            }
        }
    }

    let paddingStr = "";
    if (accumulatorBits > 0) {
      const paddingBits = bitLength - accumulatorBits;
      const index = Number(accumulator << BigInt(paddingBits));
      
      if (this.usePowerOfTwo) {
        resultParts.push(dduChar[index]);
      } else {
        const dduLen = dduChar.length;
        resultParts.push(dduChar[Math.floor(index / dduLen)] + dduChar[index % dduLen]);
      }
      
      paddingStr = this.paddingChar + paddingBits.toString();
    }

    return resultParts.join("") + paddingStr;
  }

  decodeToBuffer(input: string, _options?: DduOptions): Buffer {
    if (this.effectiveBitLength <= 24) {
      return this.decodeFast(input);
    }
    return this.decodeBigInt(input);
  }

  private decodeFast(input: string): Buffer {
    const { cleanedInput, paddingBits } = this.parsePaddingAndGetInput(input);
    const inputLen = cleanedInput.length;
    const buffer: number[] = [];
    
    let accumulator = 0;
    let accumulatorBits = 0;
    const bitLength = this.effectiveBitLength;
    const dduLength = this.dduChar.length;
    const maxBinaryValue = this.maxBinaryValue;
    const lookup = this.dduBinaryLookup;
    const charLength = this.charLength;

    if (this.usePowerOfTwo) {
        const chunkSize = charLength;
        for (let i = 0; i < inputLen; i += chunkSize) {
            const chunk = cleanedInput.slice(i, i + charLength);
            const val = lookup.get(chunk);
            if (val === undefined) {
                throw new Error(`[Ddu64 decode] Invalid character "${chunk}" at ${i}`);
            }
            
            if (val >= maxBinaryValue) {
                 throw new Error(`[Ddu64 decode] Value ${val} exceeds range`);
            }

            accumulator = (accumulator << bitLength) | val;
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
            
            if (value >= maxBinaryValue) {
                throw new Error(`[Ddu64 decode] Value ${value} exceeds range`);
            }

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

  private decodeBigInt(input: string): Buffer {
    const { cleanedInput, paddingBits } = this.parsePaddingAndGetInput(input);
    const inputLen = cleanedInput.length;
    const buffer: number[] = [];
    
    let accumulator = 0n;
    let accumulatorBits = 0;
    const bitLength = this.effectiveBitLength;
    const bigBitLength = BigInt(bitLength);
    
    const chunkSize = this.usePowerOfTwo ? this.charLength : this.charLength * 2;
    const dduLength = this.dduChar.length;
    const maxBinaryValue = this.maxBinaryValue;
    const lookup = this.dduBinaryLookup;

    if (this.usePowerOfTwo) {
        for (let i = 0; i < inputLen; i += chunkSize) {
            const chunk = cleanedInput.slice(i, i + this.charLength);
            const val = lookup.get(chunk);
            if (val === undefined) {
                throw new Error(`[Ddu64 decode] Invalid character "${chunk}" at ${i}`);
            }
            const value = val;

            accumulator = (accumulator << bigBitLength) | BigInt(value);
            accumulatorBits += bitLength;

            const isLastChunk = (i + chunkSize >= inputLen);
            if (isLastChunk && paddingBits > 0) {
                accumulator = accumulator >> BigInt(paddingBits);
                accumulatorBits -= paddingBits;
            }

            while (accumulatorBits >= 8) {
                const shift = accumulatorBits - 8;
                const byte = Number((accumulator >> BigInt(shift)) & 0xFFn);
                buffer.push(byte);
                accumulator = accumulator & ((1n << BigInt(shift)) - 1n);
                accumulatorBits -= 8;
            }
        }
    } else {
        for (let i = 0; i < inputLen; i += chunkSize) {
            const c1 = cleanedInput.slice(i, i + this.charLength);
            const c2 = cleanedInput.slice(i + this.charLength, i + chunkSize);
            const v1 = lookup.get(c1);
            const v2 = lookup.get(c2);
            
            if (v1 === undefined) throw new Error(`[Ddu64 decode] Invalid character "${c1}" at ${i}`);
            if (v2 === undefined) throw new Error(`[Ddu64 decode] Invalid character "${c2}" at ${i + this.charLength}`);
            
            const value = v1 * dduLength + v2;
            if (value >= maxBinaryValue) throw new Error(`[Ddu64 decode] Value ${value} exceeds range`);

            accumulator = (accumulator << bigBitLength) | BigInt(value);
            accumulatorBits += bitLength;

            const isLastChunk = (i + chunkSize >= inputLen);
            if (isLastChunk && paddingBits > 0) {
                accumulator = accumulator >> BigInt(paddingBits);
                accumulatorBits -= paddingBits;
            }

            while (accumulatorBits >= 8) {
                const shift = accumulatorBits - 8;
                const byte = Number((accumulator >> BigInt(shift)) & 0xFFn);
                buffer.push(byte);
                accumulator = accumulator & ((1n << BigInt(shift)) - 1n);
                accumulatorBits -= 8;
            }
        }
    }

    return Buffer.from(buffer);
  }

  decode(input: string, _options?: DduOptions): string {
    return this.decodeToBuffer(input, _options).toString(this.encoding);
  }

  private parsePaddingAndGetInput(input: string): { cleanedInput: string, paddingBits: number } {
    let paddingBits = 0;
    const padLen = this.paddingChar.length;

    if (input.length >= padLen) {
      const padIdx = input.lastIndexOf(this.paddingChar);
      if (padIdx >= 0 && padIdx % this.charLength === 0 && padIdx + padLen <= input.length) {
        const paddingSection = input.slice(padIdx + padLen);
        if (paddingSection.length === 0) throw new Error(`[Ddu64 decode] Invalid padding format. Missing padding length`);
        
        paddingBits = parseInt(paddingSection, 10);
        if (isNaN(paddingBits) || paddingSection !== paddingBits.toString() || paddingBits < 0 || paddingBits >= this.effectiveBitLength) {
          throw new Error(`[Ddu64 decode] Invalid padding format. Got: "${paddingSection}"`);
        }
        return { cleanedInput: input.substring(0, padIdx), paddingBits };
      }
    }
    return { cleanedInput: input, paddingBits };
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
}
