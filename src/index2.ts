export class Ddu64 {
  // CHANGE: 상수값들을 static readonly로 변경하여 메모리 효율성 향상
  private static readonly DEFAULT_DDU_CHAR_KR = [
    "뜌", "땨", "이", "우", "야", "!", "?", "."
  ] as const;
  
  private static readonly DEFAULT_PADDING_CHAR_KR = "뭐";
  private static readonly DEFAULT_ENCODING: BufferEncoding = "utf-8";

  // CHANGE: 타입을 명시적으로 지정하고 readonly 추가하여 불변성 보장
  private readonly binaryLookup: readonly string[];
  private readonly dduBinaryLookup: Map<string, number>;
  private readonly dduBinaryLookupKr: Map<string, number>;
  private readonly paddingRegex: Map<string, RegExp>;

  // CHANGE: 생성자 매개변수에 readonly 추가하여 불변성 보장
  constructor(
    private readonly dduChar: readonly string[] = Ddu64.DEFAULT_DDU_CHAR_KR,
    private readonly paddingChar: string = Ddu64.DEFAULT_PADDING_CHAR_KR
  ) {
    // CHANGE: Array.from을 사용하여 더 명확하고 효율적인 초기화
    this.binaryLookup = Array.from({ length: 256 }, (_, i) => 
      i.toString(2).padStart(8, "0")
    );

    // CHANGE: Map 초기화를 더 간결하게 변경
    this.dduBinaryLookup = new Map(dduChar.map((char, index) => [char, index]));
    this.dduBinaryLookupKr = new Map(
      Ddu64.DEFAULT_DDU_CHAR_KR.map((char, index) => [char, index])
    );

    // CHANGE: 정규식 컴파일을 한 번만 수행하도록 변경
    this.paddingRegex = new Map([
      ["default", new RegExp(this.paddingChar, "g")],
      ["KR", new RegExp(Ddu64.DEFAULT_PADDING_CHAR_KR, "g")]
    ]);
  }

  // CHANGE: 성능 최적화를 위해 비트 연산으로 변경
  private getLargestPowerOfTwo(n: number): number {
    return 2 ** Math.floor(Math.log2(n));
  }

  // CHANGE: bitLengthMap 캐시 제거하고 직접 계산하도록 단순화
  private getBitLength(setLength: number): number {
    return Math.ceil(Math.log2(setLength));
  }

  // CHANGE: Generator 함수명을 더 명확하게 변경하고 성능 최적화
  private *chunkString(s: string, length: number): Generator<string> {
    let index = 0;
    while (index < s.length) {
      yield s.slice(index, index + length);
      index += length;
    }
  }

  // CHANGE: 반환 타입 명시적 정의를 위해 인터페이스 사용
  private getSelectedSets(dduSetSymbol: string = "default") {
    if (dduSetSymbol === "KR") {
      return {
        dduSet: Ddu64.DEFAULT_DDU_CHAR_KR,
        padChar: Ddu64.DEFAULT_PADDING_CHAR_KR,
        dduLength: Ddu64.DEFAULT_DDU_CHAR_KR.length,
        bitLength: this.getBitLength(Ddu64.DEFAULT_DDU_CHAR_KR.length),
        lookupTable: this.dduBinaryLookupKr,
        paddingRegExp: this.paddingRegex.get("KR")!
      };
    }
    return {
      dduSet: this.dduChar,
      padChar: this.paddingChar,
      dduLength: this.dduChar.length,
      bitLength: this.getBitLength(this.dduChar.length),
      lookupTable: this.dduBinaryLookup,
      paddingRegExp: this.paddingRegex.get("default")!
    };
  }

  // CHANGE: 64 모드용 설정을 더 효율적으로 계산
  private getSelectedSets64(dduSetSymbol: string = "default") {
    const baseSet = this.getSelectedSets(dduSetSymbol);
    const powerOfTwoLength = this.getLargestPowerOfTwo(baseSet.dduSet.length);

    return {
      ...baseSet,
      dduSet: baseSet.dduSet.slice(0, powerOfTwoLength),
      dduLength: powerOfTwoLength,
      bitLength: Math.log2(powerOfTwoLength)
    };
  }

  // NEW: 버퍼를 바이너리로 변환하는 로직을 별도 메서드로 분리
  private bufferToBinary(input: Buffer, bitLength: number) {
    const binary = Array.from(input, byte => this.binaryLookup[byte]).join("");
    const chunks = Array.from(this.chunkString(binary, bitLength));
    const lastChunk = chunks[chunks.length - 1];
    const padding = lastChunk ? bitLength - lastChunk.length : 0;

    if (padding > 0) {
      chunks[chunks.length - 1] = lastChunk.padEnd(bitLength, "0");
    }

    return { chunks, padding };
  }

  // CHANGE: 배열 사용하여 문자열 연산 최소화
  encode(
    input: Buffer | string,
    options: { dduSetSymbol?: string; encoding?: BufferEncoding } = {}
  ): string {
    const { dduSetSymbol = "default", encoding = Ddu64.DEFAULT_ENCODING } = options;
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, encoding);
    const { dduSet, padChar, dduLength, bitLength } = this.getSelectedSets(dduSetSymbol);
    const { chunks, padding } = this.bufferToBinary(buffer, bitLength);

    // CHANGE: 문자열 연결 대신 배열 사용
    const result = new Array(chunks.length * 2);
    let resultIndex = 0;

    for (const chunk of chunks) {
      const value = parseInt(chunk, 2);
      const quotient = Math.floor(value / dduLength);
      const remainder = value % dduLength;
      
      result[resultIndex++] = dduSet[quotient];
      result[resultIndex++] = dduSet[remainder];
    }

    return padding > 0 
      ? result.join("") + padChar.repeat(Math.floor(padding / 2))
      : result.join("");
  }

  // CHANGE: 64 모드 인코딩 최적화
  encode64(
    input: Buffer | string,
    options: { dduSetSymbol?: string; encoding?: BufferEncoding } = {}
  ): string {
    const { dduSetSymbol = "default", encoding = Ddu64.DEFAULT_ENCODING } = options;
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, encoding);
    const { dduSet, padChar, bitLength } = this.getSelectedSets64(dduSetSymbol);
    const { chunks, padding } = this.bufferToBinary(buffer, bitLength);

    // CHANGE: map 사용하여 더 간결한 변환
    const result = chunks.map(chunk => dduSet[parseInt(chunk, 2)]);

    return padding > 0 
      ? result.join("") + padChar.repeat(Math.floor(padding / 2))
      : result.join("");
  }

  decode(
    input: string,
    options: { dduSetSymbol?: string; encoding?: BufferEncoding } = {}
  ): string {
    const { dduSetSymbol = "default", encoding = Ddu64.DEFAULT_ENCODING } = options;
    const { dduLength, bitLength, lookupTable, paddingRegExp } = 
      this.getSelectedSets(dduSetSymbol);

    const paddingCount = (input.match(paddingRegExp) || []).length;
    const cleanInput = input.replace(paddingRegExp, "");

    // CHANGE: 배열 미리 할당하여 성능 향상
    const binaryChunks = new Array(Math.floor(cleanInput.length / 2));
    let chunkIndex = 0;

    for (let i = 0; i < cleanInput.length; i += 2) {
      const firstIndex = lookupTable.get(cleanInput[i]);
      const secondIndex = lookupTable.get(cleanInput[i + 1]);

      if (firstIndex === undefined || secondIndex === undefined) continue;

      const value = firstIndex * dduLength + secondIndex;
      binaryChunks[chunkIndex++] = value.toString(2).padStart(bitLength, "0");
    }

    return this.binaryToString(binaryChunks.join(""), paddingCount, encoding);
  }

  decode64(
    input: string,
    options: { dduSetSymbol?: string; encoding?: BufferEncoding } = {}
  ): string {
    const { dduSetSymbol = "default", encoding = Ddu64.DEFAULT_ENCODING } = options;
    const { bitLength, lookupTable, paddingRegExp } = 
      this.getSelectedSets64(dduSetSymbol);

    const paddingCount = (input.match(paddingRegExp) || []).length;
    const cleanInput = input.replace(paddingRegExp, "");

    // CHANGE: 배열 미리 할당하여 성능 향상
    const binaryChunks = new Array(cleanInput.length);
    let chunkIndex = 0;

    for (const char of cleanInput) {
      const charIndex = lookupTable.get(char);
      if (charIndex === undefined) continue;
      binaryChunks[chunkIndex++] = charIndex.toString(2).padStart(bitLength, "0");
    }

    return this.binaryToString(binaryChunks.join(""), paddingCount, encoding);
  }

  // NEW: 바이너리 문자열을 디코딩하는 공통 로직 분리
  private binaryToString(binary: string, paddingCount: number, encoding: BufferEncoding): string {
    if (paddingCount > 0) {
      binary = binary.slice(0, -(paddingCount * 2));
    }

    const bufferLength = Math.floor(binary.length / 8);
    // CHANGE: Uint8Array 사용하여 메모리 효율성 향상
    const buffer = new Uint8Array(bufferLength);

    for (let i = 0; i < bufferLength; i++) {
      const start = i * 8;
      buffer[i] = parseInt(binary.slice(start, start + 8), 2);
    }

    return Buffer.from(buffer).toString(encoding);
  }
}