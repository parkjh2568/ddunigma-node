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

  decoded = runPreDecompressDecrypt(prep, context, decoded);
  decoded = runDecompress(prep, options, context, decoded);
  verifyDecodedChecksum(prep, context, options, decoded);
  decoded = runPostChecksumDecrypt(prep, context, decoded);
  reportDone(context, decoded);

  return decoded;
}

export async function runAsyncDecodePipeline(
  prep: DecodePreludeResult,
  options: DduOptions | undefined,
  context: AsyncDecodePipelineContext,
): Promise<Uint8Array> {
  let decoded = prep.decoded;

  if (shouldRunPreDecompressDecrypt(prep, context)) {
    context.reportProgress({
      processedBytes: decoded.length,
      totalBytes: decoded.length,
      percent: 55,
      stage: "decrypt",
    });
    decoded = await context.decrypt(decoded, prep.encryptionAAD);
  }

  if (shouldDecompress(prep)) {
    const maxDecompressedBytes = getMaxDecompressedBytes(options, context);
    context.reportProgress({
      processedBytes: decoded.length,
      totalBytes: decoded.length,
      percent: 70,
      stage: "decompress",
    });
    decoded = await context.decompress(decoded, prep.compressionAlgorithm!, maxDecompressedBytes);
  }

  verifyDecodedChecksum(prep, context, options, decoded);

  if (shouldRunPostChecksumDecrypt(prep, context)) {
    context.reportProgress({
      processedBytes: decoded.length,
      totalBytes: decoded.length,
      percent: 90,
      stage: "decrypt",
    });
    decoded = await context.decrypt(decoded, prep.encryptionAAD);
  }

  reportDone(context, decoded);
  return decoded;
}

function runPreDecompressDecrypt(
  prep: DecodePreludeResult,
  context: SyncDecodePipelineContext,
  decoded: Uint8Array,
): Uint8Array {
  if (!shouldRunPreDecompressDecrypt(prep, context)) return decoded;
  context.reportProgress({
    processedBytes: decoded.length,
    totalBytes: decoded.length,
    percent: 55,
    stage: "decrypt",
  });
  return context.decrypt(decoded, prep.encryptionAAD);
}

function runDecompress(
  prep: DecodePreludeResult,
  options: DduOptions | undefined,
  context: SyncDecodePipelineContext,
  decoded: Uint8Array,
): Uint8Array {
  if (!shouldDecompress(prep)) return decoded;
  const maxDecompressedBytes = getMaxDecompressedBytes(options, context);
  context.reportProgress({
    processedBytes: decoded.length,
    totalBytes: decoded.length,
    percent: 70,
    stage: "decompress",
  });
  return context.decompress(decoded, prep.compressionAlgorithm!, maxDecompressedBytes);
}

function runPostChecksumDecrypt(
  prep: DecodePreludeResult,
  context: SyncDecodePipelineContext,
  decoded: Uint8Array,
): Uint8Array {
  if (!shouldRunPostChecksumDecrypt(prep, context)) return decoded;
  context.reportProgress({
    processedBytes: decoded.length,
    totalBytes: decoded.length,
    percent: 90,
    stage: "decrypt",
  });
  return context.decrypt(decoded, prep.encryptionAAD);
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

function verifyDecodedChecksum(
  prep: DecodePreludeResult,
  context: DecodePipelineContext,
  options: DduOptions | undefined,
  decoded: Uint8Array,
): void {
  if (!prep.extractedChecksum) return;
  if (!(prep.pipelineVersion === 2 || !prep.isEncrypted || prep.allowInternalDecrypt)) return;

  context.reportProgress({
    processedBytes: decoded.length,
    totalBytes: decoded.length,
    percent: 85,
    stage: "checksum",
  });
  const calculatedChecksum = calculateCRC32(decoded);
  if (!constantTimeEquals(calculatedChecksum, prep.extractedChecksum)) {
    throw new Ddu64ChecksumError(
      `[Ddu64 decode] Checksum mismatch. Expected: ${prep.extractedChecksum}, Got: ${calculatedChecksum}`,
    );
  }
}

function getMaxDecompressedBytes(
  options: DduOptions | undefined,
  context: DecodePipelineContext,
): number {
  return normalizeLimit(
    options?.maxDecompressedBytes,
    context.defaultMaxDecompressedBytes,
    true,
    "maxDecompressedBytes",
  );
}

function reportDone(context: DecodePipelineContext, decoded: Uint8Array): void {
  context.reportProgress({
    processedBytes: decoded.length,
    totalBytes: decoded.length,
    percent: 100,
    stage: "done",
  });
}
