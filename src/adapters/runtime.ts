/**
 * Runtime detection helpers with no platform-specific imports.
 *
 * @module adapters/runtime
 */

/** 감지된 런타임 환경 식별자 */
export type RuntimeId = "node" | "browser" | "edge" | "deno" | "bun" | "unknown";

/**
 * 현재 JavaScript 런타임 환경을 감지합니다.
 *
 * 감지는 순수하게 globalThis 검사에 기반하며 Node.js 내장 모듈을 임포트하지 않습니다.
 */
export function detectRuntime(): RuntimeId {
  if (typeof globalThis.process !== "undefined" && globalThis.process?.versions?.node) {
    return "node";
  }

  if ((globalThis as any).Deno?.version?.deno) {
    return "deno";
  }

  if ((globalThis as any).Bun?.version) {
    return "bun";
  }

  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto?.subtle) {
    return "browser";
  }

  throw new Error(
    "[ddunigma] No suitable crypto provider found. " +
      "Detected runtime lacks both Node.js crypto module and Web Crypto API (SubtleCrypto).",
  );
}
