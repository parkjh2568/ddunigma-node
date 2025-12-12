import { deflateSync, inflateSync } from "zlib";
import { BaseDdu } from "../base/BaseDdu";
import {
  DduConstructorOptions,
  DduOptions,
  DduSetSymbol,
  dduDefaultConstructorOptions,
} from "../types";
import { getCharSet } from "../charSets";

const BYTE_BITS = 8;
const MAX_FAST_BITS = 16;
const BYTE_MASK = 0xFF;
const COMPRESS_MARKER = "ELYSIA";

export class Ddu64 extends BaseDdu {
  protected readonly dduChar: string[];
  protected readonly paddingChar: string;
  protected readonly charLength: number;
  protected readonly bitLength: number;
  protected readonly usePowerOfTwo: boolean;
  protected readonly encoding: BufferEncoding;
  protected readonly defaultCompress: boolean;

  protected readonly dduBinaryLookup: Map<string, number> = new Map();
  private readonly isPredefinedCharSet: boolean;
  private readonly effectiveBitLength: number;
  private readonly maxBinaryValue: number;
  private readonly fastAsciiLookup: Int16Array | null = null;
  private readonly useAsciiLookup: boolean = false;

  constructor(dduChar?: string[] | string, paddingChar?: string, dduOptions?: DduConstructorOptions) {
    super();
    const shouldThrow = dduOptions?.useBuildErrorReturn ?? false;

    const initial = this.resolveInitialCharSet(dduChar, paddingChar, dduOptions, shouldThrow);
    const normalized = this.normalizeCharSet(initial, shouldThrow, dduOptions);
    
    this.dduChar = normalized.charSet;
    this.paddingChar = normalized.padding;
    this.charLength = normalized.charLength;
    this.isPredefinedCharSet = normalized.isPredefined;
    this.encoding = dduOptions?.encoding ?? this.defaultEncoding;
    this.defaultCompress = dduOptions?.compress ?? false;

    const dduLength = this.dduChar.length;
    this.usePowerOfTwo = dduLength > 0 && (dduLength & (dduLength - 1)) === 0;
    
    const computedBitLength = this.getBitLength(dduLength);
    this.bitLength = this.usePowerOfTwo ? this.getLargestPowerOfTwoExponent(dduLength) : computedBitLength;
    this.effectiveBitLength = this.usePowerOfTwo ? this.bitLength : computedBitLength;
    this.maxBinaryValue = 1 << this.effectiveBitLength;
    
    if (this.charLength === 1) {
      let allAscii = true;
      for (let i = 0; i < dduLength; i++) {
        if (this.dduChar[i].charCodeAt(0) >= 128) {
          allAscii = false;
          break;
        }
      }
      
      if (allAscii) {
        this.fastAsciiLookup = new Int16Array(128).fill(-1);
        for (let i = 0; i < dduLength; i++) {
          this.fastAsciiLookup[this.dduChar[i].charCodeAt(0)] = i;
        }
        this.useAsciiLookup = true;
      }
    }

    for (let i = 0; i < dduLength; i++) {
      this.dduBinaryLookup.set(this.dduChar[i], i);
    }

    if (this.charLength === 1 && !this.isPredefinedCharSet) {
      this.validateCombinationDuplicates(this.dduChar, this.paddingChar, dduLength);
    }
  }

  /** Encode data to DDU format string. Use { compress: true } for smaller output. */
  encode(input: Buffer | string, options?: DduOptions): string {
    const shouldCompress = options?.compress ?? this.defaultCompress;
    const originalBuffer = typeof input === "string" ? Buffer.from(input, this.encoding) : input;
    
    if (!shouldCompress) {
      return this.effectiveBitLength <= MAX_FAST_BITS
        ? this.encodeFast(originalBuffer, false)
        : this.encodeBigInt(originalBuffer, false);
    }
    
    // 압축 시도: 버퍼 크기로 먼저 비교 (인코딩 전 조기 판단)
    const compressedBuffer = deflateSync(originalBuffer, { level: 9 });
    
    // 압축된 버퍼가 원본보다 크거나 같으면 비압축 인코딩만 수행
    if (compressedBuffer.length >= originalBuffer.length) {
      return this.effectiveBitLength <= MAX_FAST_BITS
        ? this.encodeFast(originalBuffer, false)
        : this.encodeBigInt(originalBuffer, false);
    }
    
    // 압축된 버퍼가 더 작으면 압축 인코딩만 수행
    return this.effectiveBitLength <= MAX_FAST_BITS
      ? this.encodeFast(compressedBuffer, true)
      : this.encodeBigInt(compressedBuffer, true);
  }

  /** Decode DDU format string to Buffer. */
  decodeToBuffer(input: string, _options?: DduOptions): Buffer {
    const { isCompressed, cleanedInput } = this.parseCompressMarker(input);
    
    const decoded = this.effectiveBitLength <= MAX_FAST_BITS
      ? this.decodeFast(cleanedInput)
      : this.decodeBigInt(cleanedInput);
    
    if (isCompressed) {
      return inflateSync(decoded);
    }
    return decoded;
  }

  /** Decode DDU format string to string. */
  decode(input: string, options?: DduOptions): string {
    return this.decodeToBuffer(input, options).toString(this.encoding);
  }

  /** Get charset configuration info. */
  getCharSetInfo() {
    return {
      charSet: [...this.dduChar],
      paddingChar: this.paddingChar,
      charLength: this.charLength,
      bitLength: this.bitLength,
      usePowerOfTwo: this.usePowerOfTwo,
      encoding: this.encoding,
      defaultCompress: this.defaultCompress,
    };
  }

  private parseCompressMarker(input: string): { isCompressed: boolean, cleanedInput: string } {
    const padIdx = input.lastIndexOf(this.paddingChar);
    if (padIdx < 0) return { isCompressed: false, cleanedInput: input };
    
    const paddingSection = input.slice(padIdx + this.paddingChar.length);
    if (paddingSection.startsWith(COMPRESS_MARKER)) {
      const newPadding = paddingSection.slice(COMPRESS_MARKER.length);
      return {
        isCompressed: true,
        cleanedInput: input.substring(0, padIdx) + this.paddingChar + newPadding,
      };
    }
    
    return { isCompressed: false, cleanedInput: input };
  }

  private encodeFast(bufferInput: Buffer, compress?: boolean): string {
    const inputLen = bufferInput.length;
    if (inputLen === 0) return "";

    const { dduChar, effectiveBitLength: bitLength, paddingChar } = this;
    const dduLength = dduChar.length;
    
    const totalBits = inputLen * BYTE_BITS;
    const estimatedChunks = Math.ceil(totalBits / bitLength);
    const resultParts: string[] = new Array(estimatedChunks + 3);
    let resultIdx = 0;
    
    let accumulator = 0;
    let accumulatorBits = 0;

    if (this.usePowerOfTwo) {
      const mask = (1 << bitLength) - 1;
      for (let i = 0; i < inputLen; i++) {
        accumulator = (accumulator << BYTE_BITS) | bufferInput[i];
        accumulatorBits += BYTE_BITS;

        while (accumulatorBits >= bitLength) {
          accumulatorBits -= bitLength;
          resultParts[resultIdx++] = dduChar[(accumulator >> accumulatorBits) & mask];
          accumulator &= (1 << accumulatorBits) - 1;
        }
      }
    } else {
      for (let i = 0; i < inputLen; i++) {
        accumulator = (accumulator << BYTE_BITS) | bufferInput[i];
        accumulatorBits += BYTE_BITS;

        while (accumulatorBits >= bitLength) {
          accumulatorBits -= bitLength;
          const index = accumulator >> accumulatorBits;
          const div = (index / dduLength) | 0;
          resultParts[resultIdx++] = dduChar[div];
          resultParts[resultIdx++] = dduChar[index - div * dduLength];
          accumulator &= (1 << accumulatorBits) - 1;
        }
      }
    }

    if (accumulatorBits > 0) {
      const paddingBits = bitLength - accumulatorBits;
      const index = accumulator << paddingBits;
      
      if (this.usePowerOfTwo) {
        resultParts[resultIdx++] = dduChar[index];
      } else {
        const div = (index / dduLength) | 0;
        resultParts[resultIdx++] = dduChar[div];
        resultParts[resultIdx++] = dduChar[index - div * dduLength];
      }
      resultParts[resultIdx++] = paddingChar;
      resultParts[resultIdx++] = compress ? COMPRESS_MARKER + paddingBits.toString() : paddingBits.toString();
    } else if (compress) {
      resultParts[resultIdx++] = paddingChar;
      resultParts[resultIdx++] = COMPRESS_MARKER + "0";
    }

    resultParts.length = resultIdx;
    return resultParts.join("");
  }

  private decodeFast(input: string): Buffer {
    const { cleanedInput, paddingBits } = this.parsePaddingAndGetInput(input);
    const inputLen = cleanedInput.length;
    
    if (inputLen === 0) return Buffer.alloc(0);

    const { effectiveBitLength: bitLength, charLength } = this;
    const dduLength = this.dduChar.length;
    const chunkSize = this.usePowerOfTwo ? charLength : charLength * 2;
    
    const numChunks = Math.ceil(inputLen / chunkSize);
    const estimatedBytes = Math.ceil((numChunks * bitLength - paddingBits) / BYTE_BITS);
    const buffer = new Uint8Array(estimatedBytes + 1);
    let bufIdx = 0;
    
    let accumulator = 0;
    let accumulatorBits = 0;

    if (this.usePowerOfTwo) {
      if (this.useAsciiLookup && this.fastAsciiLookup) {
        const lookup = this.fastAsciiLookup;
        for (let i = 0; i < inputLen; i += chunkSize) {
          const code = cleanedInput.charCodeAt(i);
          const val = code < 128 ? lookup[code] : -1;
          
          if (val < 0) {
            throw new Error(`[Ddu64 decode] Invalid character "${cleanedInput[i]}" at ${i}`);
          }

          accumulator = (accumulator << bitLength) | val;
          accumulatorBits += bitLength;

          if (i + chunkSize >= inputLen && paddingBits > 0) {
            accumulator >>= paddingBits;
            accumulatorBits -= paddingBits;
          }

          while (accumulatorBits >= BYTE_BITS) {
            accumulatorBits -= BYTE_BITS;
            buffer[bufIdx++] = (accumulator >> accumulatorBits) & BYTE_MASK;
            accumulator &= (1 << accumulatorBits) - 1;
          }
        }
      } else {
        const lookup = this.dduBinaryLookup;
        for (let i = 0; i < inputLen; i += chunkSize) {
          const chunk = cleanedInput.slice(i, i + charLength);
          const val = lookup.get(chunk);
          
          if (val === undefined) {
            throw new Error(`[Ddu64 decode] Invalid character "${chunk}" at ${i}`);
          }

          accumulator = (accumulator << bitLength) | val;
          accumulatorBits += bitLength;

          if (i + chunkSize >= inputLen && paddingBits > 0) {
            accumulator >>= paddingBits;
            accumulatorBits -= paddingBits;
          }

          while (accumulatorBits >= BYTE_BITS) {
            accumulatorBits -= BYTE_BITS;
            buffer[bufIdx++] = (accumulator >> accumulatorBits) & BYTE_MASK;
            accumulator &= (1 << accumulatorBits) - 1;
          }
        }
      }
    } else {
      const lookup = this.dduBinaryLookup;
      for (let i = 0; i < inputLen; i += chunkSize) {
        const c1 = cleanedInput.slice(i, i + charLength);
        const c2 = cleanedInput.slice(i + charLength, i + chunkSize);
        const v1 = lookup.get(c1);
        const v2 = lookup.get(c2);
        
        if (v1 === undefined) {
          throw new Error(`[Ddu64 decode] Invalid character "${c1}" at ${i}`);
        }
        if (v2 === undefined) {
          throw new Error(`[Ddu64 decode] Invalid character "${c2}" at ${i + charLength}`);
        }
        
        const value = v1 * dduLength + v2;
        if (value >= this.maxBinaryValue) {
          throw new Error(`[Ddu64 decode] Value ${value} exceeds range`);
        }

        accumulator = (accumulator << bitLength) | value;
        accumulatorBits += bitLength;

        if (i + chunkSize >= inputLen && paddingBits > 0) {
          accumulator >>= paddingBits;
          accumulatorBits -= paddingBits;
        }

        while (accumulatorBits >= BYTE_BITS) {
          accumulatorBits -= BYTE_BITS;
          buffer[bufIdx++] = (accumulator >> accumulatorBits) & BYTE_MASK;
          accumulator &= (1 << accumulatorBits) - 1;
        }
      }
    }

    return Buffer.from(buffer.subarray(0, bufIdx));
  }

  private encodeBigInt(bufferInput: Buffer, compress?: boolean): string {
    const inputLen = bufferInput.length;
    if (inputLen === 0) return "";

    const { dduChar, effectiveBitLength: bitLength } = this;
    const dduLength = dduChar.length;
    
    const estimatedChunks = Math.ceil((inputLen * BYTE_BITS) / bitLength);
    const resultParts: string[] = new Array(estimatedChunks + 3);
    let resultIdx = 0;
    
    let accumulator = 0n;
    let accumulatorBits = 0;

    if (this.usePowerOfTwo) {
      for (let i = 0; i < inputLen; i++) {
        accumulator = (accumulator << 8n) | BigInt(bufferInput[i]);
        accumulatorBits += BYTE_BITS;

        while (accumulatorBits >= bitLength) {
          const shift = accumulatorBits - bitLength;
          resultParts[resultIdx++] = dduChar[Number(accumulator >> BigInt(shift))];
          accumulator &= ((1n << BigInt(shift)) - 1n);
          accumulatorBits -= bitLength;
        }
      }
    } else {
      for (let i = 0; i < inputLen; i++) {
        accumulator = (accumulator << 8n) | BigInt(bufferInput[i]);
        accumulatorBits += BYTE_BITS;

        while (accumulatorBits >= bitLength) {
          const shift = accumulatorBits - bitLength;
          const idx = Number(accumulator >> BigInt(shift));
          const div = Math.floor(idx / dduLength);
          resultParts[resultIdx++] = dduChar[div];
          resultParts[resultIdx++] = dduChar[idx - div * dduLength];
          accumulator &= ((1n << BigInt(shift)) - 1n);
          accumulatorBits -= bitLength;
        }
      }
    }

    if (accumulatorBits > 0) {
      const paddingBits = bitLength - accumulatorBits;
      const index = Number(accumulator << BigInt(paddingBits));
      
      if (this.usePowerOfTwo) {
        resultParts[resultIdx++] = dduChar[index];
      } else {
        const div = Math.floor(index / dduLength);
        resultParts[resultIdx++] = dduChar[div];
        resultParts[resultIdx++] = dduChar[index - div * dduLength];
      }
      resultParts[resultIdx++] = this.paddingChar;
      resultParts[resultIdx++] = compress ? COMPRESS_MARKER + paddingBits.toString() : paddingBits.toString();
    } else if (compress) {
      resultParts[resultIdx++] = this.paddingChar;
      resultParts[resultIdx++] = COMPRESS_MARKER + "0";
    }

    resultParts.length = resultIdx;
    return resultParts.join("");
  }

  private decodeBigInt(input: string): Buffer {
    const { cleanedInput, paddingBits } = this.parsePaddingAndGetInput(input);
    const inputLen = cleanedInput.length;
    
    if (inputLen === 0) return Buffer.alloc(0);
    
    const { effectiveBitLength: bitLength, dduBinaryLookup: lookup, charLength } = this;
    const bigBitLength = BigInt(bitLength);
    const dduLength = this.dduChar.length;
    const chunkSize = this.usePowerOfTwo ? charLength : charLength * 2;
    
    const numChunks = Math.ceil(inputLen / chunkSize);
    const estimatedBytes = Math.ceil((numChunks * bitLength - paddingBits) / BYTE_BITS);
    const buffer = new Uint8Array(estimatedBytes + 1);
    let bufIdx = 0;
    
    let accumulator = 0n;
    let accumulatorBits = 0;

    if (this.usePowerOfTwo) {
      for (let i = 0; i < inputLen; i += chunkSize) {
        const chunk = cleanedInput.slice(i, i + charLength);
        const val = lookup.get(chunk);
        if (val === undefined) {
          throw new Error(`[Ddu64 decode] Invalid character "${chunk}" at ${i}`);
        }

        accumulator = (accumulator << bigBitLength) | BigInt(val);
        accumulatorBits += bitLength;

        if (i + chunkSize >= inputLen && paddingBits > 0) {
          accumulator >>= BigInt(paddingBits);
          accumulatorBits -= paddingBits;
        }

        while (accumulatorBits >= BYTE_BITS) {
          const shift = accumulatorBits - BYTE_BITS;
          buffer[bufIdx++] = Number((accumulator >> BigInt(shift)) & 0xFFn);
          accumulator &= ((1n << BigInt(shift)) - 1n);
          accumulatorBits -= BYTE_BITS;
        }
      }
    } else {
      for (let i = 0; i < inputLen; i += chunkSize) {
        const c1 = cleanedInput.slice(i, i + charLength);
        const c2 = cleanedInput.slice(i + charLength, i + chunkSize);
        const v1 = lookup.get(c1);
        const v2 = lookup.get(c2);
        
        if (v1 === undefined) {
          throw new Error(`[Ddu64 decode] Invalid character "${c1}" at ${i}`);
        }
        if (v2 === undefined) {
          throw new Error(`[Ddu64 decode] Invalid character "${c2}" at ${i + charLength}`);
        }
        
        const value = v1 * dduLength + v2;
        if (value >= this.maxBinaryValue) {
          throw new Error(`[Ddu64 decode] Value ${value} exceeds range`);
        }

        accumulator = (accumulator << bigBitLength) | BigInt(value);
        accumulatorBits += bitLength;

        if (i + chunkSize >= inputLen && paddingBits > 0) {
          accumulator >>= BigInt(paddingBits);
          accumulatorBits -= paddingBits;
        }

        while (accumulatorBits >= BYTE_BITS) {
          const shift = accumulatorBits - BYTE_BITS;
          buffer[bufIdx++] = Number((accumulator >> BigInt(shift)) & 0xFFn);
          accumulator &= ((1n << BigInt(shift)) - 1n);
          accumulatorBits -= BYTE_BITS;
        }
      }
    }

    return Buffer.from(buffer.subarray(0, bufIdx));
  }

  private parsePaddingAndGetInput(input: string): { cleanedInput: string, paddingBits: number } {
    const inputLen = input.length;
    const padLen = this.paddingChar.length;
    
    if (inputLen < padLen) return { cleanedInput: input, paddingBits: 0 };

    const padIdx = input.lastIndexOf(this.paddingChar);
    if (padIdx >= 0 && padIdx % this.charLength === 0 && padIdx + padLen <= inputLen) {
      let paddingSection = input.slice(padIdx + padLen);
      if (!paddingSection) {
        throw new Error(`[Ddu64 decode] Invalid padding format. Missing padding length`);
      }
      
      if (paddingSection.startsWith(COMPRESS_MARKER)) {
        paddingSection = paddingSection.slice(COMPRESS_MARKER.length);
      }
      
      const paddingBits = parseInt(paddingSection, 10);
      if (isNaN(paddingBits) || paddingSection !== paddingBits.toString() || paddingBits < 0 || paddingBits >= this.effectiveBitLength) {
        throw new Error(`[Ddu64 decode] Invalid padding format. Got: "${paddingSection}"`);
      }
      return { cleanedInput: input.substring(0, padIdx), paddingBits };
    }
    
    return { cleanedInput: input, paddingBits: 0 };
  }

  private normalizeCharSet(
    current: { charSet: string[]; padding: string; requiredLength: number; bitLength: number; isPredefined: boolean },
    shouldThrow: boolean,
    dduOptions?: DduConstructorOptions
  ): { charSet: string[]; padding: string; charLength: number; isPredefined: boolean } {
    let state = { ...current };
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        const uniqueChars = Array.from(new Set(state.charSet));
        if (uniqueChars.length !== state.charSet.length) {
          if (shouldThrow) {
            const duplicates = state.charSet.filter((c, i) => state.charSet.indexOf(c) !== i);
            throw new Error(`[Ddu64 normalizeCharSet] Character set contains duplicate characters: [${[...new Set(duplicates)].join(", ")}]`);
          }
          state.charSet = uniqueChars;
          if (!state.isPredefined) state.requiredLength = state.charSet.length;
        }

        if (state.charSet.length < state.requiredLength) {
          throw new Error(`[Ddu64 normalizeCharSet] Insufficient characters. Required: ${state.requiredLength}, Has: ${state.charSet.length}`);
        }
        if (state.requiredLength < 2) {
          throw new Error(`[Ddu64 normalizeCharSet] At least 2 unique characters required.`);
        }
        if (state.charSet.length === 0) {
          throw new Error(`[Ddu64 normalizeCharSet] Empty charset.`);
        }

        const charLength = state.charSet[0].length;
        const invalidChar = state.charSet.find(c => c.length !== charLength);
        if (invalidChar) {
          if (shouldThrow) {
            throw new Error(`[Ddu64 normalizeCharSet] Inconsistent char length. Expected ${charLength}, found "${invalidChar}" (${invalidChar.length})`);
          }
          throw new Error("internal retry");
        }

        if (state.padding.length !== charLength) {
          throw new Error(`[Ddu64 normalizeCharSet] Padding length mismatch. Expected ${charLength}, got ${state.padding.length}`);
        }
        if (state.charSet.includes(state.padding)) {
          if (shouldThrow) {
            throw new Error(`[Ddu64 normalizeCharSet] Padding character "${state.padding}" conflicts with charset.`);
          }
          state.charSet = state.charSet.filter(c => c !== state.padding);
        }

        return {
          charSet: state.charSet.slice(0, state.requiredLength),
          padding: state.padding,
          charLength,
          isPredefined: state.isPredefined,
        };

      } catch (e: any) {
        if (shouldThrow && !e.message.includes("internal retry")) throw e;
        state = this.getFallbackCharSet(dduOptions);
        retryCount++;
      }
    }

    const fallback = this.getFallbackCharSet(dduOptions);
    return {
      charSet: fallback.charSet.slice(0, fallback.requiredLength),
      padding: fallback.padding,
      charLength: fallback.charSet[0]?.length ?? 1,
      isPredefined: true,
    };
  }

  private resolveInitialCharSet(
    dduChar: string[] | string | undefined,
    paddingChar: string | undefined,
    dduOptions: DduConstructorOptions | undefined,
    shouldThrow: boolean
  ) {
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

      if (finalDduChar) {
        if (!finalPadding) {
          throw new Error(`[Ddu64 Constructor] paddingChar is required when dduChar is provided.`);
        }
        
        const arr = typeof finalDduChar === "string" ? [...finalDduChar.trim()] : [...finalDduChar];
        if (shouldThrow) {
          const uniqueSize = new Set(arr).size;
          if (uniqueSize !== arr.length) {
            const duplicates = arr.filter((c, i) => arr.indexOf(c) !== i);
            throw new Error(`[Ddu64 Constructor] Character set contains duplicate characters: [${[...new Set(duplicates)].join(", ")}]`);
          }
        }
        
        const reqLen = dduOptions?.requiredLength ?? arr.length;
        if (arr.length < reqLen) {
          throw new Error(`[Ddu64 Constructor] Insufficient characters.`);
        }
        
        return buildMeta(arr, finalPadding, reqLen, false);
      }

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
    if (charSet[0].length !== 1 || requiredLength > 256) return;

    const limit = Math.min(charSet.length, requiredLength);
    const targetChars = charSet.slice(0, limit);
    const combinations = new Set<string>();
    
    const add = (s: string, context: string) => {
      if (combinations.has(s)) throw new Error(`Combination conflict: ${context}`);
      combinations.add(s);
    };

    for (let i = 0; i < targetChars.length; i++) {
      combinations.add(targetChars[i]);
    }
    combinations.add(paddingChar);

    for (let i = 0; i < targetChars.length; i++) {
      const c1 = targetChars[i];
      for (let j = 0; j < targetChars.length; j++) {
        add(c1 + targetChars[j], `"${c1}" + "${targetChars[j]}"`);
      }
      add(c1 + paddingChar, `"${c1}" + padding`);
      add(paddingChar + c1, `padding + "${c1}"`);
    }
    add(paddingChar + paddingChar, "double padding");
  }
}
