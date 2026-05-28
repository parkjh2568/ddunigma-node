/**
 * Obfuscation alphabet builder.
 *
 * @module core/internal/ObfuscationAlphabet
 */

import {
  BROTLI_MARKER,
  COMPRESS_MARKER,
  ENCRYPT_MARKER,
  PIPELINE_V3_MARKER,
  PIPELINE_V4_MARKER,
} from "../wireFormat.js";

export function buildObfuscationAlphabet(dduChar: readonly string[], paddingChar: string): string[] {
  const alphabetSet = new Set<string>(dduChar);
  alphabetSet.add(paddingChar);

  const footerMarkers =
    COMPRESS_MARKER + BROTLI_MARKER + ENCRYPT_MARKER + PIPELINE_V3_MARKER + PIPELINE_V4_MARKER;
  for (const ch of footerMarkers) {
    alphabetSet.add(ch);
  }

  for (const ch of "0123456789") {
    alphabetSet.add(ch);
  }

  return [...alphabetSet];
}
