/**
 * Synchronous crypto/compression adapter gateway.
 *
 * Keeps sync-only adapter capability checks out of Ddu64Core while preserving
 * the existing public sync API behavior and error messages.
 *
 * @module core/internal/SyncAdapterGateway
 */

import type { KeyDerivationOptions, PlatformAdapter } from "../types.js";

export interface SyncAdapterGatewayContext {
  adapter: PlatformAdapter | undefined;
  encryptionKey: string | undefined;
  keyDerivation: KeyDerivationOptions | undefined;
  encryptionKeyHash: Uint8Array | undefined;
  setEncryptionKeyHash(hash: Uint8Array): void;
}

export function requireSyncAdapter(adapter: PlatformAdapter | undefined): PlatformAdapter {
  if (!adapter) {
    throw new Error(
      "[Ddu64 adapter] No platform adapter available. " +
        "Use encodeAsync()/decodeAsync() in browser environments, " +
        "or provide an adapter via options.adapter.",
    );
  }
  return adapter;
}

export function encryptSyncWithAdapter(
  context: SyncAdapterGatewayContext,
  data: Uint8Array,
): Uint8Array {
  const adapter = requireSyncAdapter(context.adapter);
  if (!adapter.encryptSync) {
    throw new Error(
      "[Ddu64 encrypt] Sync encryption unavailable. Use encodeAsync() in browser environments.",
    );
  }
  const keyHash = getSyncKeyHash(context, adapter, "encrypt");
  return adapter.encryptSync(data, keyHash);
}

export function decryptSyncWithAdapter(
  context: SyncAdapterGatewayContext,
  data: Uint8Array,
): Uint8Array {
  const adapter = requireSyncAdapter(context.adapter);
  if (!adapter.decryptSync) {
    throw new Error(
      "[Ddu64 decrypt] Sync decryption unavailable. Use decodeAsync() in browser environments.",
    );
  }
  const keyHash = getSyncKeyHash(context, adapter, "decrypt");
  return adapter.decryptSync(data, keyHash);
}

export function compressSyncWithAdapter(
  adapter: PlatformAdapter | undefined,
  data: Uint8Array,
  algorithm: "deflate" | "brotli",
  level: number,
): Uint8Array {
  const syncAdapter = requireSyncAdapter(adapter);
  if (algorithm === "brotli") {
    if (!syncAdapter.brotliCompressSync) {
      throw new Error(
        "[Ddu64 compress] Brotli compression is unavailable in the current runtime.",
      );
    }
    return syncAdapter.brotliCompressSync(data, level);
  }
  if (!syncAdapter.deflateSync) {
    throw new Error(
      "[Ddu64 compress] Sync compression unavailable. Use encodeAsync() in browser environments.",
    );
  }
  return syncAdapter.deflateSync(data, level);
}

export function decompressSyncWithAdapter(
  adapter: PlatformAdapter | undefined,
  data: Uint8Array,
  algorithm: "deflate" | "brotli",
  maxBytes: number,
): Uint8Array {
  const syncAdapter = requireSyncAdapter(adapter);
  if (algorithm === "brotli") {
    if (!syncAdapter.brotliDecompressSync) {
      throw new Error(
        "[Ddu64 decompress] Brotli decompression is unavailable in the current runtime.",
      );
    }
    return syncAdapter.brotliDecompressSync(data, maxBytes);
  }
  if (!syncAdapter.inflateSync) {
    throw new Error(
      "[Ddu64 decompress] Sync decompression unavailable. Use decodeAsync() in browser environments.",
    );
  }
  return syncAdapter.inflateSync(data, maxBytes);
}

function getSyncKeyHash(
  context: SyncAdapterGatewayContext,
  adapter: PlatformAdapter,
  operation: "encrypt" | "decrypt",
): Uint8Array {
  if (context.encryptionKeyHash) return context.encryptionKeyHash;
  if (!adapter.deriveKeySync) {
    const action = operation === "encrypt" ? "encodeAsync" : "decodeAsync";
    throw new Error(
      `[Ddu64 ${operation}] Sync key derivation unavailable. Use ${action}() in browser environments.`,
    );
  }
  const hash = adapter.deriveKeySync(context.encryptionKey!, context.keyDerivation);
  context.setEncryptionKeyHash(hash);
  return hash;
}

