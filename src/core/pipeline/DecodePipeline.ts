/**
 * Shared sync/async decode pipeline shell.
 *
 * @module core/pipeline/DecodePipeline
 */

import { calculateCRC32, constantTimeEquals } from "../codecUtils.js";
import type { DduOptions, DduProgressInfo } from "../types.js";
import { Ddu64ChecksumError } from "../errors.js";
import { normalizeLimit } from "../internal/DecodeValidation.js";
import type { DecodePreludeResult } from "../internal/DecodePrelude.js";

type CompressionAlgorithm = "deflate" | "brotli";

export interface DecodePipelineContext {
  encryptionKey: string | undefined;
  defaultMaxDecompressedBytes: number;
  reportProgress(info: DduProgressInfo): void;
}

export interface SyncDecodePipelineContext extends DecodePipelineContext {
  decrypt(data: Uint8Array, aad?: Uint8Array): Uint8Array;
  decompress(data: Uint8Array, algorithm: CompressionAlgorithm, maxBytes: number): Uint8Array;
}

export interface AsyncDecodePipelineContext extends DecodePipelineContext {
  decrypt(data: Uint8Array, aad?: Uint8Array): Promise<Uint8Array>;
  decompress(
    data: Uint8Array,
    algorithm: CompressionAlgorithm,
    maxBytes: number,
  ): Promise<Uint8Array>;
}

export function runSyncDecodePipeline(
  prep: DecodePreludeResult,
  options: DduOptions | undefined,
  context: SyncDecodePipelineContext,
): Uint8Array {
  let decoded = prep.decoded;
  // 스코프 CK 마커는 scope 자기기술 → 권위. 레거시 CHK(scope=null)는 4.x 기본인 "plaintext"로 폴백.
  // (인코드 기본값 전환과 무관하게 레거시 데이터의 의미를 보존)
  const checksumScope = prep.extractedChecksumScope ?? options?.checksumScope ?? "plaintext";

  if (checksumScope === "output") verifyWireChecksum(prep, context);
  if (shouldRunPreDecompressDecrypt(prep, context)) {
    reportStage(context, decoded.length, 55, "decrypt");
    decoded = context.decrypt(decoded, prep.encryptionAAD);
  }
  if (shouldDecompress(prep)) {
    const maxDecompressedBytes = normalizeLimit(
      options?.maxDecompressedBytes,
      context.defaultMaxDecompressedBytes,
      true,
      "maxDecompressedBytes",
    );
    reportStage(context, decoded.length, 70, "decompress");
    decoded = context.decompress(decoded, prep.compressionAlgorithm, maxDecompressedBytes);
  }
  if (checksumScope === "plaintext") verifyDecodedChecksum(prep, context, decoded);
  if (shouldRunPostChecksumDecrypt(prep, context)) {
    reportStage(context, decoded.length, 90, "decrypt");
    decoded = context.decrypt(decoded, prep.encryptionAAD);
  }
  reportStage(context, decoded.length, 100, "done");

  return decoded;
}

export async function runAsyncDecodePipeline(
  prep: DecodePreludeResult,
  options: DduOptions | undefined,
  context: AsyncDecodePipelineContext,
): Promise<Uint8Array> {
  let decoded = prep.decoded;
  const checksumScope = prep.extractedChecksumScope ?? options?.checksumScope ?? "plaintext";

  if (checksumScope === "output") verifyWireChecksum(prep, context);

  if (shouldRunPreDecompressDecrypt(prep, context)) {
    reportStage(context, decoded.length, 55, "decrypt");
    decoded = await context.decrypt(decoded, prep.encryptionAAD);
  }

  if (shouldDecompress(prep)) {
    const maxDecompressedBytes = normalizeLimit(
      options?.maxDecompressedBytes,
      context.defaultMaxDecompressedBytes,
      true,
      "maxDecompressedBytes",
    );
    reportStage(context, decoded.length, 70, "decompress");
    decoded = await context.decompress(decoded, prep.compressionAlgorithm, maxDecompressedBytes);
  }

  if (checksumScope === "plaintext") verifyDecodedChecksum(prep, context, decoded);

  if (shouldRunPostChecksumDecrypt(prep, context)) {
    reportStage(context, decoded.length, 90, "decrypt");
    decoded = await context.decrypt(decoded, prep.encryptionAAD);
  }

  reportStage(context, decoded.length, 100, "done");
  return decoded;
}

function shouldRunPreDecompressDecrypt(
  prep: DecodePreludeResult,
  context: DecodePipelineContext,
): boolean {
  return (
    (prep.pipelineVersion === 3 || prep.pipelineVersion === 4) &&
    prep.isEncrypted &&
    !!context.encryptionKey &&
    prep.allowInternalDecrypt
  );
}

function shouldRunPostChecksumDecrypt(
  prep: DecodePreludeResult,
  context: DecodePipelineContext,
): boolean {
  return (
    prep.pipelineVersion === 2 &&
    prep.isEncrypted &&
    !!context.encryptionKey &&
    prep.allowInternalDecrypt
  );
}

function shouldDecompress(
  prep: DecodePreludeResult,
): prep is DecodePreludeResult & { compressionAlgorithm: CompressionAlgorithm } {
  return (
    !!prep.compressionAlgorithm &&
    prep.allowInternalDecompress &&
    (prep.pipelineVersion === 2 || !prep.isEncrypted || prep.allowInternalDecrypt)
  );
}

function verifyWireChecksum(prep: DecodePreludeResult, context: DecodePipelineContext): void {
  if (!prep.extractedChecksum) return;
  // "output" 범위: 디코딩된 와이어 바이트(복호화/압축해제 이전)에 대해 검증합니다.
  reportStage(context, prep.decoded.length, 85, "checksum");
  const calculatedChecksum = calculateCRC32(prep.decoded);
  if (!constantTimeEquals(calculatedChecksum, prep.extractedChecksum)) {
    throw new Ddu64ChecksumError(
      `[Ddu64 decode] Checksum mismatch. Expected: ${prep.extractedChecksum}, Got: ${calculatedChecksum}`,
    );
  }
}

function verifyDecodedChecksum(
  prep: DecodePreludeResult,
  context: DecodePipelineContext,
  decoded: Uint8Array,
): void {
  if (!prep.extractedChecksum) return;
  if (!(prep.pipelineVersion === 2 || !prep.isEncrypted || prep.allowInternalDecrypt)) return;

  reportStage(context, decoded.length, 85, "checksum");
  const calculatedChecksum = calculateCRC32(decoded);
  if (!constantTimeEquals(calculatedChecksum, prep.extractedChecksum)) {
    throw new Ddu64ChecksumError(
      `[Ddu64 decode] Checksum mismatch. Expected: ${prep.extractedChecksum}, Got: ${calculatedChecksum}`,
    );
  }
}

function reportStage(
  context: DecodePipelineContext,
  length: number,
  percent: number,
  stage: DduProgressInfo["stage"],
): void {
  context.reportProgress({
    processedBytes: length,
    totalBytes: length,
    percent,
    stage,
  });
}
