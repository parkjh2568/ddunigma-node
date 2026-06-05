/**
 * Encode footer and post-processing helpers.
 *
 * The ordering is part of the wire compatibility contract:
 * obfuscation -> checksum -> URL-safe -> chunking.
 *
 * @module core/internal/EncodeFinalize
 */

import { splitIntoChunks, toUrlSafe } from "../codecUtils.js";
import {
  buildFooter,
  CHECKSUM_MARKER_V5,
  type ChecksumScope,
  type PipelineVersion,
} from "../wireFormat.js";
import type { DduOptions, ObfuscationLayer } from "../types.js";

export interface BuildEncodeFooterOptions {
  paddingBits: number;
  compressionAlgorithm?: "deflate" | "brotli";
  isEncrypted: boolean;
  paddingChar: string;
  useRepeatPadding: boolean;
  bitsPerPadChar: number;
  pipelineVersion: PipelineVersion;
  omitFooter?: boolean;
}

export interface ApplyPostEncodingOptions {
  encoded: string;
  options: DduOptions | undefined;
  checksum: string;
  shouldChecksum: boolean;
  /** 체크섬 scope — V5 마커에 P|O로 자기기술됨 */
  checksumScope: ChecksumScope;
  chunkSize: number | undefined;
  chunkSeparator: string;
  urlSafe: boolean;
  shouldObfuscate(options?: DduOptions): boolean;
  getObfuscationLayer(): ObfuscationLayer;
  assertSafeChunkSeparator(encoded: string, separator: string): void;
}

export function buildEncodeFooter(options: BuildEncodeFooterOptions): string {
  if (options.omitFooter) return "";

  return buildFooter({
    paddingBits: options.paddingBits,
    compressionAlgorithm: options.compressionAlgorithm,
    isEncrypted: options.isEncrypted,
    paddingChar: options.paddingChar,
    useRepeatPadding:
      options.useRepeatPadding && !options.compressionAlgorithm && !options.isEncrypted,
    bitsPerPadChar: options.bitsPerPadChar,
    pipelineVersion: options.isEncrypted ? options.pipelineVersion : 2,
  });
}

export function applyPostEncoding(options: ApplyPostEncodingOptions): string {
  let result = options.encoded;

  if (options.shouldObfuscate(options.options)) {
    result = options.getObfuscationLayer().obfuscate(result);
  }

  if (options.shouldChecksum && options.checksum) {
    // V5: 체크섬 마커에 scope를 자기기술(P=plaintext, O=output)
    const scopeChar = options.checksumScope === "plaintext" ? "P" : "O";
    result = result + CHECKSUM_MARKER_V5 + scopeChar + options.checksum;
  }

  if (options.urlSafe) {
    result = toUrlSafe(result);
  }

  if (options.chunkSize && options.chunkSize > 0) {
    options.assertSafeChunkSeparator(result, options.chunkSeparator);
    result = splitIntoChunks(result, options.chunkSize, options.chunkSeparator);
  }

  return result;
}
