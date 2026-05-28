/**
 * Runtime detection helpers with no platform-specific imports.
 *
 * @module adapters/runtime
 */

/** 감지된 런타임 환경 식별자 */
export type RuntimeId = "node" | "browser" | "edge" | "deno" | "bun" | "unknown";

type RuntimeGlobals = typeof globalThis & {
  Deno?: { version?: { deno?: string } };
  Bun?: { version?: string };
  process?: { versions?: { node?: string } };
};

/**
 * 현재 JavaScript 런타임 환경을 감지합니다.
 *
 * 감지는 순수하게 globalThis 검사에 기반하며 Node.js 내장 모듈을 임포트하지 않습니다.
 */
export function detectRuntime(): RuntimeId {
  const runtime = globalThis as RuntimeGlobals;

  if (runtime.Deno?.version?.deno) {
    return "deno";
  }

  if (runtime.Bun?.version) {
    return "bun";
  }

  if (runtime.process?.versions?.node) {
    return "node";
  }

  if (typeof runtime.crypto !== "undefined" && runtime.crypto?.subtle) {
    return "browser";
  }

  return "unknown";
}
