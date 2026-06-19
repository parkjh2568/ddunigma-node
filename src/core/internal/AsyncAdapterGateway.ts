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
import type { PlatformAdapter } from "../types.js";
import type { AdapterGatewayContext } from "./AdapterGatewayContext.js";

type CompressionAlgorithm = "deflate" | "brotli";
type GatewayOperation = "encode" | "decode";
type AsyncFailureKind = "compress" | "decompress" | "encrypt" | "decrypt";

export async function encryptAsyncWithAdapter(
  context: AdapterGatewayContext,
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
  context: AdapterGatewayContext,
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
  context: AdapterGatewayContext,
  adapter: PlatformAdapter,
): Promise<Uint8Array> {
  if (context.encryptionKeyHash) return context.encryptionKeyHash;
  if (context.encryptionKeyHashPromise) return context.encryptionKeyHashPromise;

  const promise = adapter
    .deriveKey(context.encryptionKey!, context.keyDerivation)
    .then((hash) => {
      context.setEncryptionKeyHash(hash);
      return hash;
    })
    .finally(() => {
      context.encryptionKeyHashPromise = undefined;
    });
  context.encryptionKeyHashPromise = promise;
  return promise;
}

function toAsyncGatewayError(
  error: unknown,
  _fallbackOperation: GatewayOperation,
  failureKind: AsyncFailureKind,
): Error {
  if (isDdu64Error(error)) return error;

  const message = toErrorMessage(error);

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
