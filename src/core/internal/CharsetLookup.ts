/**
 * Charset lookup table builders.
 *
 * @module core/internal/CharsetLookup
 */

export interface CharsetLookupTables {
  charCodeLookup: Int32Array;
  charCodes: Uint16Array;
}

export function buildCharsetLookupTables(charset: readonly string[]): CharsetLookupTables {
  const charCodeLookup = new Int32Array(65536);
  charCodeLookup.fill(-1);

  const charCodes = new Uint16Array(charset.length);
  for (let i = 0; i < charset.length; i++) {
    const code = charset[i].charCodeAt(0);
    charCodeLookup[code] = i;
    charCodes[i] = code;
  }

  return { charCodeLookup, charCodes };
}
