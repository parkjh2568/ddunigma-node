/**
 * Tests for WasmCodec loader and integration.
 *
 * These tests accept both a valid local WASM binary and graceful fallback when
 * the binary is unavailable in a packaging/runtime scenario.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readFile } from "node:fs/promises";
import {
  preloadWasm,
  getWasmCodec,
  getWasmCodecSync,
  validateWasmMaxBytes,
  validateWasmThreshold,
  _resetWasmState,
  _setWasmByteLoader,
  DEFAULT_WASM_MAX_BYTES,
  DEFAULT_WASM_THRESHOLD,
  MIN_WASM_THRESHOLD,
  MAX_WASM_THRESHOLD,
} from "../wasm/WasmCodec.js";
import {
  getWasmCodecSync as getNodeWasmCodecSync,
  preloadWasm as preloadNodeWasm,
} from "../wasm/WasmCodecNode.js";
import { bitPackDecode, bitPackEncode, type BitPackConfig } from "../core/BitPack.js";
import { Ddu64Node } from "../Ddu64Node.js";
import { DduSetSymbol } from "../core/types.js";

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

    it("matches JS bitpack for non-power-of-two charset configs", async () => {
      await preloadNodeWasm();
      const codec = getNodeWasmCodecSync()!;
      const config: BitPackConfig = { bitLength: 6, usePowerOfTwo: false, charsetSize: 8 };
      const input = Uint8Array.from({ length: 257 }, (_, i) => (i * 37 + 11) & 0xff);

      const wasmEncoded = codec.encode(input, config.bitLength, {
        charsetSize: config.charsetSize,
        usePowerOfTwo: config.usePowerOfTwo,
      });
      const jsEncoded = bitPackEncode(input, config);

      expect(Array.from(wasmEncoded.indices)).toEqual(jsEncoded.indices);
      expect(wasmEncoded.paddingBits).toBe(jsEncoded.paddingBits);

      const wasmDecoded = codec.decode(
        wasmEncoded.indices,
        config.bitLength,
        wasmEncoded.paddingBits,
        {
          charsetSize: config.charsetSize,
          usePowerOfTwo: config.usePowerOfTwo,
        },
      );
      expect(wasmDecoded).toEqual(bitPackDecode(jsEncoded.indices, jsEncoded.paddingBits, config));
      expect(wasmDecoded).toEqual(input);
    });

    it("round-trips DDU_V1 through the WASM-enabled payload path", async () => {
      await preloadNodeWasm();
      const input = Uint8Array.from({ length: 4096 }, (_, i) => (i * 13 + 7) & 0xff);
      const wasmEncoder = new Ddu64Node({
        dduSetSymbol: DduSetSymbol.DDU_V1,
        wasmThreshold: 1024,
      });
      const jsEncoder = new Ddu64Node({
        dduSetSymbol: DduSetSymbol.DDU_V1,
        wasmThreshold: Number.POSITIVE_INFINITY,
      });

      const encoded = wasmEncoder.encode(input);
      expect(encoded).toBe(jsEncoder.encode(input));
      expect(wasmEncoder.decodeToUint8Array(encoded)).toEqual(input);
    });

    it("rejects invalid bit lengths and padding before entering WASM", async () => {
      await preloadNodeWasm();
      const codec = getNodeWasmCodecSync()!;

      expect(() => codec.encode(new Uint8Array([1]), 0)).toThrow(RangeError);
      expect(() => codec.encode(new Uint8Array([1]), 17)).toThrow(RangeError);
      expect(() => codec.decode(new Uint16Array([0]), 6, 6)).toThrow(RangeError);
      expect(() => codec.decode(new Uint16Array(0), 6, 1)).toThrow(RangeError);
      expect(() =>
        codec.decode(new Uint16Array([0]), 6, 0, {
          charsetSize: 8,
          usePowerOfTwo: false,
        }),
      ).toThrow(RangeError);
    });

    it("should not throw synchronously", () => {
      // Calling preloadWasm should not throw — it returns a promise
      const promise = preloadWasm();
      expect(promise).toBeInstanceOf(Promise);
      // Attach a handler to prevent unhandled rejection
      promise.catch(() => {});
    });

    it("retries with a new loader installed during initialization", async () => {
      let resolveStaleLoader: ((bytes: ArrayBuffer | null) => void) | undefined;
      const staleLoader = () =>
        new Promise<ArrayBuffer | null>((resolve) => {
          resolveStaleLoader = resolve;
        });
      const wasmFile = await readFile(new URL("../wasm/codec.wasm", import.meta.url));
      const validBytes = wasmFile.buffer.slice(
        wasmFile.byteOffset,
        wasmFile.byteOffset + wasmFile.byteLength,
      );
      const replacementLoader = async () => validBytes;

      _setWasmByteLoader(staleLoader);
      const staleInit = preloadWasm();
      await Promise.resolve();

      _setWasmByteLoader(replacementLoader);
      const replacementInit = preloadWasm();
      resolveStaleLoader?.(null);

      await expect(staleInit).rejects.toThrow(/initialization failed/);
      await expect(replacementInit).resolves.toBeUndefined();
      expect(getWasmCodecSync()?.ready).toBe(true);
    });
  });

  describe("Node WASM loader", () => {
    it("installs the Node filesystem loader lazily before preload", async () => {
      await preloadNodeWasm();
      expect(getNodeWasmCodecSync()?.ready).toBe(true);
    });
  });

  describe("getWasmCodec()", () => {
    it("does not retry a failed loader when the same loader is installed again", async () => {
      let calls = 0;
      const loader = async () => {
        calls++;
        return null;
      };

      _setWasmByteLoader(loader);
      await expect(preloadWasm()).rejects.toThrow(/initialization failed/);
      _setWasmByteLoader(loader);
      expect(getWasmCodec()).toBeNull();
      expect(calls).toBe(1);
    });

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

  describe("validateWasmMaxBytes()", () => {
    it("accepts bounded and unbounded limits", () => {
      expect(validateWasmMaxBytes(1024)).toBe(1024);
      expect(validateWasmMaxBytes(8192.9)).toBe(8192);
      expect(validateWasmMaxBytes(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    });

    it("rejects invalid limits", () => {
      expect(() => validateWasmMaxBytes(1023)).toThrow(/at least/);
      expect(() => validateWasmMaxBytes(NaN)).toThrow(/at least/);
    });
  });

  describe("constants", () => {
    it("should export correct default threshold", () => {
      expect(DEFAULT_WASM_THRESHOLD).toBe(16 * 1024);
    });

    it("should export the default maximum payload size", () => {
      expect(DEFAULT_WASM_MAX_BYTES).toBe(8 * 1024 * 1024);
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
