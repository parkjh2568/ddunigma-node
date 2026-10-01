/**
 * Encode post-processing.
 *
 * The ordering is part of the wire compatibility contract:
 * obfuscation -> checksum -> URL-safe -> chunking.
 *
 * @module core/internal/EncodeFinalize
 */

import { removeChunks, splitIntoChunks, toUrlSafe } from "../codecUtils.js";
import { CHECKSUM_MARKER_SCOPED, type ChecksumScope } from "../wireFormat.js";
import type { ObfuscationLayer } from "../types.js";
import { Ddu64EncodeError } from "../errors.js";

export interface ApplyPostEncodingOptions {
  encoded: string;
  checksum: string;
  shouldChecksum: boolean;
  /** 체크섬 scope — 스코프 마커에 P|O로 자기기술됨 */
  checksumScope: ChecksumScope;
  chunkSize: number | undefined;
  chunkSeparator: string;
  urlSafe: boolean;
  obfuscate: boolean;
  getObfuscationLayer(): ObfuscationLayer;
}

export function applyPostEncoding(options: ApplyPostEncodingOptions): string {
  let result = options.encoded;

  if (options.obfuscate) {
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
    const separator = options.chunkSeparator;
    if (
      separator !== "" &&
      separator !== "\n" &&
      separator !== "\r\n" &&
      separator !== "\r" &&
      result.includes(separator)
    ) {
      throw new Ddu64EncodeError(
        `[Ddu64 chunking] Unsafe chunkSeparator "${separator}" appears in encoded output. ` +
          "Use a separator that cannot be produced by the charset, footer, checksum, or URL-safe output.",
      );
    }
    const chunked = splitIntoChunks(result, options.chunkSize, separator);
    // 본문에 없는 구분자도 청크 경계와 중첩되면 replaceAll이 원문을 손상시킵니다.
    if (separator.length > 1 && removeChunks(chunked, separator) !== result) {
      throw new Ddu64EncodeError(
        "[Ddu64 chunking] chunkSeparator overlaps a boundary. Use a separator outside the alphabet.",
      );
    }
    result = chunked;
  }

  return result;
}
