import { Transform, TransformCallback, TransformOptions } from "stream";
import { Ddu64 } from "../encoders/Ddu64";
import { DduOptions } from "../types";

/**
 * Ddu64 인코딩을 위한 Transform 스트림
 *
 * @example
 * const encoder = new Ddu64(chars, pad);
 * const stream = new DduEncodeStream(encoder);
 * fs.createReadStream('input.bin')
 *   .pipe(stream)
 *   .pipe(fs.createWriteStream('output.txt'));
 */
export class DduEncodeStream extends Transform {
  private encoder: Ddu64;
  private options: DduOptions;
  private buffer: Buffer;
  private chunkSize: number;

  constructor(encoder: Ddu64, options?: DduOptions & TransformOptions) {
    super({
      ...options,
      readableObjectMode: false,
      writableObjectMode: false,
    });
    this.encoder = encoder;
    this.options = options ?? {};
    this.buffer = Buffer.alloc(0);
    // 청크 크기: 비트 길이에 따라 최적화 (LCM 기반)
    const info = encoder.getCharSetInfo();
    this.chunkSize = this.calculateChunkSize(info.bitLength);
  }

  /**
   * 비트 길이에 맞는 최적의 청크 크기를 계산합니다.
   */
  private calculateChunkSize(bitLength: number): number {
    // 8과 bitLength의 최소공배수의 배수로 설정
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const lcm = (8 * bitLength) / gcd(8, bitLength);
    // 적절한 크기로 조정 (4KB ~ 64KB)
    const multiplier = Math.max(1, Math.floor(4096 / lcm));
    return lcm * multiplier;
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      // 이전 버퍼와 새 청크 합치기
      this.buffer = Buffer.concat([this.buffer, chunk]);

      // 청크 크기만큼씩 처리
      while (this.buffer.length >= this.chunkSize) {
        const toProcess = this.buffer.subarray(0, this.chunkSize);
        this.buffer = this.buffer.subarray(this.chunkSize);

        // 중간 청크는 패딩 없이 인코딩 (compress 없이)
        const encoded = this.encodeChunk(toProcess, false);
        this.push(encoded);
      }

      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  _flush(callback: TransformCallback): void {
    try {
      // 남은 데이터 처리 (패딩 포함)
      if (this.buffer.length > 0) {
        const encoded = this.encodeChunk(this.buffer, true);
        this.push(encoded);
      }
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  private encodeChunk(data: Buffer, isLast: boolean): string {
    // 스트림에서는 압축 비활성화 (청크 단위로는 효율적이지 않음)
    // 마지막 청크에만 패딩 정보가 포함됨
    if (isLast) {
      return this.encoder.encode(data, { ...this.options, compress: false });
    }
    // 중간 청크는 인코딩만 (임시 해결책: 전체 인코딩)
    return this.encoder.encode(data, { ...this.options, compress: false });
  }
}

/**
 * Ddu64 디코딩을 위한 Transform 스트림
 *
 * @example
 * const encoder = new Ddu64(chars, pad);
 * const stream = new DduDecodeStream(encoder);
 * fs.createReadStream('input.txt')
 *   .pipe(stream)
 *   .pipe(fs.createWriteStream('output.bin'));
 */
export class DduDecodeStream extends Transform {
  private encoder: Ddu64;
  private options: DduOptions;
  private buffer: string;
  private charLength: number;
  private chunkSize: number;

  constructor(encoder: Ddu64, options?: DduOptions & TransformOptions) {
    super({
      ...options,
      readableObjectMode: false,
      writableObjectMode: false,
    });
    this.encoder = encoder;
    this.options = options ?? {};
    this.buffer = "";
    const info = encoder.getCharSetInfo();
    this.charLength = info.charLength;
    // 디코딩 청크 크기
    this.chunkSize = this.calculateChunkSize(info.bitLength, info.charLength);
  }

  private calculateChunkSize(bitLength: number, charLength: number): number {
    // 문자 길이의 배수로 설정
    const baseSize = charLength * 1024;
    return baseSize;
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      // 문자열로 변환하고 버퍼에 추가
      this.buffer += chunk.toString("utf-8");

      // 줄바꿈 등 제거
      this.buffer = this.buffer.replace(/[\r\n\s]/g, "");

      // 청크 크기만큼씩 처리
      while (this.buffer.length >= this.chunkSize) {
        const toProcess = this.buffer.slice(0, this.chunkSize);
        this.buffer = this.buffer.slice(this.chunkSize);

        const decoded = this.encoder.decodeToBuffer(toProcess, this.options);
        this.push(decoded);
      }

      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  _flush(callback: TransformCallback): void {
    try {
      // 남은 데이터 처리
      if (this.buffer.length > 0) {
        const decoded = this.encoder.decodeToBuffer(this.buffer, this.options);
        this.push(decoded);
      }
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }
}

/**
 * Ddu64 인코더에서 스트림을 생성하는 팩토리 함수
 */
export function createEncodeStream(
  encoder: Ddu64,
  options?: DduOptions & TransformOptions
): DduEncodeStream {
  return new DduEncodeStream(encoder, options);
}

/**
 * Ddu64 인코더에서 디코드 스트림을 생성하는 팩토리 함수
 */
export function createDecodeStream(
  encoder: Ddu64,
  options?: DduOptions & TransformOptions
): DduDecodeStream {
  return new DduDecodeStream(encoder, options);
}

