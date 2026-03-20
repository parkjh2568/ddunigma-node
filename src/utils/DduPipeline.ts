import { deflateSync } from "zlib";
import { Ddu64 } from "../encoders/Ddu64";
import { DduConstructorOptions } from "../types";
import {
  deriveKey,
  encryptAes256Gcm,
  decryptAes256Gcm,
  inflateWithLimit,
} from "./crypto";

/**
 * 파이프라인 단계 타입
 */
type PipelineStep =
  | { type: "compress"; level?: number }
  | { type: "decompress"; maxDecompressedBytes?: number }
  | { type: "encrypt"; key: string }
  | { type: "decrypt"; key: string }
  | { type: "encode"; encoder: Ddu64 }
  | { type: "decode"; encoder: Ddu64 }
  | { type: "transform"; fn: (data: Buffer) => Buffer }
  | { type: "transformString"; fn: (data: string) => string };

/**
 * 다중 인코딩/암호화/압축을 파이프라인으로 조합할 수 있는 빌더 클래스
 *
 * @example
 * const pipeline = new DduPipeline()
 *   .compress()
 *   .encrypt('secret-key')
 *   .encode(new Ddu64(chars, pad));
 *
 * const encoded = pipeline.process('Hello World');
 * const decoded = pipeline.reverse().process(encoded);
 */
export class DduPipeline {
  private steps: PipelineStep[] = [];

  /**
   * 압축 단계를 추가합니다.
   *
   * @param level - 압축 레벨 (0-9, 기본값: 9)
   */
  compress(level: number = 9): DduPipeline {
    this.steps.push({ type: "compress", level });
    return this;
  }

  /**
   * 압축 해제 단계를 추가합니다.
   *
   * @param maxDecompressedBytes - 최대 압축해제 바이트 수 (Zip Bomb 방어용)
   */
  decompress(maxDecompressedBytes?: number): DduPipeline {
    this.steps.push({ type: "decompress", maxDecompressedBytes });
    return this;
  }

  /**
   * AES-256-GCM 암호화 단계를 추가합니다.
   *
   * @param key - 암호화 키
   */
  encrypt(key: string): DduPipeline {
    this.steps.push({ type: "encrypt", key });
    return this;
  }

  /**
   * AES-256-GCM 복호화 단계를 추가합니다.
   *
   * @param key - 복호화 키
   */
  decrypt(key: string): DduPipeline {
    this.steps.push({ type: "decrypt", key });
    return this;
  }

  /**
   * Ddu64 인코딩 단계를 추가합니다.
   *
   * @param encoder - Ddu64 인코더 인스턴스
   */
  encode(encoder: Ddu64): DduPipeline {
    this.steps.push({ type: "encode", encoder });
    return this;
  }

  /**
   * Ddu64 디코딩 단계를 추가합니다.
   *
   * @param encoder - Ddu64 인코더 인스턴스
   */
  decode(encoder: Ddu64): DduPipeline {
    this.steps.push({ type: "decode", encoder });
    return this;
  }

  /**
   * 새 인코더를 생성하여 인코딩 단계를 추가합니다.
   *
   * @param dduChar - charset 문자열 또는 배열
   * @param paddingChar - 패딩 문자
   * @param options - 인코더 옵션
   */
  encodeWith(
    dduChar?: string[] | string,
    paddingChar?: string,
    options?: DduConstructorOptions
  ): DduPipeline {
    const encoder = new Ddu64(dduChar, paddingChar, options);
    return this.encode(encoder);
  }

  /**
   * 커스텀 Buffer 변환 단계를 추가합니다.
   *
   * @param fn - 변환 함수
   */
  transform(fn: (data: Buffer) => Buffer): DduPipeline {
    this.steps.push({ type: "transform", fn });
    return this;
  }

  /**
   * 커스텀 문자열 변환 단계를 추가합니다.
   *
   * @param fn - 변환 함수
   */
  transformString(fn: (data: string) => string): DduPipeline {
    this.steps.push({ type: "transformString", fn });
    return this;
  }

  /**
   * 파이프라인을 역순으로 실행할 새 파이프라인을 생성합니다.
   */
  reverse(): DduPipeline {
    const reversed = new DduPipeline();
    reversed.steps = this.steps
      .slice()
      .reverse()
      .map((step): PipelineStep => {
        switch (step.type) {
          case "compress":
            return { type: "decompress" };
          case "decompress":
            return { type: "compress", level: 9 };
          case "encrypt":
            return { type: "decrypt", key: step.key };
          case "decrypt":
            return { type: "encrypt", key: step.key };
          case "encode":
            return { type: "decode", encoder: step.encoder };
          case "decode":
            return { type: "encode", encoder: step.encoder };
          case "transform":
          case "transformString":
            throw new Error(
              `[DduPipeline reverse] Cannot reverse "${step.type}" step. Custom transform functions are not reversible. Use explicit encode/decode pairs instead.`
            );
        }
      });
    return reversed;
  }

  /**
   * 파이프라인을 실행합니다.
   *
   * @param input - 입력 데이터 (문자열 또는 Buffer)
   * @returns 처리된 결과 (문자열 또는 Buffer)
   */
  process(input: string | Buffer): string | Buffer {
    let data: string | Buffer = input;

    for (const step of this.steps) {
      data = this.executeStep(step, data);
    }

    return data;
  }

  /**
   * 파이프라인을 실행하고 문자열로 반환합니다.
   */
  processToString(input: string | Buffer, encoding: BufferEncoding = "utf-8"): string {
    const result = this.process(input);
    if (typeof result === "string") return result;
    return result.toString(encoding);
  }

  /**
   * 파이프라인을 실행하고 Buffer로 반환합니다.
   */
  processToBuffer(input: string | Buffer, encoding: BufferEncoding = "utf-8"): Buffer {
    const result = this.process(input);
    if (Buffer.isBuffer(result)) return result;
    return Buffer.from(result, encoding);
  }

  /**
   * 개별 단계를 실행합니다.
   */
  private executeStep(step: PipelineStep, data: string | Buffer): string | Buffer {
    switch (step.type) {
      case "compress":
        return this.compressData(this.toBuffer(data), step.level ?? 9);
      case "decompress":
        return this.decompressData(this.toBuffer(data), step.maxDecompressedBytes);
      case "encrypt":
        return this.encryptData(this.toBuffer(data), step.key);
      case "decrypt":
        return this.decryptData(this.toBuffer(data), step.key);
      case "encode":
        return step.encoder.encode(this.toBuffer(data));
      case "decode":
        return step.encoder.decodeToBuffer(this.toString(data));
      case "transform":
        return step.fn(this.toBuffer(data));
      case "transformString":
        return step.fn(this.toString(data));
    }
  }

  private toBuffer(data: string | Buffer): Buffer {
    return typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  }

  private toString(data: string | Buffer): string {
    return typeof data === "string" ? data : data.toString("utf-8");
  }

  private compressData(data: Buffer, level: number): Buffer {
    return deflateSync(data, { level });
  }

  private decompressData(data: Buffer, maxBytes?: number): Buffer {
    return inflateWithLimit(
      data,
      maxBytes ?? Number.POSITIVE_INFINITY,
      "DduPipeline decompress"
    );
  }

  private encryptData(data: Buffer, key: string): Buffer {
    return encryptAes256Gcm(data, deriveKey(key));
  }

  private decryptData(data: Buffer, key: string): Buffer {
    return decryptAes256Gcm(data, deriveKey(key));
  }

  /**
   * 현재 파이프라인의 단계 수를 반환합니다.
   */
  get stepCount(): number {
    return this.steps.length;
  }

  /**
   * 파이프라인을 복제합니다.
   */
  clone(): DduPipeline {
    const cloned = new DduPipeline();
    cloned.steps = [...this.steps];
    return cloned;
  }

  /**
   * 파이프라인을 초기화합니다.
   */
  clear(): DduPipeline {
    this.steps = [];
    return this;
  }
}

