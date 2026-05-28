/**
 * 플랫폼 어댑터가 공유하는 키 파생 옵션 정규화 헬퍼.
 *
 * @module adapters/keyDerivation
 */

import type { KeyDerivationOptions } from "../core/types.js";

const DEFAULT_PBKDF2_ITERATIONS = 210_000;
const MIN_PBKDF2_ITERATIONS = 10_000;
const DEFAULT_PBKDF2_SALT = "ddunigma:pbkdf2:v1";

export function normalizePbkdf2Iterations(iterations: number | undefined): number {
  if (iterations === undefined) return DEFAULT_PBKDF2_ITERATIONS;
  if (!Number.isFinite(iterations) || iterations <= 0) return DEFAULT_PBKDF2_ITERATIONS;
  return Math.max(MIN_PBKDF2_ITERATIONS, Math.floor(iterations));
}

export function normalizePbkdf2HashForNode(hash: KeyDerivationOptions["hash"]): string {
  return (hash ?? "SHA-256").toLowerCase().replace("-", "");
}

export function normalizePbkdf2HashForWebCrypto(
  hash: KeyDerivationOptions["hash"],
): NonNullable<KeyDerivationOptions["hash"]> {
  return hash ?? "SHA-256";
}

export function pbkdf2SaltToBytes(salt: string | Uint8Array | undefined): Uint8Array {
  if (salt === undefined) return new TextEncoder().encode(DEFAULT_PBKDF2_SALT);
  if (typeof salt === "string") return new TextEncoder().encode(salt);
  return salt;
}
