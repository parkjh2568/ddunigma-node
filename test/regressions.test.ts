import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { NodeAdapter } from "../src/adapters/NodeAdapter.js";
import { Ddu64Core } from "../src/core/Ddu64Core.js";
import {
  Ddu64CharsetError,
  Ddu64DecryptionError,
  Ddu64DecodeError,
  Ddu64EncodeError,
  Ddu64ErrorCode,
  Ddu64InvalidInputError,
  Ddu64LimitError,
} from "../src/core/errors.js";
import { packPow2ToString, unpackPow2FromString } from "../src/core/internal/IndexStringMapper.js";
import {
  DduSetSymbol,
  type DduInternalOptions,
  type KeyDerivationOptions,
} from "../src/core/types.js";
import footerCollisionVectors from "./fixtures/footer-collision-vectors.json";

function createEncoder(options: Record<string, unknown> = {}) {
  return new Ddu64Core(undefined, undefined, {
    adapter: new NodeAdapter(),
    ...options,
  });
}

class CountingKeyAdapter extends NodeAdapter {
  deriveKeyCalls = 0;

  override async deriveKey(key: string, options?: KeyDerivationOptions): Promise<Uint8Array> {
    this.deriveKeyCalls++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return super.deriveKey(key, options);
  }
}

describe("security and resource regressions", () => {
  it("validates string decode inputs before dispatching to a subclass", async () => {
    let calls = 0;
    class CustomDecoder extends Ddu64Core {
      override decodeToUint8Array(): Uint8Array {
        calls++;
        return new TextEncoder().encode("custom decoded");
      }
      override async decodeToUint8ArrayAsync(): Promise<Uint8Array> {
        calls++;
        return new TextEncoder().encode("custom decoded async");
      }
    }
    const decoder = new CustomDecoder();
    expect(() => decoder.decode(null as never)).toThrow(Ddu64InvalidInputError);
    expect(() => decoder.decode("input", { checksum: "yes" } as never)).toThrow(
      Ddu64InvalidInputError,
    );
    await expect(decoder.decodeAsync(null as never)).rejects.toThrow(Ddu64InvalidInputError);
    await expect(decoder.decodeAsync("input", { checksum: "yes" } as never)).rejects.toThrow(
      Ddu64InvalidInputError,
    );
    expect(calls).toBe(0);
    expect(decoder.decode("input")).toBe("custom decoded");
    expect(await decoder.decodeAsync("input")).toBe("custom decoded async");
    expect(calls).toBe(2);
  });

  it.each([
    ["", "a"],
    ["a", ""],
    ["", "a", "bb", "c"],
  ])("rejects empty charset symbols: %j", (...dduChar) => {
    expect(() => new Ddu64Core({ dduChar, paddingChar: "=" })).toThrow(Ddu64CharsetError);
  });

  it.each(Object.values(DduSetSymbol))(
    "retains the final fallback profile for %s",
    (dduSetSymbol) => {
      const stable = new Ddu64Core({ dduSetSymbol });
      for (const dduChar of [["a", "\n"], ["", "a"], ["a"]]) {
        const fallback = new Ddu64Core({
          dduChar,
          paddingChar: "=",
          dduSetSymbol,
          throwOnError: false,
        });
        expect(fallback.getCharSetInfo()).toEqual(stable.getCharSetInfo());
        for (const input of ["A", "AB", "ABC", "ABCD"]) {
          expect(fallback.encode(input)).toBe(stable.encode(input));
          expect(stable.decode(fallback.encode(input))).toBe(input);
          expect(fallback.decode(stable.encode(input))).toBe(input);
        }
      }
    },
  );

  it.each(["|\n|", "|\r|", "|\r\n|", "\n", "\r", "\r\n", "||", "|\n|\n|"])(
    "removes intact chunk separators: %j",
    async (chunkSeparator) => {
      const encoder = createEncoder();
      const options = { chunkSize: 2, chunkSeparator };
      const encoded = encoder.encode("abcdef", options);
      expect(encoder.decode(encoded, options)).toBe("abcdef");
      expect(await encoder.decodeAsync(encoded, options)).toBe("abcdef");
    },
  );

  it.each(["\uFEFFABC", "A\uFEFFBC", "\uFEFF\uFEFFABC", "\uFEFF"])(
    "preserves every UTF-8 BOM in %j",
    async (input) => {
      const encoder = createEncoder();
      const encoded = encoder.encode(input);
      expect(encoder.decode(encoded)).toBe(input);
      expect(await encoder.decodeAsync(await encoder.encodeAsync(input))).toBe(input);
      expect(encoder.decodeToUint8Array(encoded)).toEqual(new TextEncoder().encode(input));
      expect(await encoder.decodeToUint8ArrayAsync(encoded)).toEqual(
        new TextEncoder().encode(input),
      );
    },
  );

  it("rejects encrypted payloads whose authenticated footer was removed", () => {
    const encoder = createEncoder({
      encryptionKey: "footer-downgrade-key",
      keyDerivation: { algorithm: "sha256" },
    });
    const encoded = encoder.encode("authenticated secret");
    const footerStart = encoded.lastIndexOf(encoder.getCharSetInfo().paddingChar);
    const downgraded = encoded.slice(0, footerStart);

    expect(footerStart).toBeGreaterThan(0);
    expect(() => encoder.decodeToUint8Array(downgraded)).toThrow(Ddu64DecryptionError);
  });

  it("allows explicit plaintext compatibility on keyed decoders", () => {
    const plainEncoder = createEncoder();
    const keyedDecoder = createEncoder({
      encryptionKey: "plaintext-compatibility-key",
      keyDerivation: { algorithm: "sha256" },
    });
    const encoded = plainEncoder.encode("legacy plaintext");

    expect(() => keyedDecoder.decode(encoded)).toThrow(Ddu64DecryptionError);
    expect(keyedDecoder.decode(encoded, { requireEncryption: false })).toBe("legacy plaintext");
    expect(keyedDecoder.decode(encoded, { encrypt: false } as DduInternalOptions)).toBe(
      "legacy plaintext",
    );
  });

  it("rejects invalid runtime options and input with stable error code", () => {
    const encoder = createEncoder();
    const invalidCases = [
      () => encoder.encode("data", { compressionAlgorithm: "gzip" } as never),
      () => encoder.encode("data", { chunkSize: Number.MIN_VALUE }),
      () => encoder.encode("data", { compress: "yes" } as never),
      () => encoder.encode("data", { compressionLevel: Number.NaN }),
      () => encoder.encode("data", { onProgress: "callback" } as never),
      () => encoder.decode(new Uint8Array([1, 2, 3]) as never),
    ];

    for (const run of invalidCases) {
      expect(run).toThrow(Ddu64InvalidInputError);
      try {
        run();
      } catch (error) {
        expect((error as Ddu64InvalidInputError).code).toBe(Ddu64ErrorCode.InvalidInput);
      }
    }
  });

  it("rejects non-object runtime option containers with stable error code", () => {
    const encoder = createEncoder();

    for (const options of [null, false, 0, "", "options", Symbol("options")]) {
      expect(() => encoder.encode("data", options as never)).toThrow(Ddu64InvalidInputError);
      try {
        encoder.encode("data", options as never);
      } catch (error) {
        expect((error as Ddu64InvalidInputError).code).toBe(Ddu64ErrorCode.InvalidInput);
      }
    }
  });

  it("accepts Uint8Array values created in another realm", () => {
    const encoder = createEncoder();
    const foreignBytes = runInNewContext("new Uint8Array([1, 2, 3, 4])") as Uint8Array;

    const encoded = encoder.encode(foreignBytes);
    expect(encoder.decodeToUint8Array(encoded)).toEqual(new Uint8Array([1, 2, 3, 4]));

    const encryptedEncoder = createEncoder({
      encryptionKey: "cross-realm-salt",
      keyDerivation: {
        algorithm: "pbkdf2",
        salt: foreignBytes,
        iterations: 10_000,
      },
    });
    const encrypted = encryptedEncoder.encode(foreignBytes);
    expect(encryptedEncoder.decodeToUint8Array(encrypted)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("rejects malformed constructor options before charset setup", () => {
    const invalidCases = [
      { throwOnError: "yes" },
      { encryptionKey: 42 },
      { dduChar: [1, 2], paddingChar: "=" },
      { codaChar: "ㄱ" },
      { requiredLength: 1.5 },
      { keyDerivation: "pbkdf2" },
      { adapterFactory: "factory" },
      { asyncAdapterFactory: "factory" },
      { obfuscationLayerFactory: "factory" },
    ];

    for (const options of invalidCases) {
      expect(() => createEncoder(options)).toThrow(Ddu64InvalidInputError);
    }
  });

  it("rejects an empty encryption key", () => {
    expect(() => createEncoder({ encryptionKey: "" })).toThrow(Ddu64InvalidInputError);
  });

  it("rejects lone surrogate charset and padding symbols", () => {
    const base = ["A", "B", "C"];

    expect(() => new Ddu64Core([...base, "\uD800"], "=")).toThrow(/surrogate/i);
    expect(() => new Ddu64Core([...base, "\uDC00"], "=")).toThrow(/surrogate/i);
    expect(() => new Ddu64Core(base, "\uD800")).toThrow(/surrogate/i);
    const encoder = new Ddu64Core(["A", "B", "C", "D"], "=");
    expect(encoder.decode(encoder.encode("AB"))).toBe("AB");
  });

  it("wraps invalid constructor charset configuration", () => {
    expect(
      () =>
        new Ddu64Core(["A", "A", "B", "C"], "=", {
          adapter: new NodeAdapter(),
          requiredLength: 4,
        }),
    ).toThrow(Ddu64CharsetError);
  });

  it("falls back before encoding when padding removal invalidates a lenient charset", () => {
    const encoder = new Ddu64Core({
      dduChar: ["A", "B"],
      paddingChar: "A",
      throwOnError: false,
    });

    expect(encoder.getCharSetInfo().charSet.length).toBeGreaterThan(1);
    expect(encoder.decode(encoder.encode("fallback"))).toBe("fallback");
  });

  it("rejects an explicitly empty custom charset", () => {
    expect(() => new Ddu64Core({ dduChar: "", paddingChar: "=" })).toThrow(Ddu64CharsetError);
  });

  it("does not enable repeat padding for an empty coda array", () => {
    const dduChar = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const baseline = new Ddu64Core({ dduChar, paddingChar: "=" });
    const emptyCoda = new Ddu64Core({ dduChar, paddingChar: "=", codaChar: [] });

    expect(emptyCoda.encode("A")).toBe(baseline.encode("A"));
  });

  it("rejects invalid chunk settings after constructor and call options are merged", () => {
    expect(() => new Ddu64Core({ chunkSize: 4 }).encode("chunked", { chunkSeparator: "" })).toThrow(
      Ddu64InvalidInputError,
    );
    expect(() => new Ddu64Core({ chunkSeparator: "" }).encode("chunked", { chunkSize: 4 })).toThrow(
      Ddu64InvalidInputError,
    );
  });

  it("rejects invalid bit lengths at the fused mapper boundary", () => {
    expect(() => packPow2ToString(new Uint8Array([1]), 0, new Uint16Array([65]))).toThrow(
      Ddu64EncodeError,
    );
    expect(() => unpackPow2FromString("A", 0, 0, new Int32Array([0]), 65)).toThrow(
      Ddu64DecodeError,
    );
  });

  it("rejects unknown presets and multi-code-unit charset symbols", () => {
    expect(() => new Ddu64Core({ dduSetSymbol: "removed-preset" as never })).toThrow(
      Ddu64CharsetError,
    );
    expect(() => new Ddu64Core({ dduChar: ["A", "😀"], paddingChar: "=" })).toThrow(
      /multi-character symbols/i,
    );
  });

  it("round-trips a large BMP charset", () => {
    const dduChar = Array.from({ length: 1024 }, (_, index) => String.fromCharCode(0x4000 + index));
    const encoder = new Ddu64Core({ dduChar, paddingChar: "倀" });
    const input = new Uint8Array([0, 1, 127, 128, 255]);

    expect(encoder.decodeToUint8Array(encoder.encode(input))).toEqual(input);
  });

  it("round-trips a sparse high-code-unit charset", () => {
    const encoder = new Ddu64Core(["가", "나", "다", "힣"], "뭐");
    const input = new Uint8Array([0, 1, 200, 255, 42]);

    expect(encoder.decodeToUint8Array(encoder.encode(input))).toEqual(input);
  });

  it("round-trips a deterministic 20KB payload", () => {
    const encoder = new Ddu64Core();
    const input = new Uint8Array(20_000);
    for (let i = 0; i < input.length; i++) input[i] = (i * 31) & 0xff;

    expect(encoder.decodeToUint8Array(encoder.encode(input))).toEqual(input);
  });

  it("round-trips with a numeric padding character", () => {
    const encoder = new Ddu64Core({ dduChar: "abcdefgh", paddingChar: "1" });
    expect(encoder.decode(encoder.encode("numeric padding"))).toBe("numeric padding");
  });

  it.each([true, false])("disambiguates numeric padding with pow2=%s", (usePowerOfTwo) => {
    for (const size of [8, 64, 1024, 2048, 4096, 8192, 32768]) {
      const dduChar = Array.from({ length: size }, (_, i) => String.fromCharCode(0x4000 + i));
      for (const paddingChar of "0123456789") {
        const encoder = new Ddu64Core({
          dduChar,
          paddingChar,
          usePowerOfTwo,
          useRepeatPadding: true,
        });
        const numericFooter = new Ddu64Core({ dduChar, paddingChar, usePowerOfTwo });
        for (const length of [1, 2, 4, 5, 7]) {
          const bytes = new Uint8Array(length).fill(65);
          const encoded = encoder.encode(bytes);
          expect(encoder.decodeToUint8Array(encoded)).toEqual(bytes);
          expect(numericFooter.decodeToUint8Array(encoded)).toEqual(bytes);
          expect(encoder.decodeToUint8Array(numericFooter.encode(bytes))).toEqual(bytes);
        }
      }
    }
  });

  it.each([
    ["3", "XV"],
    ["4", "XV"],
    ["C", "EN"],
    ["A", "XELYSI"],
    ["O", "XGRISE"],
  ])("keeps payload text that resembles a footer with padding=%s", (paddingChar, payload) => {
    const base64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const alphabet = [...base64.replace(paddingChar, "!")];
    const lastIndex = alphabet.indexOf(payload.at(-1)!);
    // 마지막 심볼의 하위 4비트가 0인 유효한 payload를 구성합니다.
    [alphabet[16], alphabet[lastIndex]] = [alphabet[lastIndex], alphabet[16]];
    const bytes = new Uint8Array(
      Buffer.from([...payload].map((char) => base64[alphabet.indexOf(char)]).join(""), "base64"),
    );
    for (const useRepeatPadding of [false, true]) {
      const encoder = new Ddu64Core({ dduChar: alphabet, paddingChar, useRepeatPadding });
      const encoded = encoder.encode(bytes);
      expect(encoded).toBe(
        payload + (useRepeatPadding ? paddingChar.repeat(2) : paddingChar + "4"),
      );
      expect(encoder.decodeToUint8Array(encoded)).toEqual(bytes);
    }
  });

  it.each(footerCollisionVectors.vectors)(
    "decodes authenticated footer collisions with padding=$paddingChar",
    async ({ dduChar, paddingChar, encoded }) => {
      const encoder = createEncoder({
        dduChar,
        paddingChar,
        encryptionKey: footerCollisionVectors.encryptionKey,
        keyDerivation: { algorithm: "sha256" },
      });
      expect(encoder.decode(encoded)).toBe(footerCollisionVectors.plaintext);
      expect(await encoder.decodeAsync(encoded)).toBe(footerCollisionVectors.plaintext);
      const tampered = encoded.slice(0, -7) + paddingChar + "ELYSIAENCV42";
      expect(() => encoder.decode(tampered)).toThrow(Ddu64DecryptionError);
      await expect(encoder.decodeAsync(tampered)).rejects.toThrow(Ddu64DecryptionError);
    },
  );

  it.each([false, true])("reports monotonic decode progress with async=%s", async (async) => {
    for (const checksumScope of ["plaintext", "output"] as const) {
      const encoder = createEncoder({
        compress: true,
        checksum: true,
        checksumScope,
        encryptionKey: "progress-key",
        keyDerivation: { algorithm: "sha256" },
      });
      const input = "progress payload ".repeat(100);
      const encoded = encoder.encode(input);
      const progress: number[] = [];
      const options = { onProgress: ({ percent }: { percent: number }) => progress.push(percent) };
      expect(
        async ? await encoder.decodeAsync(encoded, options) : encoder.decode(encoded, options),
      ).toBe(input);
      expect(progress[0]).toBe(0);
      expect(progress.at(-1)).toBe(100);
      expect(progress).toEqual([...progress].sort((a, b) => a - b));
    }
  });

  it("wraps URL-safe charset conflicts as charset errors", () => {
    expect(() =>
      createEncoder({
        dduChar: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
        paddingChar: "=",
        urlSafe: true,
      }),
    ).toThrow(Ddu64CharsetError);
  });

  it("shares lookup tables across predefined charset instances only", () => {
    const first = createEncoder();
    const second = createEncoder();
    const customFirst = new Ddu64Core(
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
      "=",
      {
        adapter: new NodeAdapter(),
      },
    );
    const customSecond = new Ddu64Core(
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
      "=",
      {
        adapter: new NodeAdapter(),
      },
    );

    expect((first as unknown as { dduCharCodeLookup: Int32Array }).dduCharCodeLookup).toBe(
      (second as unknown as { dduCharCodeLookup: Int32Array }).dduCharCodeLookup,
    );
    expect(
      (customFirst as unknown as { dduCharCodeLookup: Int32Array }).dduCharCodeLookup,
    ).not.toBe((customSecond as unknown as { dduCharCodeLookup: Int32Array }).dduCharCodeLookup);
  });

  it("deduplicates concurrent async key derivation", async () => {
    const adapter = new CountingKeyAdapter();
    const encoder = new Ddu64Core(undefined, undefined, {
      adapter,
      encryptionKey: "single-flight-key",
      keyDerivation: { algorithm: "sha256" },
    });

    await Promise.all([
      encoder.encodeAsync("first"),
      encoder.encodeAsync("second"),
      encoder.encodeAsync("third"),
    ]);

    expect(adapter.deriveKeyCalls).toBe(1);
  });

  it("derives the raw input limit from constructor maxDecodedBytes", () => {
    const encoder = createEncoder({ maxDecodedBytes: 8 });

    expect(() => encoder.decode("\n".repeat(2000))).toThrow(Ddu64LimitError);
  });

  it("derives the raw input limit from a call-level maxDecodedBytes override", () => {
    const encoder = createEncoder();
    const input = "\n".repeat(2000);

    expect(() => encoder.decode(input, { maxDecodedBytes: 8 })).toThrow(Ddu64LimitError);
    expect(encoder.decode(input, { maxDecodedBytes: 8, maxEncodedChars: 2500 })).toBe("");
  });

  it("lets call-level chunkSize zero disable constructor chunking", () => {
    const encoder = new Ddu64Core({ chunkSize: 4, chunkSeparator: "\n" });
    const input = "hello world payload";

    expect(encoder.encode(input)).toContain("\n");
    const flat = encoder.encode(input, { chunkSize: 0 });
    expect(flat).not.toContain("\n");
    expect(encoder.decode(flat)).toBe(input);
  });

  it("validates coda characters", () => {
    expect(
      () =>
        new Ddu64Core(["가", "나", "다", "라"], "뭐", {
          codaChar: ["", "ㅏ"],
          throwOnError: true,
        }),
    ).toThrow(/coda/i);
    expect(
      () =>
        new Ddu64Core(["가", "나", "다", "라"], "뭐", {
          codaChar: ["", "ㄱ", "ㄲ", "ㄷ"],
          throwOnError: true,
        }),
    ).not.toThrow();
  });

  it("rejects fractional byte-limit options at the API boundary", () => {
    const encoder = createEncoder();
    const encoded = encoder.encode("fractional-limit");

    for (const limitName of ["maxDecodedBytes", "maxDecompressedBytes"] as const) {
      expect(() => encoder.decode(encoded, { [limitName]: 0.5 })).toThrow(Ddu64InvalidInputError);
      try {
        encoder.decode(encoded, { [limitName]: 0.5 });
      } catch (error) {
        expect((error as Ddu64InvalidInputError).code).toBe(Ddu64ErrorCode.InvalidInput);
      }
    }

    expect(encoder.decode(encoded, { maxDecodedBytes: 1024 })).toBe("fractional-limit");
    expect(encoder.decode(encoded, { maxDecodedBytes: Number.POSITIVE_INFINITY })).toBe(
      "fractional-limit",
    );
  });

  it("preserves custom error class names and identity", () => {
    const err = new Ddu64InvalidInputError("name-check");
    expect(err.name).toBe("Ddu64InvalidInputError");
    expect(err.code).toBe(Ddu64ErrorCode.InvalidInput);
  });

  it("returns derived key material independent of any shared backing buffer", () => {
    const adapter = new NodeAdapter();
    const a = adapter.deriveKeySync("key-isolation", { algorithm: "sha256" });
    const b = adapter.deriveKeySync("key-isolation", { algorithm: "sha256" });
    expect(a).not.toBe(b);
    expect(a.buffer).not.toBe(b.buffer);
    a.fill(0);
    expect(b.some((byte) => byte !== 0)).toBe(true);
  });
});
