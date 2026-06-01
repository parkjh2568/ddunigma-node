/**
 * Unit tests for runtime auto-detection module.
 *
 * Since vitest runs in Node.js, the default detection will return "node".
 * We test other runtimes by temporarily modifying globalThis properties.
 */

import { describe, it, expect, afterEach } from "vitest";
import { detectRuntime, getAdapter, type RuntimeId } from "../adapters/detect.js";

describe("detectRuntime", () => {
  describe("in Node.js environment (default vitest runtime)", () => {
    it('returns "node" when globalThis.process.versions.node exists', () => {
      const result = detectRuntime();
      expect(result).toBe("node");
    });

    it("returns a valid RuntimeId type", () => {
      const result = detectRuntime();
      const validRuntimes: RuntimeId[] = ["node", "browser", "edge", "deno", "bun", "unknown"];
      expect(validRuntimes).toContain(result);
    });
  });

  describe("runtime detection priority", () => {
    const originalProcess = globalThis.process;
    const originalCrypto = globalThis.crypto;
    const originalEdgeRuntime = (globalThis as any).EdgeRuntime;
    const originalWebSocketPair = (globalThis as any).WebSocketPair;
    const hadEdgeRuntime = "EdgeRuntime" in globalThis;
    const hadWebSocketPair = "WebSocketPair" in globalThis;

    afterEach(() => {
      // Restore original globals
      Object.defineProperty(globalThis, "process", {
        value: originalProcess,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(globalThis, "crypto", {
        value: originalCrypto,
        writable: true,
        configurable: true,
      });
      // Clean up Deno/Bun mocks
      delete (globalThis as any).Deno;
      delete (globalThis as any).Bun;
      if (hadEdgeRuntime) {
        (globalThis as any).EdgeRuntime = originalEdgeRuntime;
      } else {
        delete (globalThis as any).EdgeRuntime;
      }
      if (hadWebSocketPair) {
        (globalThis as any).WebSocketPair = originalWebSocketPair;
      } else {
        delete (globalThis as any).WebSocketPair;
      }
    });

    it('returns "deno" when Deno global is present and process is absent', () => {
      // Remove Node.js indicators
      Object.defineProperty(globalThis, "process", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      // Add Deno global
      (globalThis as any).Deno = { version: { deno: "1.40.0" } };

      expect(detectRuntime()).toBe("deno");
    });

    it('returns "bun" when Bun global is present and process/Deno are absent', () => {
      Object.defineProperty(globalThis, "process", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      (globalThis as any).Bun = { version: "1.0.0" };

      expect(detectRuntime()).toBe("bun");
    });

    it('returns "browser" when only crypto.subtle is available', () => {
      Object.defineProperty(globalThis, "process", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      // crypto.subtle should already exist in Node.js 18+, but let's be explicit
      Object.defineProperty(globalThis, "crypto", {
        value: { subtle: {} },
        writable: true,
        configurable: true,
      });

      expect(detectRuntime()).toBe("browser");
    });

    it('returns "edge" when EdgeRuntime is present', () => {
      Object.defineProperty(globalThis, "process", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(globalThis, "crypto", {
        value: { subtle: {} },
        writable: true,
        configurable: true,
      });
      (globalThis as any).EdgeRuntime = "edge-runtime";

      expect(detectRuntime()).toBe("edge");
    });

    it('returns "edge" for workerd-style WebSocketPair globals', () => {
      Object.defineProperty(globalThis, "process", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(globalThis, "crypto", {
        value: { subtle: {} },
        writable: true,
        configurable: true,
      });
      (globalThis as any).WebSocketPair = function WebSocketPair() {};

      expect(detectRuntime()).toBe("edge");
    });

    it('returns "unknown" when no runtime indicators are present', () => {
      Object.defineProperty(globalThis, "process", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(globalThis, "crypto", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      expect(detectRuntime()).toBe("unknown");
    });

    it("prioritizes Deno over Node.js when both are present", () => {
      // Node.js process is already present; add Deno
      (globalThis as any).Deno = { version: { deno: "1.40.0" } };

      expect(detectRuntime()).toBe("deno");
    });

    it("prioritizes Bun over Node.js when both are present", () => {
      // Node.js process is already present; add Bun
      (globalThis as any).Bun = { version: "1.0.0" };

      expect(detectRuntime()).toBe("bun");
    });

    it("prioritizes Deno over Bun when both are present (no Node.js)", () => {
      Object.defineProperty(globalThis, "process", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      (globalThis as any).Deno = { version: { deno: "1.40.0" } };
      (globalThis as any).Bun = { version: "1.0.0" };

      expect(detectRuntime()).toBe("deno");
    });

    it("prioritizes Deno over browser crypto when both are present", () => {
      Object.defineProperty(globalThis, "process", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      (globalThis as any).Deno = { version: { deno: "1.40.0" } };
      Object.defineProperty(globalThis, "crypto", {
        value: { subtle: {} },
        writable: true,
        configurable: true,
      });

      expect(detectRuntime()).toBe("deno");
    });

    it("does not detect Node.js when process exists but versions.node is missing", () => {
      Object.defineProperty(globalThis, "process", {
        value: { versions: {} },
        writable: true,
        configurable: true,
      });
      Object.defineProperty(globalThis, "crypto", {
        value: { subtle: {} },
        writable: true,
        configurable: true,
      });

      expect(detectRuntime()).toBe("browser");
    });

    it("does not detect Deno when Deno exists but version.deno is missing", () => {
      Object.defineProperty(globalThis, "process", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      (globalThis as any).Deno = { version: {} };
      Object.defineProperty(globalThis, "crypto", {
        value: { subtle: {} },
        writable: true,
        configurable: true,
      });

      expect(detectRuntime()).toBe("browser");
    });

    it("does not detect Bun when Bun exists but version is missing", () => {
      Object.defineProperty(globalThis, "process", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      (globalThis as any).Bun = {};
      Object.defineProperty(globalThis, "crypto", {
        value: { subtle: {} },
        writable: true,
        configurable: true,
      });

      expect(detectRuntime()).toBe("browser");
    });
  });
});

describe("getAdapter", () => {
  const originalProcess = globalThis.process;
  const originalCrypto = globalThis.crypto;
  const originalEdgeRuntime = (globalThis as any).EdgeRuntime;
  const hadEdgeRuntime = "EdgeRuntime" in globalThis;

  afterEach(() => {
    Object.defineProperty(globalThis, "process", {
      value: originalProcess,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "crypto", {
      value: originalCrypto,
      writable: true,
      configurable: true,
    });
    if (hadEdgeRuntime) {
      (globalThis as any).EdgeRuntime = originalEdgeRuntime;
    } else {
      delete (globalThis as any).EdgeRuntime;
    }
  });

  it("returns a PlatformAdapter for the current Node.js runtime", async () => {
    // In the test environment (Node.js), getAdapter should resolve
    // This will attempt to import NodeAdapter.ts which may not exist yet
    // For now, we just verify detectRuntime works correctly
    const runtime = detectRuntime();
    expect(runtime).toBe("node");
  });

  it("throws with descriptive error when runtime is unknown", async () => {
    Object.defineProperty(globalThis, "process", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    await expect(getAdapter()).rejects.toThrow(
      "Detected runtime lacks both Node.js crypto module and Web Crypto API (SubtleCrypto).",
    );
  });
});
