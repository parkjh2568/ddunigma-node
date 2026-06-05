/**
 * Asynchronous crypto/compression adapter gateway.
 *
 * @module core/internal/AsyncAdapterGateway
 */

import {
  Ddu64AdapterError,
  Ddu64CompressionError,
  Ddu64DecompressionError,
  Ddu64DecryptionError,
  Ddu64EncryptionError,
  isDdu64Error,
  toErrorMessage,
} from "../errors.js";
import type { KeyDerivationOptions, PlatformAdapter } from "../types.js";
import { isAdapterCapabilityErrorMessage } from "./AdapterCapability.js";

type CompressionAlgorithm = "deflate" | "brotli";
type GatewayOperation = "encode" | "decode";
type AsyncFailureKind = "compress" | "decompress" | "encrypt" | "decrypt";

export interface AsyncAdapterGatewayContext {
  adapter: PlatformAdapter | undefined;
  encryptionKey: string | undefined;
  keyDerivation: KeyDerivationOptions | undefined;
  encryptionKeyHash: Uint8Array | undefined;
  setEncryptionKeyHash(hash: Uint8Array): void;
}

export async function encryptAsyncWithAdapter(
  context: AsyncAdapterGatewayContext,
  data: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  try {
    const adapter = requireAsyncAdapter(context.adapter, "encode");
    const keyHash = await getAsyncKeyHash(context, adapter);
    return await adapter.encrypt(data, keyHash, aad);
  } catch (err) {
    throw toAsyncGatewayError(err, "encode", "encrypt");
  }
}

export async function decryptAsyncWithAdapter(
  context: AsyncAdapterGatewayContext,
  data: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  try {
    const adapter = requireAsyncAdapter(context.adapter, "decode");
    const keyHash = await getAsyncKeyHash(context, adapter);
    return await adapter.decrypt(data, keyHash, aad);
  } catch (err) {
    throw toAsyncGatewayError(err, "decode", "decrypt");
  }
}

export async function compressAsyncWithAdapter(
  adapter: PlatformAdapter | undefined,
  data: Uint8Array,
  algorithm: CompressionAlgorithm,
  level: number,
): Promise<Uint8Array> {
  try {
    const asyncAdapter = requireAsyncAdapter(adapter, "encode");
    if (algorithm === "brotli") {
      if (!asyncAdapter.brotliCompress) {
        throw new Ddu64AdapterError(
          "[Ddu64 compress] Brotli compression is unavailable in the current runtime.",
          "encode",
        );
      }
      return await asyncAdapter.brotliCompress(data, level);
    }
    return await asyncAdapter.deflate(data, level);
  } catch (err) {
    throw toAsyncGatewayError(err, "encode", "compress");
  }
}

export async function decompressAsyncWithAdapter(
  adapter: PlatformAdapter | undefined,
  data: Uint8Array,
  algorithm: CompressionAlgorithm,
  maxBytes: number,
): Promise<Uint8Array> {
  try {
    const asyncAdapter = requireAsyncAdapter(adapter, "decode");
    if (algorithm === "brotli") {
      if (!asyncAdapter.brotliDecompress) {
        throw new Ddu64AdapterError(
          "[Ddu64 decompress] Brotli decompression is unavailable in the current runtime.",
          "decode",
        );
      }
      return await asyncAdapter.brotliDecompress(data, maxBytes);
    }
    return await asyncAdapter.inflate(data, maxBytes);
  } catch (err) {
    throw toAsyncGatewayError(err, "decode", "decompress");
  }
}

function requireAsyncAdapter(
  adapter: PlatformAdapter | undefined,
  operation: GatewayOperation,
): PlatformAdapter {
  if (!adapter) {
    throw new Ddu64AdapterError(
      "[Ddu64 adapter] No platform adapter available. " +
        "Use @ddunigma/node or @ddunigma/node/browser, " +
        "or provide an adapter via options.adapter.",
      operation,
    );
  }
  return adapter;
}

async function getAsyncKeyHash(
  context: AsyncAdapterGatewayContext,
  adapter: PlatformAdapter,
): Promise<Uint8Array> {
  if (context.encryptionKeyHash) return context.encryptionKeyHash;
  const hash = await adapter.deriveKey(context.encryptionKey!, context.keyDerivation);
  context.setEncryptionKeyHash(hash);
  return hash;
}

function toAsyncGatewayError(
  error: unknown,
  fallbackOperation: GatewayOperation,
  failureKind: AsyncFailureKind,
): Error {
  if (isDdu64Error(error)) return error;

  const message = toErrorMessage(error);
  if (isAdapterCapabilityErrorMessage(message)) {
    return new Ddu64AdapterError(message, fallbackOperation, error);
  }

  switch (failureKind) {
    case "compress":
      return new Ddu64CompressionError(message, error);
    case "decompress":
      return new Ddu64DecompressionError(message, error);
    case "encrypt":
      return new Ddu64EncryptionError(message, error);
    case "decrypt":
      return new Ddu64DecryptionError(message, error);
  }
}
