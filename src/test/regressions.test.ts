import { describe, expect, it } from "vitest";
import { NodeAdapter } from "../adapters/NodeAdapter.js";
import { Ddu64Core } from "../core/Ddu64Core.js";
import {
  Ddu64CharsetError,
  Ddu64DecryptionError,
  Ddu64ErrorCode,
  Ddu64InvalidInputError,
} from "../core/errors.js";
import type { KeyDerivationOptions } from "../core/types.js";

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
    expect(keyedDecoder.decode(encoded, { encrypt: false })).toBe("legacy plaintext");
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

  it("rejects malformed constructor options before charset setup", () => {
    const invalidCases = [
      { throwOnError: "yes" },
      { encryptionKey: 42 },
      { dduChar: [1, 2], paddingChar: "=" },
      { codaChar: "ㄱ" },
      { requiredLength: 1.5 },
      { keyDerivation: "pbkdf2" },
    ];

    for (const options of invalidCases) {
      expect(() => createEncoder(options)).toThrow(Ddu64InvalidInputError);
    }
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
});
