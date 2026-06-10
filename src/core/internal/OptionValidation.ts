/**
 * Runtime validation for public constructor and per-call options.
 *
 * @module core/internal/OptionValidation
 */

import { Ddu64InvalidInputError, type Ddu64Operation } from "../errors.js";
import type { DduConstructorOptions, DduOptions, DduStreamOptions } from "../types.js";

type PublicOptions = DduOptions | DduConstructorOptions | DduStreamOptions;

export function validateRuntimeOptions(
  options: PublicOptions | undefined,
  operation: Ddu64Operation = "construct",
): void {
  if (!options) return;

  validateBoolean(options.compress, "compress", operation);
  validateBoolean(options.encrypt, "encrypt", operation);
  validateBoolean(options.checksum, "checksum", operation);
  validateBoolean(options.omitFooter, "omitFooter", operation);
  validateBoolean(options.obfuscate, "obfuscate", operation);
  validateBoolean(options.requireEncryption, "requireEncryption", operation);

  if (
    options.compressionLevel !== undefined &&
    (typeof options.compressionLevel !== "number" || !Number.isFinite(options.compressionLevel))
  ) {
    invalid(operation, "compressionLevel must be a finite number");
  }

  if (options.onProgress !== undefined && typeof options.onProgress !== "function") {
    invalid(operation, "onProgress must be a function");
  }

  if (
    options.compressionAlgorithm !== undefined &&
    options.compressionAlgorithm !== "deflate" &&
    options.compressionAlgorithm !== "brotli"
  ) {
    invalid(
      operation,
      `compressionAlgorithm must be "deflate" or "brotli", got ${String(options.compressionAlgorithm)}`,
    );
  }

  if (
    options.checksumScope !== undefined &&
    options.checksumScope !== "plaintext" &&
    options.checksumScope !== "output"
  ) {
    invalid(
      operation,
      `checksumScope must be "plaintext" or "output", got ${String(options.checksumScope)}`,
    );
  }

  if (
    options.chunkSize !== undefined &&
    (!Number.isSafeInteger(options.chunkSize) || options.chunkSize <= 0)
  ) {
    invalid(operation, "chunkSize must be a positive safe integer");
  }

  if (options.chunkSeparator !== undefined && typeof options.chunkSeparator !== "string") {
    invalid(operation, "chunkSeparator must be a string");
  }
  if (options.chunkSize !== undefined && options.chunkSeparator === "") {
    invalid(operation, "chunkSeparator must not be empty when chunkSize is enabled");
  }

  validatePositiveLimit(options.maxDecodedBytes, "maxDecodedBytes", operation);
  validatePositiveLimit(options.maxDecompressedBytes, "maxDecompressedBytes", operation);
  if ("maxBufferedBytes" in options) {
    validatePositiveLimit(options.maxBufferedBytes, "maxBufferedBytes", operation);
  }
  if ("maxBufferedChars" in options) {
    validatePositiveLimit(options.maxBufferedChars, "maxBufferedChars", operation);
  }

  if ("wasmThreshold" in options && options.wasmThreshold !== undefined) {
    const threshold = options.wasmThreshold;
    if (threshold !== Number.POSITIVE_INFINITY && (!Number.isFinite(threshold) || threshold < 0)) {
      invalid(operation, "wasmThreshold must be a non-negative finite number or Infinity");
    }
  }

  if ("wasmMaxBytes" in options && options.wasmMaxBytes !== undefined) {
    const maxBytes = options.wasmMaxBytes;
    if (maxBytes !== Number.POSITIVE_INFINITY && (!Number.isFinite(maxBytes) || maxBytes < 1024)) {
      invalid(operation, "wasmMaxBytes must be at least 1024 or Infinity");
    }
  }

  const constructorOptions = options as Partial<DduConstructorOptions>;
  validateBoolean(constructorOptions.throwOnError, "throwOnError", operation);
  validateBoolean(constructorOptions.urlSafe, "urlSafe", operation);
  validateBoolean(constructorOptions.useRepeatPadding, "useRepeatPadding", operation);
  validateBoolean(constructorOptions.usePowerOfTwo, "usePowerOfTwo", operation);

  if (
    constructorOptions.encryptionKey !== undefined &&
    typeof constructorOptions.encryptionKey !== "string"
  ) {
    invalid(operation, "encryptionKey must be a string");
  }
  if (
    constructorOptions.dduChar !== undefined &&
    typeof constructorOptions.dduChar !== "string" &&
    !(
      Array.isArray(constructorOptions.dduChar) &&
      constructorOptions.dduChar.every((character) => typeof character === "string")
    )
  ) {
    invalid(operation, "dduChar must be a string or string array");
  }
  if (
    constructorOptions.paddingChar !== undefined &&
    typeof constructorOptions.paddingChar !== "string"
  ) {
    invalid(operation, "paddingChar must be a string");
  }
  if (
    constructorOptions.codaChar !== undefined &&
    !(
      Array.isArray(constructorOptions.codaChar) &&
      constructorOptions.codaChar.every((character) => typeof character === "string")
    )
  ) {
    invalid(operation, "codaChar must be a string array");
  }
  if (
    constructorOptions.requiredLength !== undefined &&
    (!Number.isSafeInteger(constructorOptions.requiredLength) ||
      constructorOptions.requiredLength <= 0)
  ) {
    invalid(operation, "requiredLength must be a positive safe integer");
  }
  if (
    constructorOptions.adapter !== undefined &&
    (typeof constructorOptions.adapter !== "object" || constructorOptions.adapter === null)
  ) {
    invalid(operation, "adapter must be an object");
  }

  const derivation = "keyDerivation" in options ? options.keyDerivation : undefined;
  if (derivation === undefined) return;
  if (typeof derivation !== "object" || derivation === null) {
    invalid(operation, "keyDerivation must be an object");
  }

  if (
    derivation.algorithm !== undefined &&
    derivation.algorithm !== "sha256" &&
    derivation.algorithm !== "pbkdf2"
  ) {
    invalid(
      operation,
      `keyDerivation.algorithm must be "sha256" or "pbkdf2", got ${String(derivation.algorithm)}`,
    );
  }
  if (
    derivation.hash !== undefined &&
    derivation.hash !== "SHA-256" &&
    derivation.hash !== "SHA-384" &&
    derivation.hash !== "SHA-512"
  ) {
    invalid(operation, `Unsupported PBKDF2 hash: ${String(derivation.hash)}`);
  }
  if (
    derivation.iterations !== undefined &&
    (!Number.isFinite(derivation.iterations) || derivation.iterations <= 0)
  ) {
    invalid(operation, "keyDerivation.iterations must be a positive finite number");
  }
  if (
    derivation.salt !== undefined &&
    typeof derivation.salt !== "string" &&
    !(derivation.salt instanceof Uint8Array)
  ) {
    invalid(operation, "keyDerivation.salt must be a string or Uint8Array");
  }
}

export function validateEncodeInput(
  input: unknown,
  operation: Ddu64Operation = "encode",
): asserts input is Uint8Array | string {
  if (typeof input !== "string" && !(input instanceof Uint8Array)) {
    throw new Ddu64InvalidInputError(
      "[Ddu64 input] Encode input must be a string or Uint8Array.",
      operation,
    );
  }
}

export function validateDecodeInput(
  input: unknown,
  operation: Ddu64Operation = "decode",
): asserts input is string {
  if (typeof input !== "string") {
    throw new Ddu64InvalidInputError("[Ddu64 input] Decode input must be a string.", operation);
  }
}

function validateBoolean(
  value: boolean | undefined,
  name: string,
  operation: Ddu64Operation,
): void {
  if (value !== undefined && typeof value !== "boolean") {
    invalid(operation, `${name} must be a boolean`);
  }
}

function validatePositiveLimit(
  value: number | undefined,
  name: string,
  operation: Ddu64Operation,
): void {
  if (
    value !== undefined &&
    value !== Number.POSITIVE_INFINITY &&
    (!Number.isFinite(value) || value <= 0)
  ) {
    invalid(operation, `${name} must be a positive finite number or Infinity`);
  }
}

function invalid(operation: Ddu64Operation, detail: string): never {
  throw new Ddu64InvalidInputError(`[Ddu64 options] Invalid ${detail}.`, operation);
}
