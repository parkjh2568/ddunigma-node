import { Transform, TransformCallback, TransformOptions } from "stream";
import { createDeflate, createInflate } from "zlib";
import { Ddu64 } from "../encoders/Ddu64";
import { DduOptions } from "../types";

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

  private encodeChunk(data: Buffer, isLast: boolean): string {
    // 이미 options에서 compress: false로 강제되어 있음
    // 마지막 청크에만 패딩 정보가 포함됨
    if (isLast) {
      return this.encoder.encode(data, this.options);
    }
    // 중간 청크는 인코딩만 수행
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
    this.chunkSize = this.calculateChunkSize(info.bitLength, info.charLength);
  }

  private calculateChunkSize(bitLength: number, charLength: number): number {
    // 문자 길이의 배수로 설정
    const baseSize = charLength * 1024;
    return baseSize;
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
    // deflate 스트림의 출력을 encodeStream으로 파이프
    deflate.pipe(encodeStream);
    // 외부에는 첫 파이프라인(여기서는 deflate)을 반환하여
    // 사용자가 deflate 스트림에 write하도록 함.
    // 하지만 NodeJS 파이프라인 구조를 고려할 때, Duplex 스트림을
    // 만들거나, 반환된 객체가 체인의 앞부분이 되게 함.
    // 여기서는 간단히 deflate 스트림의 반환을 수정하기 위해 
    // 사용하기 편하게 stream.pipeline 처럼 동작을 원할 수 있으나,
    // 단일 인터페이스로는 pipe 체인을 외부로 노출하는 것이 좋음.
    
    // 이를 더 쉽게 다루기 위해 커스텀 Duplex 혹은 Transform을 만들기보다,
    // 파이핑된 마지막 스트림에서 읽고, 앞 단에 쓰는 형태로 구성이 필요하지만,
    // 가장 흔한 패턴은 "write는 deflate에, read는 encodeStream에서" 임.
    // 타입 호환과 안전한 사용을 위해 Transform을 감싼 형태로 리턴하는 것이 좋다.
    
    // 단순 파이프 구현 (내부 클래스는 Transform을 감싸지 않고 바로 리턴하면 파이프 인터페이스와 불일치 발생 가능성)
    // 따라서 임시적으로 파이프라인을 캡슐화한 Transform 반환
    
    const combined = new Transform({
      transform(chunk, encoding, callback) {
        if (!deflate.write(chunk, encoding)) {
          deflate.once('drain', callback);
        } else {
          callback();
        }
      },
      flush(callback) {
        deflate.end(() => callback());
      }
    });
    
    encodeStream.on('data', (data) => combined.push(data));
    encodeStream.on('end', () => combined.push(null));
    encodeStream.on('error', (err) => combined.emit('error', err));
    deflate.on('error', (err) => combined.emit('error', err));
    
    return combined;
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
    // decodeStream -> inflate 순으로 파이프
    decodeStream.pipe(inflate);
    
    const combined = new Transform({
      transform(chunk, encoding, callback) {
        if (!decodeStream.write(chunk, encoding)) {
          decodeStream.once('drain', callback);
        } else {
          callback();
        }
      },
      flush(callback) {
        decodeStream.end(() => callback());
      }
    });
    
    inflate.on('data', (data) => combined.push(data));
    inflate.on('end', () => combined.push(null));
    inflate.on('error', (err) => combined.emit('error', err));
    decodeStream.on('error', (err) => combined.emit('error', err));
    
    return combined;
  }

  return decodeStream;
}

