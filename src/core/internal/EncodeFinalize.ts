/**
 * Encode post-processing.
 *
 * The ordering is part of the wire compatibility contract:
 * obfuscation -> checksum -> URL-safe -> chunking.
 *
 * @module core/internal/EncodeFinalize
 */

import { splitIntoChunks, toUrlSafe } from "../codecUtils.js";
import { CHECKSUM_MARKER_SCOPED, type ChecksumScope } from "../wireFormat.js";
import type { DduOptions, ObfuscationLayer } from "../types.js";

export interface ApplyPostEncodingOptions {
  encoded: string;
  options: DduOptions | undefined;
  checksum: string;
  shouldChecksum: boolean;
  /** 체크섬 scope — 스코프 마커에 P|O로 자기기술됨 */
  checksumScope: ChecksumScope;
  chunkSize: number | undefined;
  chunkSeparator: string;
  urlSafe: boolean;
  shouldObfuscate(options?: DduOptions): boolean;
  getObfuscationLayer(): ObfuscationLayer;
  assertSafeChunkSeparator(encoded: string, separator: string): void;
}

export function applyPostEncoding(options: ApplyPostEncodingOptions): string {
  let result = options.encoded;

  if (options.shouldObfuscate(options.options)) {
    result = options.getObfuscationLayer().obfuscate(result);
  }

  if (options.shouldChecksum && options.checksum) {
    // 스코프 마커: 체크섬 마커에 scope를 자기기술(P=plaintext, O=output)
    const scopeChar = options.checksumScope === "plaintext" ? "P" : "O";
    result = result + CHECKSUM_MARKER_SCOPED + scopeChar + options.checksum;
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
