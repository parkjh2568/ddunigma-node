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
export { detectRuntime, type RuntimeId } from "./runtime.js";
import { detectRuntime } from "./runtime.js";

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
      return new BrowserAdapter(runtime);
    }
    default:
      throw new Error(
        "[ddunigma] No suitable crypto provider found. " +
          "Detected runtime lacks both Node.js crypto module and Web Crypto API (SubtleCrypto).",
      );
  }
}
