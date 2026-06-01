/**
 * Adapter capability error classification helpers.
 *
 * @module core/internal/AdapterCapability
 */

export function isAdapterCapabilityErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("adapter") || lower.includes("sync") || lower.includes("provider");
}
