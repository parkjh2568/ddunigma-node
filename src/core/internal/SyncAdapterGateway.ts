/**
 * Synchronous crypto/compression adapter gateway.
 *
 * Keeps sync-only adapter capability checks out of Ddu64Core while preserving
 * the existing public sync API behavior and error messages.
 *
 * @module core/internal/SyncAdapterGateway
 */

import type { KeyDerivationOptions, PlatformAdapter } from "../types.js";
import { Ddu64AdapterError } from "../errors.js";

type SyncGatewayOperation = "encode" | "decode";

export interface SyncAdapterGatewayContext {
  adapter: PlatformAdapter | undefined;
  encryptionKey: string | undefined;
  keyDerivation: KeyDerivationOptions | undefined;
  encryptionKeyHash: Uint8Array | undefined;
  encryptionKeyHashPromise?: Promise<Uint8Array>;
  setEncryptionKeyHash(hash: Uint8Array): void;
}

export function requireSyncAdapter(
  adapter: PlatformAdapter | undefined,
  operation: SyncGatewayOperation,
): PlatformAdapter {
  if (!adapter) {
    throw new Ddu64AdapterError(
      "[Ddu64 adapter] No platform adapter available. " +
        "Use encodeAsync()/decodeAsync() in browser environments, " +
        "or provide an adapter via options.adapter.",
      operation,
    );
  }
  return adapter;
}

export function encryptSyncWithAdapter(
  context: SyncAdapterGatewayContext,
  data: Uint8Array,
  aad?: Uint8Array,
): Uint8Array {
  const adapter = requireSyncAdapter(context.adapter, "encode");
  if (!adapter.encryptSync) {
    throw new Ddu64AdapterError(
      "[Ddu64 encrypt] Sync encryption unavailable. Use encodeAsync() in browser environments.",
      "encode",
    );
  }
  const keyHash = getSyncKeyHash(context, adapter, "encrypt", "encode");
  return adapter.encryptSync(data, keyHash, aad);
}

export function decryptSyncWithAdapter(
  context: SyncAdapterGatewayContext,
  data: Uint8Array,
  aad?: Uint8Array,
): Uint8Array {
  const adapter = requireSyncAdapter(context.adapter, "decode");
  if (!adapter.decryptSync) {
    throw new Ddu64AdapterError(
      "[Ddu64 decrypt] Sync decryption unavailable. Use decodeAsync() in browser environments.",
      "decode",
    );
  }
  const keyHash = getSyncKeyHash(context, adapter, "decrypt", "decode");
  return adapter.decryptSync(data, keyHash, aad);
}

export function compressSyncWithAdapter(
  adapter: PlatformAdapter | undefined,
  data: Uint8Array,
  algorithm: "deflate" | "brotli",
  level: number,
): Uint8Array {
  const syncAdapter = requireSyncAdapter(adapter, "encode");
  if (algorithm === "brotli") {
    if (!syncAdapter.brotliCompressSync) {
      throw new Ddu64AdapterError(
        "[Ddu64 compress] Brotli compression is unavailable in the current runtime.",
        "encode",
      );
    }
    return syncAdapter.brotliCompressSync(data, level);
  }
  if (!syncAdapter.deflateSync) {
    throw new Ddu64AdapterError(
      "[Ddu64 compress] Sync compression unavailable. Use encodeAsync() in browser environments.",
      "encode",
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
  const syncAdapter = requireSyncAdapter(adapter, "decode");
  if (algorithm === "brotli") {
    if (!syncAdapter.brotliDecompressSync) {
      throw new Ddu64AdapterError(
        "[Ddu64 decompress] Brotli decompression is unavailable in the current runtime.",
        "decode",
      );
    }
    return syncAdapter.brotliDecompressSync(data, maxBytes);
  }
  if (!syncAdapter.inflateSync) {
    throw new Ddu64AdapterError(
      "[Ddu64 decompress] Sync decompression unavailable. Use decodeAsync() in browser environments.",
      "decode",
    );
  }
  return syncAdapter.inflateSync(data, maxBytes);
}

function getSyncKeyHash(
  context: SyncAdapterGatewayContext,
  adapter: PlatformAdapter,
  operation: "encrypt" | "decrypt",
  gatewayOperation: SyncGatewayOperation,
): Uint8Array {
  if (context.encryptionKeyHash) return context.encryptionKeyHash;
  if (!adapter.deriveKeySync) {
    const action = operation === "encrypt" ? "encodeAsync" : "decodeAsync";
    throw new Ddu64AdapterError(
      `[Ddu64 ${operation}] Sync key derivation unavailable. Use ${action}() in browser environments.`,
      gatewayOperation,
    );
  }
  const hash = adapter.deriveKeySync(context.encryptionKey!, context.keyDerivation);
  context.setEncryptionKeyHash(hash);
  return hash;
}
