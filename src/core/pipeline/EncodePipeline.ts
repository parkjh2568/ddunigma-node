/**
 * Shared sync/async encode pipeline shell.
 *
 * @module core/pipeline/EncodePipeline
 */

import { calculateCRC32, normalizeCompressionLevel, stringToBytes } from "../codecUtils.js";
import type { DduOptions, DduProgressInfo } from "../types.js";

type CompressionAlgorithm = "deflate" | "brotli";

interface EncodePipelineBaseContext {
  defaultCompress: boolean;
  defaultChecksum: boolean;
  defaultChunkSize: number | undefined;
  defaultChunkSeparator: string;
  defaultCompressionLevel: number;
  defaultCompressionAlgorithm: CompressionAlgorithm;
  hasEncryptionKey: boolean;
  reportProgress(info: DduProgressInfo): void;
  getEncryptionAAD(compressionAlgorithm: CompressionAlgorithm | undefined): Uint8Array;
  finalize(
    workingData: Uint8Array,
    compressionAlgorithm: CompressionAlgorithm | undefined,
    isEncrypted: boolean,
    checksum: string,
    shouldChecksum: boolean,
    chunkSize: number | undefined,
    chunkSeparator: string,
  ): string;
}

export interface SyncEncodePipelineContext extends EncodePipelineBaseContext {
  compress(data: Uint8Array, algorithm: CompressionAlgorithm, level: number): Uint8Array;
  encrypt(data: Uint8Array, aad: Uint8Array): Uint8Array;
}

export interface AsyncEncodePipelineContext extends EncodePipelineBaseContext {
  compress(data: Uint8Array, algorithm: CompressionAlgorithm, level: number): Promise<Uint8Array>;
  encrypt(data: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;
}

export interface EncodePipelineResult {
  encoded: string;
  compressedSize?: number;
}

export function runSyncEncodePipeline(
  input: Uint8Array | string,
  options: DduOptions | undefined,
  context: SyncEncodePipelineContext,
): EncodePipelineResult {
  const settings = resolveEncodeSettings(options, context);
  let workingData = typeof input === "string" ? stringToBytes(input) : input;
  reportStart(context, workingData.length);

  const checksum = settings.shouldChecksum ? calculateCRC32(workingData) : "";

  let compressionAlgorithm: CompressionAlgorithm | undefined;
  let compressedSize: number | undefined;
  if (settings.shouldCompress) {
    const algo = options?.compressionAlgorithm ?? context.defaultCompressionAlgorithm;
    const level = normalizeCompressionLevel(
      options?.compressionLevel ?? context.defaultCompressionLevel,
      algo,
    );
    reportCompress(context, workingData.length);
    const compressed = context.compress(workingData, algo, level);
    compressedSize = compressed.length;
    if (compressed.length < workingData.length) {
      workingData = compressed;
      compressionAlgorithm = algo;
    }
  }

  let isEncrypted = false;
  if (settings.shouldEncrypt) {
    reportEncrypt(context, workingData.length);
    workingData = context.encrypt(workingData, context.getEncryptionAAD(compressionAlgorithm));
    isEncrypted = true;
  }

  return {
    encoded: context.finalize(
      workingData,
      compressionAlgorithm,
      isEncrypted,
      checksum,
      settings.shouldChecksum,
      settings.chunkSize,
      settings.chunkSeparator,
    ),
    compressedSize,
  };
}

export async function runAsyncEncodePipeline(
  input: Uint8Array | string,
  options: DduOptions | undefined,
  context: AsyncEncodePipelineContext,
): Promise<string> {
  const settings = resolveEncodeSettings(options, context);
  let workingData = typeof input === "string" ? stringToBytes(input) : input;
  reportStart(context, workingData.length);

  const checksum = settings.shouldChecksum ? calculateCRC32(workingData) : "";

  let compressionAlgorithm: CompressionAlgorithm | undefined;
  if (settings.shouldCompress) {
    const algo = options?.compressionAlgorithm ?? context.defaultCompressionAlgorithm;
    const level = normalizeCompressionLevel(
      options?.compressionLevel ?? context.defaultCompressionLevel,
      algo,
    );
    reportCompress(context, workingData.length);
    const compressed = await context.compress(workingData, algo, level);
    if (compressed.length < workingData.length) {
      workingData = compressed;
      compressionAlgorithm = algo;
    }
  }

  let isEncrypted = false;
  if (settings.shouldEncrypt) {
    reportEncrypt(context, workingData.length);
    workingData = await context.encrypt(workingData, context.getEncryptionAAD(compressionAlgorithm));
    isEncrypted = true;
  }

  return context.finalize(
    workingData,
    compressionAlgorithm,
    isEncrypted,
    checksum,
    settings.shouldChecksum,
    settings.chunkSize,
    settings.chunkSeparator,
  );
}

function resolveEncodeSettings(
  options: DduOptions | undefined,
  context: EncodePipelineBaseContext,
): {
  shouldCompress: boolean;
  shouldChecksum: boolean;
  shouldEncrypt: boolean;
  chunkSize: number | undefined;
  chunkSeparator: string;
} {
  return {
    shouldCompress: options?.compress ?? context.defaultCompress,
    shouldChecksum: options?.checksum ?? context.defaultChecksum,
    shouldEncrypt: (options?.encrypt ?? true) && context.hasEncryptionKey,
    chunkSize: options?.chunkSize ?? context.defaultChunkSize,
    chunkSeparator: options?.chunkSeparator ?? context.defaultChunkSeparator,
  };
}

function reportStart(context: EncodePipelineBaseContext, totalBytes: number): void {
  context.reportProgress({
    processedBytes: 0,
    totalBytes,
    percent: 0,
    stage: "start",
  });
}

function reportCompress(context: EncodePipelineBaseContext, bytes: number): void {
  context.reportProgress({
    processedBytes: bytes,
    totalBytes: bytes,
    percent: 20,
    stage: "compress",
  });
}

function reportEncrypt(context: EncodePipelineBaseContext, bytes: number): void {
  context.reportProgress({
    processedBytes: bytes,
    totalBytes: bytes,
    percent: 45,
    stage: "encrypt",
  });
}
