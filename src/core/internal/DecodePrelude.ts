/**
 * Shared decode prelude for sync and async decode paths.
 *
 * The prelude performs all pure string/wire-format preparation before the
 * compression/decryption pipeline runs.
 *
 * @module core/internal/DecodePrelude
 */

import { fromUrlSafe, removeChunks } from "../codecUtils.js";
import {
  buildEncryptionAAD,
  extractChecksum,
  parseFooter,
  type PipelineVersion,
} from "../wireFormat.js";
import type { DduOptions } from "../types.js";
import {
  assertCanonicalPadding,
  assertEncodedInputAligned,
  estimateDecodedBytes,
  normalizeLimit,
} from "./DecodeValidation.js";

export interface DecodePreludeContext {
  defaultChecksum: boolean;
  defaultChunkSeparator: string;
  defaultMaxDecodedBytes: number;
  urlSafe: boolean;
  paddingChar: string;
  bitLength: number;
  bitsPerPadChar: number;
  usePowerOfTwo: boolean;
  dduCharCodeLookup: Int32Array;
  charSetSize: number;
  encryptionKey: string | undefined;
  shouldObfuscate(options?: DduOptions): boolean;
  deobfuscate(input: string): string;
  decodeChars(cleanedInput: string, paddingBits: number): Uint8Array;
  reportDecodeStart(totalBytes: number): void;
  reportBitpackDecode(processedBytes: number, totalBytes: number): void;
}

export interface DecodePreludeResult {
  decoded: Uint8Array;
  extractedChecksum: string | null;
  compressionAlgorithm?: "deflate" | "brotli";
  isEncrypted: boolean;
  pipelineVersion: PipelineVersion;
  encryptionAAD?: Uint8Array;
  allowInternalDecompress: boolean;
  allowInternalDecrypt: boolean;
}

export function runDecodePrelude(
  input: string,
  options: DduOptions | undefined,
  context: DecodePreludeContext,
): DecodePreludeResult {
  const shouldChecksum = options?.checksum ?? context.defaultChecksum;
  const allowInternalDecompress = options?.compress !== false;
  const allowInternalDecrypt = options?.encrypt !== false;
  let workingInput = input;
  context.reportDecodeStart(input.length);

  const chunkSeparator = options?.chunkSeparator ?? context.defaultChunkSeparator;
  workingInput = removeChunks(workingInput, chunkSeparator);

  if (context.urlSafe) {
    workingInput = fromUrlSafe(workingInput);
  }

  let extractedChecksum: string | null = null;
  if (shouldChecksum) {
    const result = extractChecksum(workingInput);
    extractedChecksum = result.checksum;
    workingInput = result.data;
  }

  if (context.shouldObfuscate(options)) {
    workingInput = context.deobfuscate(workingInput);
  }

  const { cleanedInput, paddingBits, compressionAlgorithm, isEncrypted, pipelineVersion } =
    parseFooter(workingInput, context.paddingChar, context.bitLength, context.bitsPerPadChar);

  if (isEncrypted && allowInternalDecrypt && !context.encryptionKey) {
    throw new Error("[Ddu64 decode] Encrypted payload requires an encryptionKey");
  }
  const encryptionAAD =
    isEncrypted && pipelineVersion === 4
      ? buildEncryptionAAD({ compressionAlgorithm, pipelineVersion })
      : undefined;

  assertEncodedInputAligned(cleanedInput, context.usePowerOfTwo);
  assertCanonicalPadding(
    cleanedInput,
    paddingBits,
    context.usePowerOfTwo,
    context.dduCharCodeLookup,
    context.charSetSize,
  );

  const maxDecodedBytes = normalizeLimit(
    options?.maxDecodedBytes,
    context.defaultMaxDecodedBytes,
    true,
    "maxDecodedBytes",
  );
  const estimatedDecodedBytes = estimateDecodedBytes(
    cleanedInput.length,
    paddingBits,
    context.bitLength,
    context.usePowerOfTwo,
  );
  if (estimatedDecodedBytes > maxDecodedBytes) {
    throw new Error(
      `[Ddu64 decode] Decoded output exceeds limit. Estimated: ${estimatedDecodedBytes} bytes, Limit: ${maxDecodedBytes} bytes`,
    );
  }

  context.reportBitpackDecode(cleanedInput.length, input.length);
  const decoded = context.decodeChars(cleanedInput, paddingBits);

  return {
    decoded,
    extractedChecksum,
    compressionAlgorithm,
    isEncrypted,
    pipelineVersion,
    encryptionAAD,
    allowInternalDecompress,
    allowInternalDecrypt,
  };
}
