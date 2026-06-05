/**
 * Adapter capability error classification helpers.
 *
 * @module core/internal/AdapterCapability
 */

export function isAdapterCapabilityErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("[ddu64 adapter]") ||
    lower.includes("no platform adapter available") ||
    lower.includes("sync encryption unavailable") ||
    lower.includes("sync decryption unavailable") ||
    lower.includes("sync compression unavailable") ||
    lower.includes("sync decompression unavailable") ||
    lower.includes("sync key derivation unavailable") ||
    lower.includes("brotli compression is unavailable") ||
    lower.includes("brotli decompression is unavailable") ||
    lower.includes("compressionstream/decompressionstream does not support") ||
    lower.includes("crypto provider unavailable")
  );
}
