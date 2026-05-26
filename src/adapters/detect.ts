/**
 * 런타임 자동 감지 모듈.
 * 현재 JavaScript 런타임 환경을 감지하고 적절한 PlatformAdapter를 반환합니다.
 *
 * 중요: 이 모듈은 Node.js 내장 모듈을 임포트하지 않습니다.
 * 감지는 순수하게 globalThis 검사에 기반합니다.
 *
 * @module adapters/detect
 */

import type { PlatformAdapter } from "../core/types.js";

/** 감지된 런타임 환경 식별자 */
export type RuntimeId = "node" | "browser" | "edge" | "deno" | "bun" | "unknown";

/**
 * 현재 JavaScript 런타임 환경을 감지합니다.
 *
 * 감지 순서:
 * 1. Node.js: `globalThis.process?.versions?.node` 존재
 * 2. Deno: `(globalThis as any).Deno?.version?.deno` 존재
 * 3. Bun: `(globalThis as any).Bun?.version` 존재
 * 4. Web Crypto (브라우저/엣지): `globalThis.crypto?.subtle` 존재
 * 5. 그 외: 에러 throw
 *
 * @returns 감지된 런타임 식별자
 * @throws 적합한 crypto 제공자를 찾지 못한 경우 에러
 */
export function detectRuntime(): RuntimeId {
  // Node.js 확인
  if (typeof globalThis.process !== "undefined" && globalThis.process?.versions?.node) {
    return "node";
  }

  // Deno 확인
  if ((globalThis as any).Deno?.version?.deno) {
    return "deno";
  }

  // Bun 확인
  if ((globalThis as any).Bun?.version) {
    return "bun";
  }

  // Web Crypto 확인 (브라우저/엣지)
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto?.subtle) {
    return "browser";
  }

  // 적합한 제공자를 찾지 못함
  throw new Error(
    "[ddunigma] No suitable crypto provider found. " +
      "Detected runtime lacks both Node.js crypto module and Web Crypto API (SubtleCrypto).",
  );
}

/**
 * 현재 런타임에 적합한 PlatformAdapter를 가져옵니다.
 *
 * 실제로 필요할 때까지 플랫폼별 모듈을 임포트하지 않는
 * 지연 로딩을 사용합니다.
 *
 * @returns 적절한 PlatformAdapter로 resolve되는 Promise
 * @throws 적합한 런타임이 감지되지 않은 경우 에러
 */
export async function getAdapter(): Promise<PlatformAdapter> {
  const runtime = detectRuntime();

  switch (runtime) {
    case "node": {
      const { NodeAdapter } = await import("./NodeAdapter.js");
      return new NodeAdapter();
    }
    case "deno":
    case "bun":
    case "browser":
    case "edge": {
      const { BrowserAdapter } = await import("./BrowserAdapter.js");
      return new BrowserAdapter();
    }
    default:
      throw new Error(
        "[ddunigma] No suitable crypto provider found. " +
          "Detected runtime lacks both Node.js crypto module and Web Crypto API (SubtleCrypto).",
      );
  }
}
