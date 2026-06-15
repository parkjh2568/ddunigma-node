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
  extractChecksumV5,
  parseFooter,
  type ChecksumScope,
  type PipelineVersion,
} from "../wireFormat.js";
import type { DduOptions } from "../types.js";
import { Ddu64ChecksumError, Ddu64DecryptionError } from "../errors.js";
import {
  assertCanonicalPadding,
  assertDecodedBitLength,
  assertEncodedInputAligned,
  estimateDecodedBytes,
  normalizeLimit,
} from "./DecodeValidation.js";

export interface DecodePreludeContext {
  defaultChecksum: boolean;
  defaultChunkSeparator: string;
  defaultMaxDecodedBytes: number;
  defaultMaxEncodedChars: number;
  urlSafe: boolean;
  paddingChar: string;
  bitLength: number;
  bitsPerPadChar: number;
  usePowerOfTwo: boolean;
  dduCharCodeLookup: Int32Array;
  dduCharCodeLookupOffset: number;
  charSetSize: number;
  encryptionKey: string | undefined;
  defaultRequireEncryption: boolean;
  shouldObfuscate(options?: DduOptions): boolean;
  deobfuscate(input: string): string;
  decodeChars(cleanedInput: string, paddingBits: number): Uint8Array;
  reportDecodeStart(totalBytes: number): void;
  reportBitpackDecode(processedBytes: number, totalBytes: number): void;
}

export interface DecodePreludeResult {
  decoded: Uint8Array;
  extractedChecksum: string | null;
  /** V5 마커에서 자동 감지된 체크섬 scope (레거시/없음이면 null → 옵션/기본값으로 결정) */
  extractedChecksumScope: ChecksumScope | null;
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

  // 전처리(청크/개행 제거, URL-safe 역변환, 문자열 복사) 이전에 입력 길이를 선검사합니다.
  // 개행만 가득한 거대한 입력이 출력 한도(maxDecodedBytes)를 우회하면서 대량 문자열
  // 복사/스캔을 유발하는 것을 차단합니다.
  const maxEncodedChars = normalizeLimit(
    options?.maxEncodedChars,
    context.defaultMaxEncodedChars,
    true,
    "maxEncodedChars",
  );
  if (input.length > maxEncodedChars) {
    throw new Error(
      `[Ddu64 decode] Encoded input exceeds limit. Length: ${input.length}, Limit: ${maxEncodedChars} characters`,
    );
  }

  const chunkSeparator = options?.chunkSeparator ?? context.defaultChunkSeparator;
  workingInput = removeChunks(workingInput, chunkSeparator);

  if (context.urlSafe) {
    workingInput = fromUrlSafe(workingInput);
  }

  let extractedChecksum: string | null = null;
  let extractedChecksumScope: ChecksumScope | null = null;
  if (shouldChecksum) {
    const result = extractChecksumV5(workingInput);
    extractedChecksum = result.checksum;
    extractedChecksumScope = result.scope;
    workingInput = result.data;
    if (!extractedChecksum) {
      throw new Ddu64ChecksumError(
        "[Ddu64 checksum] Checksum verification requested, but no checksum marker was found.",
      );
    }
  }

  if (context.shouldObfuscate(options)) {
    workingInput = context.deobfuscate(workingInput);
  }

  const { cleanedInput, paddingBits, compressionAlgorithm, isEncrypted, pipelineVersion } =
    parseFooter(workingInput, context.paddingChar, context.bitLength, context.bitsPerPadChar);

  const requireEncryption = options?.requireEncryption ?? context.defaultRequireEncryption;
  if (requireEncryption && allowInternalDecrypt && !isEncrypted) {
    throw new Ddu64DecryptionError(
      "[Ddu64 decode] Encryption is required, but the payload has no authenticated encryption footer.",
    );
  }
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
    context.dduCharCodeLookupOffset,
  );
  assertDecodedBitLength(cleanedInput, paddingBits, context.bitLength, context.usePowerOfTwo);

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
    extractedChecksumScope,
    compressionAlgorithm,
    isEncrypted,
    pipelineVersion,
    encryptionAAD,
    allowInternalDecompress,
    allowInternalDecrypt,
  };
}
