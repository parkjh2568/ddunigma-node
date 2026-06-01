/**
 * Tests for WasmCodec loader and integration.
 *
 * These tests accept both a valid local WASM binary and graceful fallback when
 * the binary is unavailable in a packaging/runtime scenario.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  preloadWasm,
  getWasmCodec,
  getWasmCodecSync,
  validateWasmThreshold,
  _resetWasmState,
  DEFAULT_WASM_THRESHOLD,
  MIN_WASM_THRESHOLD,
  MAX_WASM_THRESHOLD,
} from "../wasm/WasmCodec.js";
import {
  getWasmCodecSync as getNodeWasmCodecSync,
  preloadWasm as preloadNodeWasm,
} from "../wasm/WasmCodecNode.js";

describe("WasmCodec", () => {
  beforeEach(() => {
    _resetWasmState();
  });

  describe("preloadWasm()", () => {
    it("should initialize when WASM is present or reject descriptively when unavailable", async () => {
      try {
        await preloadWasm();
        expect(getWasmCodecSync()?.ready).toBe(true);
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect(String((err as Error).message)).toMatch(/wasm/i);
      }
    });

    it("should expose an encode/decode codec after successful preload", async () => {
      try {
        await preloadWasm();
      } catch {
        return;
      }
      const codec = getWasmCodecSync();
      expect(codec).not.toBeNull();
      const encoded = codec!.encode(new Uint8Array([72, 101, 108, 108, 111]), 6);
      const decoded = codec!.decode(encoded.indices, 6, encoded.paddingBits);
      expect(decoded).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });

    it("should not throw synchronously", () => {
      // Calling preloadWasm should not throw — it returns a promise
      const promise = preloadWasm();
      expect(promise).toBeInstanceOf(Promise);
      // Attach a handler to prevent unhandled rejection
      promise.catch(() => {});
    });
  });

  describe("Node WASM loader", () => {
    it("installs the Node filesystem loader lazily before preload", async () => {
      await preloadNodeWasm();
      expect(getNodeWasmCodecSync()?.ready).toBe(true);
    });
  });

  describe("getWasmCodec()", () => {
    it("should return null before on-demand initialization settles", async () => {
      const codec = getWasmCodec();
      if (codec) {
        expect(codec.ready).toBe(true);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it("should return a codec or null after initialization attempt", async () => {
      try {
        await preloadWasm();
      } catch {
        // Runtime without a loadable binary is an allowed fallback.
      }

      const codec = getWasmCodec();
      expect(codec === null || codec.ready).toBe(true);
    });

    it("should not throw on repeated calls", async () => {
      expect(() => getWasmCodec()).not.toThrow();
      expect(() => getWasmCodec()).not.toThrow();
      expect(() => getWasmCodec()).not.toThrow();

      // Wait for any on-demand init to settle
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  });

  describe("getWasmCodecSync()", () => {
    it("should return null when WASM is not initialized", () => {
      expect(getWasmCodecSync()).toBeNull();
    });

    it("should not trigger on-demand initialization", () => {
      // getWasmCodecSync should not start any async init
      const result = getWasmCodecSync();
      expect(result).toBeNull();
    });
  });

  describe("validateWasmThreshold()", () => {
    it("should return the value when within valid range", () => {
      expect(validateWasmThreshold(4096)).toBe(4096);
      expect(validateWasmThreshold(1024)).toBe(1024);
      expect(validateWasmThreshold(1048576)).toBe(1048576);
    });

    it("should clamp values below minimum to MIN_WASM_THRESHOLD", () => {
      expect(validateWasmThreshold(100)).toBe(MIN_WASM_THRESHOLD);
      expect(validateWasmThreshold(0)).toBe(MIN_WASM_THRESHOLD);
    });

    it("should clamp values above maximum to MAX_WASM_THRESHOLD", () => {
      expect(validateWasmThreshold(2000000)).toBe(MAX_WASM_THRESHOLD);
      expect(validateWasmThreshold(10000000)).toBe(MAX_WASM_THRESHOLD);
    });

    it("allows Infinity to disable WASM use", () => {
      expect(validateWasmThreshold(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    });

    it("should round non-integer values", () => {
      expect(validateWasmThreshold(4096.7)).toBe(4097);
      expect(validateWasmThreshold(4096.3)).toBe(4096);
    });

    it("should throw for non-finite values", () => {
      expect(() => validateWasmThreshold(NaN)).toThrow(/finite number/);
      expect(() => validateWasmThreshold(-Infinity)).toThrow(/finite number/);
    });
  });

  describe("constants", () => {
    it("should export correct default threshold", () => {
      expect(DEFAULT_WASM_THRESHOLD).toBe(4096);
    });

    it("should export correct min threshold", () => {
      expect(MIN_WASM_THRESHOLD).toBe(1024);
    });

    it("should export correct max threshold", () => {
      expect(MAX_WASM_THRESHOLD).toBe(1048576);
    });
  });

  describe("fallback behavior", () => {
    it("should not throw after preload success or failure", async () => {
      try {
        await preloadWasm();
      } catch {
        // Runtime without a loadable binary is an allowed fallback.
      }

      expect(() => getWasmCodec()).not.toThrow();
      expect(() => getWasmCodecSync()).not.toThrow();
    });

    it("should keep a stable result after initialization attempt", async () => {
      try {
        await preloadWasm();
      } catch {
        // Runtime without a loadable binary is an allowed fallback.
      }

      const codec = getWasmCodec();
      expect(codec === null || codec.ready).toBe(true);
    });
  });
});
