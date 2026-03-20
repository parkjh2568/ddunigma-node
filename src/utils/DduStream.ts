import { Transform, TransformCallback, TransformOptions, PassThrough } from "stream";
import { createDeflate, createInflate } from "zlib";
import { Ddu64 } from "../encoders/Ddu64";
import { DduOptions } from "../types";

/**
 * 두 스트림을 하나의 ReadWrite 스트림으로 결합합니다.
 * write는 input에, read는 output에서 수행됩니다.
 */
function combineStreams(input: NodeJS.WritableStream, output: NodeJS.ReadableStream): NodeJS.ReadWriteStream {
  const combined = new PassThrough();

  // write 방향: combined → input
  const origWrite = combined.write.bind(combined);
  combined.write = function (chunk: any, encodingOrCb?: any, cb?: any): boolean {
    if (typeof encodingOrCb === "function") {
      return (input as any).write(chunk, encodingOrCb);
    }
    return (input as any).write(chunk, encodingOrCb, cb);
  } as any;
  combined.end = function (chunk?: any, encodingOrCb?: any, cb?: any): any {
    if (typeof chunk === "function") {
      return (input as any).end(chunk);
    }
    if (typeof encodingOrCb === "function") {
      return (input as any).end(chunk, encodingOrCb);
    }
    return (input as any).end(chunk, encodingOrCb, cb);
  } as any;

  // read 방향: output → combined (push)
  (output as any).on("data", (data: any) => origWrite(data));
  (output as any).on("end", () => combined.push(null));
  (output as any).on("error", (err: Error) => combined.destroy(err));
  (input as any).on("error", (err: Error) => combined.destroy(err));

  return combined;
}

/**
 * Ddu64 인코딩을 위한 Transform 스트림
 * (내부적으로 청크 단위 인코딩을 수행합니다. 압축이 필요한 경우
 * `createEncodeStream` 팩토리 함수를 사용하는 것을 권장합니다.)
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
  private buffers: Buffer[];
  private totalLength: number;
  private chunkSize: number;

  constructor(encoder: Ddu64, options?: DduOptions & TransformOptions) {
    super({
      ...options,
      readableObjectMode: false,
      writableObjectMode: false,
    });
    this.encoder = encoder;
    // 스트림 자체에서는 청크 단위 인코딩만 수행하므로
    // 압축 및 체크섬 옵션은 팩토리 함수(createEncodeStream)에서 스트림 파이핑으로 처리함.
    this.options = { ...options, compress: false, checksum: false };
    this.buffers = [];
    this.totalLength = 0;
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
      this.buffers.push(chunk);
      this.totalLength += chunk.length;

      // 청크 크기만큼씩 처리
      while (this.totalLength >= this.chunkSize) {
        // 처리할 만큼의 버퍼를 합침
        const concatBuffer = Buffer.concat(this.buffers, this.totalLength);
        const toProcess = concatBuffer.subarray(0, this.chunkSize);
        
        // 남은 데이터 저장
        const remainder = concatBuffer.subarray(this.chunkSize);
        this.buffers = remainder.length > 0 ? [remainder] : [];
        this.totalLength = remainder.length;

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
      if (this.totalLength > 0) {
        const remainingBuffer = Buffer.concat(this.buffers, this.totalLength);
        const encoded = this.encodeChunk(remainingBuffer, true);
        this.push(encoded);
      }
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  private encodeChunk(data: Buffer, _isLast: boolean): string {
    // options에서 compress: false로 강제되어 있으므로 모든 청크 동일 처리
    return this.encoder.encode(data, this.options);
  }
}

/**
 * Ddu64 디코딩을 위한 Transform 스트림
 * (내부적으로 청크 단위 디코딩을 수행합니다. 압축 해제가 필요한 경우
 * `createDecodeStream` 팩토리 함수를 사용하는 것을 권장합니다.)
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
  private buffers: string[];
  private totalLength: number;
  private charLength: number;
  private chunkSize: number;

  constructor(encoder: Ddu64, options?: DduOptions & TransformOptions) {
    super({
      ...options,
      readableObjectMode: false,
      writableObjectMode: false,
    });
    this.encoder = encoder;
    // 디코딩 스트림에서도 zlib 파이프라인에서 압축 해제를 담당하므로 비활성화
    this.options = { ...options, compress: false, checksum: false };
    this.buffers = [];
    this.totalLength = 0;
    const info = encoder.getCharSetInfo();
    this.charLength = info.charLength;
    // 디코딩 청크 크기
    this.chunkSize = this.calculateChunkSize(info.charLength);
  }

  private calculateChunkSize(charLength: number): number {
    // 문자 길이의 배수로 설정
    return charLength * 1024;
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      // 문자열로 변환하고 줄바꿈 등 제거 후 배열에 추가
      const chunkStr = chunk.toString("utf-8").replace(/[\r\n\s]/g, "");
      if (chunkStr.length > 0) {
        this.buffers.push(chunkStr);
        this.totalLength += chunkStr.length;
      }

      // 청크 크기만큼씩 처리
      while (this.totalLength >= this.chunkSize) {
        // 처리할 만큼의 문자열을 합침
        const concatStr = this.buffers.join("");
        const toProcess = concatStr.slice(0, this.chunkSize);
        
        // 남은 데이터 저장
        const remainder = concatStr.slice(this.chunkSize);
        this.buffers = remainder.length > 0 ? [remainder] : [];
        this.totalLength = remainder.length;

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
      if (this.totalLength > 0) {
        const remainingStr = this.buffers.join("");
        const decoded = this.encoder.decodeToBuffer(remainingStr, this.options);
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
 * 옵션에 따라 압축 스트림을 자동으로 연결합니다.
 */
export function createEncodeStream(
  encoder: Ddu64,
  options?: DduOptions & TransformOptions
): NodeJS.ReadWriteStream {
  const encodeStream = new DduEncodeStream(encoder, options);

  if (options?.compress) {
    const deflate = createDeflate({ level: 9 });
    deflate.pipe(encodeStream);
    return combineStreams(deflate, encodeStream);
  }

  return encodeStream;
}

/**
 * Ddu64 인코더에서 디코드 스트림을 생성하는 팩토리 함수
 * 옵션에 따라 압축 해제 스트림을 자동으로 연결합니다.
 */
export function createDecodeStream(
  encoder: Ddu64,
  options?: DduOptions & TransformOptions
): NodeJS.ReadWriteStream {
  const decodeStream = new DduDecodeStream(encoder, options);

  if (options?.compress) {
    const inflate = createInflate();
    decodeStream.pipe(inflate);
    return combineStreams(decodeStream, inflate);
  }

  return decodeStream;
}

