import { Transform, TransformCallback, TransformOptions, PassThrough } from "stream";
import { createDeflate, createInflate, createBrotliCompress, createBrotliDecompress, constants } from "zlib";
import { Ddu64 } from "../encoders/Ddu64";
import { DduOptions } from "../types";
import { removeChunksFast } from "./codecUtils";

const STREAM_HEADER_MAGIC = "DDS1";

type StreamHeaderMeta = {
  compressionAlgorithm?: "deflate" | "brotli";
  encrypted: boolean;
};

function getStreamHeaderLength(paddingChar: string): number {
  return paddingChar.length * 2 + STREAM_HEADER_MAGIC.length + 2;
}

function buildStreamHeader(
  paddingChar: string,
  meta: StreamHeaderMeta
): string {
  const compressionCode =
    meta.compressionAlgorithm === "brotli"
      ? "B"
      : meta.compressionAlgorithm === "deflate"
        ? "D"
        : "N";
  const encryptionCode = meta.encrypted ? "1" : "0";
  return `${paddingChar}${STREAM_HEADER_MAGIC}${compressionCode}${encryptionCode}${paddingChar}`;
}

function parseStreamHeader(
  input: string,
  paddingChar: string
): StreamHeaderMeta | null {
  const headerLength = getStreamHeaderLength(paddingChar);
  if (input.length < headerLength || !input.startsWith(paddingChar)) {
    return null;
  }

  const bodyStart = paddingChar.length;
  const magic = input.slice(bodyStart, bodyStart + STREAM_HEADER_MAGIC.length);
  if (magic !== STREAM_HEADER_MAGIC) {
    throw new Error("[DduStream decode] Invalid stream header magic");
  }

  const compressionCode = input[bodyStart + STREAM_HEADER_MAGIC.length];
  const encryptionCode = input[bodyStart + STREAM_HEADER_MAGIC.length + 1];
  const endPadding = input.slice(headerLength - paddingChar.length, headerLength);
  if (endPadding !== paddingChar) {
    throw new Error("[DduStream decode] Invalid stream header terminator");
  }

  const compressionAlgorithm =
    compressionCode === "B"
      ? "brotli"
      : compressionCode === "D"
        ? "deflate"
        : compressionCode === "N"
          ? undefined
          : null;

  if (compressionAlgorithm === null) {
    throw new Error("[DduStream decode] Invalid stream header compression flag");
  }
  if (encryptionCode !== "0" && encryptionCode !== "1") {
    throw new Error("[DduStream decode] Invalid stream header encryption flag");
  }

  return {
    compressionAlgorithm,
    encrypted: encryptionCode === "1",
  };
}

class PrefixChunkTransform extends Transform {
  private readonly prefix: string;
  private emittedPrefix = false;

  constructor(prefix: string) {
    super();
    this.prefix = prefix;
  }

  _transform(chunk: Buffer | string, _encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      if (!this.emittedPrefix) {
        this.push(this.prefix);
        this.emittedPrefix = true;
      }
      this.push(chunk);
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }
}

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
 * 여러 스트림을 순차 파이프라인으로 연결하고 단일 ReadWrite 스트림으로 노출합니다.
 */
function combinePipeline(streams: Transform[]): NodeJS.ReadWriteStream {
  if (streams.length === 0) {
    return new PassThrough();
  }

  for (let i = 0; i < streams.length - 1; i++) {
    streams[i].pipe(streams[i + 1]);
  }

  const combined = combineStreams(streams[0], streams[streams.length - 1]);
  for (const stream of streams) {
    stream.on("error", (err: Error) => {
      (combined as PassThrough).destroy(err);
    });
  }
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
  private buffers: Buffer[];
  private bufferOffset: number;
  private totalLength: number;
  private chunkSize: number;
  private footerCompressionAlgorithm: "deflate" | "brotli" | undefined;
  private footerEncrypted: boolean;

  constructor(encoder: Ddu64, options?: DduOptions & TransformOptions) {
    super({
      ...options,
      readableObjectMode: false,
      writableObjectMode: false,
    });
    this.encoder = encoder;
    const info = encoder.getCharSetInfo();
    this.buffers = [];
    this.bufferOffset = 0;
    this.totalLength = 0;
    this.footerCompressionAlgorithm =
      options?.compress ?? info.defaultCompress
        ? (options?.compressionAlgorithm ?? info.defaultCompressionAlgorithm)
        : undefined;
    this.footerEncrypted = (options?.encrypt ?? true) && info.hasEncryptionKey;
    // 청크 크기: 비트 길이에 따라 최적화 (LCM 기반)
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
        const toProcess = this.readBytes(this.chunkSize);
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
        const remainingBuffer = this.readBytes(this.totalLength);
        const encoded = this.encodeChunk(remainingBuffer, true);
        this.push(encoded);
      }
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  private encodeChunk(data: Buffer, isLast: boolean): string {
    return this.encoder.encodeRawBuffer(data, {
      compressionAlgorithm: isLast ? this.footerCompressionAlgorithm : undefined,
      encrypted: isLast ? this.footerEncrypted : false,
      omitFooter: !isLast,
    });
  }

  private readBytes(size: number): Buffer {
    if (size <= 0 || this.totalLength < size) {
      return Buffer.alloc(0);
    }

    const first = this.buffers[0];
    if (
      this.buffers.length === 1 &&
      first &&
      this.bufferOffset === 0 &&
      first.length === size
    ) {
      this.buffers = [];
      this.totalLength = 0;
      return first;
    }

    const result = Buffer.allocUnsafe(size);
    let written = 0;

    while (written < size && this.buffers.length > 0) {
      const current = this.buffers[0];
      const available = current.length - this.bufferOffset;
      const copyLength = Math.min(size - written, available);
      current.copy(result, written, this.bufferOffset, this.bufferOffset + copyLength);

      written += copyLength;
      this.bufferOffset += copyLength;

      if (this.bufferOffset >= current.length) {
        this.buffers.shift();
        this.bufferOffset = 0;
      }
    }

    this.totalLength -= size;
    return result;
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
  private normalizedBuffer: string;
  private charLength: number;
  private chunkSize: number;
  private chunkSeparator: string;
  private separatorTail: string;

  constructor(encoder: Ddu64, options?: DduOptions & TransformOptions) {
    super({
      ...options,
      readableObjectMode: false,
      writableObjectMode: false,
    });
    this.encoder = encoder;
    // 디코딩 스트림에서도 zlib 파이프라인에서 압축 해제를 담당하므로 비활성화
    this.options = { ...options, compress: false, checksum: false, encrypt: false };
    this.normalizedBuffer = "";
    const info = encoder.getCharSetInfo();
    this.charLength = info.charLength;
    this.chunkSeparator = options?.chunkSeparator ?? info.defaultChunkSeparator;
    this.separatorTail = "";
    // 디코딩 청크 크기
    this.chunkSize = this.calculateChunkSize(info.charLength);
  }

  private calculateChunkSize(charLength: number): number {
    // 문자 길이의 배수로 설정
    return charLength * 1024;
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      this.appendNormalizedChunk(chunk.toString("utf-8"));

      // 청크 크기만큼 처리하되, Footer(패딩 및 압축마커 등)가 경계에서 잘리는 것을
      // 방지하기 위해 항상 SAFE_MARGIN 이상의 여유 버퍼를 유지합니다.
      const SAFE_MARGIN = 100;
      while (this.normalizedBuffer.length >= this.chunkSize + SAFE_MARGIN) {
        const toProcess = this.normalizedBuffer.slice(0, this.chunkSize);
        this.normalizedBuffer = this.normalizedBuffer.slice(this.chunkSize);

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
      if (this.separatorTail.length > 0) {
        this.normalizedBuffer += removeChunksFast(
          this.separatorTail,
          this.chunkSeparator
        );
        this.separatorTail = "";
      }

      // 남은 데이터 처리
      if (this.normalizedBuffer.length > 0) {
        const decoded = this.encoder.decodeStreamToBuffer(this.normalizedBuffer, this.options);
        this.push(decoded);
        this.normalizedBuffer = "";
      }
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  private appendNormalizedChunk(chunk: string): void {
    if (chunk.length === 0) return;

    const separatorWindow = Math.max(0, this.chunkSeparator.length - 1);
    if (separatorWindow === 0) {
      this.normalizedBuffer += removeChunksFast(chunk, this.chunkSeparator);
      return;
    }

    const combined = this.separatorTail + chunk;
    if (combined.length <= separatorWindow) {
      this.separatorTail = combined;
      return;
    }

    const splitIndex = combined.length - separatorWindow;
    const safePart = combined.slice(0, splitIndex);
    this.separatorTail = combined.slice(splitIndex);
    this.normalizedBuffer += removeChunksFast(safePart, this.chunkSeparator);
  }
}

/**
 * Footer를 끝까지 읽은 뒤 압축/암호화 메타데이터를 자동 감지하여
 * 한 번에 복원하는 디코드 스트림입니다.
 */
class DduAutoDetectDecodeStream extends Transform {
  private encoder: Ddu64;
  private options: DduOptions;
  private normalizedBuffer: string;
  private chunkSeparator: string;
  private separatorTail: string;
  private paddingChar: string;
  private headerLength: number;
  private mode: "pending" | "legacy" | "pipeline";
  private innerStream: NodeJS.ReadWriteStream | null;

  constructor(encoder: Ddu64, options?: DduOptions & TransformOptions) {
    super({
      ...options,
      readableObjectMode: false,
      writableObjectMode: false,
    });
    this.encoder = encoder;
    this.options = { ...options };
    this.normalizedBuffer = "";
    const info = encoder.getCharSetInfo();
    this.paddingChar = info.paddingChar;
    this.headerLength = getStreamHeaderLength(info.paddingChar);
    this.chunkSeparator = options?.chunkSeparator ?? info.defaultChunkSeparator;
    this.separatorTail = "";
    this.mode = "pending";
    this.innerStream = null;
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      this.appendNormalizedChunk(chunk.toString("utf-8"));
      this.maybeInitializeMode(false);

      if (this.mode === "pipeline") {
        this.flushBufferedToInner(callback);
        return;
      }

      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  _flush(callback: TransformCallback): void {
    try {
      if (this.separatorTail.length > 0) {
        this.normalizedBuffer += removeChunksFast(
          this.separatorTail,
          this.chunkSeparator
        );
        this.separatorTail = "";
      }

      this.maybeInitializeMode(true);

      if (this.mode === "pipeline") {
        this.finishInnerPipeline(callback);
        return;
      }

      if (this.normalizedBuffer.length > 0) {
        const decoded = this.encoder.decodeStreamToBuffer(this.normalizedBuffer, this.options);
        this.push(decoded);
        this.normalizedBuffer = "";
      }
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  private appendNormalizedChunk(chunk: string): void {
    if (chunk.length === 0) return;

    const separatorWindow = Math.max(0, this.chunkSeparator.length - 1);
    if (separatorWindow === 0) {
      this.normalizedBuffer += removeChunksFast(chunk, this.chunkSeparator);
      return;
    }

    const combined = this.separatorTail + chunk;
    if (combined.length <= separatorWindow) {
      this.separatorTail = combined;
      return;
    }

    const splitIndex = combined.length - separatorWindow;
    const safePart = combined.slice(0, splitIndex);
    this.separatorTail = combined.slice(splitIndex);
    this.normalizedBuffer += removeChunksFast(safePart, this.chunkSeparator);
  }

  private maybeInitializeMode(isFinal: boolean): void {
    if (this.mode !== "pending") return;

    const padLen = this.paddingChar.length;
    if (this.normalizedBuffer.length < padLen) {
      if (isFinal && this.normalizedBuffer.length > 0) {
        this.mode = "legacy";
      }
      return;
    }

    if (!this.normalizedBuffer.startsWith(this.paddingChar)) {
      this.mode = "legacy";
      return;
    }

    if (this.normalizedBuffer.length < this.headerLength) {
      if (isFinal) {
        throw new Error("[DduStream decode] Incomplete stream header");
      }
      return;
    }

    const header = this.normalizedBuffer.slice(0, this.headerLength);
    const parsed = parseStreamHeader(header, this.paddingChar);
    if (!parsed) {
      this.mode = "legacy";
      return;
    }

    this.mode = "pipeline";
    this.normalizedBuffer = this.normalizedBuffer.slice(this.headerLength);
    this.initializeInnerPipeline(parsed);
  }

  private initializeInnerPipeline(header: StreamHeaderMeta): void {
    const stream = createDecodeStream(this.encoder, {
      ...this.options,
      streamAutoDetect: false,
      compress: !!header.compressionAlgorithm,
      compressionAlgorithm: header.compressionAlgorithm,
      encrypt: header.encrypted,
    });

    stream.on("data", (chunk: Buffer | string) => {
      this.push(chunk);
    });
    stream.on("error", (err: Error) => {
      this.destroy(err);
    });

    this.innerStream = stream;
  }

  private flushBufferedToInner(callback: TransformCallback): void {
    if (!this.innerStream || this.normalizedBuffer.length === 0) {
      callback();
      return;
    }

    const pending = this.normalizedBuffer;
    this.normalizedBuffer = "";
    const canContinue = this.innerStream.write(Buffer.from(pending, "utf-8"));
    if (!canContinue) {
      this.innerStream.once("drain", () => callback());
      return;
    }

    callback();
  }

  private finishInnerPipeline(callback: TransformCallback): void {
    if (!this.innerStream) {
      callback();
      return;
    }

    const stream = this.innerStream;
    const endStream = () => {
      stream.once("end", () => callback());
      stream.end();
    };

    if (this.normalizedBuffer.length > 0) {
      const pending = this.normalizedBuffer;
      this.normalizedBuffer = "";
      const canContinue = stream.write(Buffer.from(pending, "utf-8"));
      if (!canContinue) {
        stream.once("drain", endStream);
        return;
      }
    }

    endStream();
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
  const info = encoder.getCharSetInfo();
  const shouldCompress = options?.compress ?? info.defaultCompress;
  const shouldEncrypt = (options?.encrypt ?? true) && info.hasEncryptionKey;
  const useStreamHeader = options?.streamAutoDetect !== false;
  const compressionAlgorithm =
    shouldCompress
      ? (options?.compressionAlgorithm ?? info.defaultCompressionAlgorithm)
      : undefined;
  const encodeStream = new DduEncodeStream(encoder, options);
  const pipeline: Transform[] = [];

  if (shouldCompress) {
    const isBrotli = compressionAlgorithm === "brotli";
    const level = options?.compressionLevel || 6;
    const compressor = isBrotli
      ? createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: Math.min(11, Math.max(0, level)) } })
      : createDeflate({ level: Math.min(9, Math.max(1, level)) }) as Transform;
    pipeline.push(compressor);
  }

  if (shouldEncrypt) {
    const encryptStream = encoder.createEncryptionStream();
    if (encryptStream) {
      pipeline.push(encryptStream);
    }
  }

  pipeline.push(encodeStream);
  if (useStreamHeader) {
    pipeline.push(
      new PrefixChunkTransform(
        buildStreamHeader(info.paddingChar, {
          compressionAlgorithm,
          encrypted: shouldEncrypt,
        })
      )
    );
  }
  return pipeline.length === 1 ? encodeStream : combinePipeline(pipeline);
}

/**
 * Ddu64 인코더에서 디코드 스트림을 생성하는 팩토리 함수
 * 옵션에 따라 압축 해제 스트림을 자동으로 연결합니다.
 * 기본적으로 footer를 끝까지 읽어 압축/암호화를 자동 감지합니다.
 * 진짜 스트리밍 복원을 원하면 `streamAutoDetect: false`와 함께 encode 측과 동일한
 * compress/encryption 설정 또는 같은 encoder 기본값을 사용해야 합니다.
 */
export function createDecodeStream(
  encoder: Ddu64,
  options?: DduOptions & TransformOptions
): NodeJS.ReadWriteStream {
  const useAutoDetect = options?.streamAutoDetect ?? true;
  if (useAutoDetect) {
    return new DduAutoDetectDecodeStream(encoder, options);
  }

  const info = encoder.getCharSetInfo();
  const shouldCompress = options?.compress ?? info.defaultCompress;
  const shouldEncrypt = (options?.encrypt ?? true) && info.hasEncryptionKey;
  const decodeStream = new DduDecodeStream(encoder, options);
  const pipeline: Transform[] = [decodeStream];

  if (shouldEncrypt) {
    const decryptStream = encoder.createDecryptionStream();
    if (decryptStream) {
      pipeline.push(decryptStream);
    }
  }

  if (shouldCompress) {
    const compressionAlgorithm =
      options?.compressionAlgorithm ?? info.defaultCompressionAlgorithm;
    const isBrotli = compressionAlgorithm === "brotli";
    const decompressor = (isBrotli ? createBrotliDecompress() : createInflate()) as Transform;
    pipeline.push(decompressor);
  }

  return pipeline.length === 1 ? decodeStream : combinePipeline(pipeline);
}
