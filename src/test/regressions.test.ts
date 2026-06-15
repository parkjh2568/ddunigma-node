import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { NodeAdapter } from "../adapters/NodeAdapter.js";
import { Ddu64Core } from "../core/Ddu64Core.js";
import {
  Ddu64CharsetError,
  Ddu64DecryptionError,
  Ddu64ErrorCode,
  Ddu64InvalidInputError,
} from "../core/errors.js";
import type { DduInternalOptions, KeyDerivationOptions } from "../core/types.js";

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

  it("rejects fractional byte-limit options at the API boundary", () => {
    const encoder = createEncoder();
    const encoded = encoder.encode("fractional-limit");

    // 0.5는 이전엔 검증을 통과한 뒤 normalizeLimit의 floor에서 0이 되어
    // 모든 입력이 한도를 초과한 것처럼 오탐되었습니다. 이제 경계에서 거부합니다.
    for (const limitName of ["maxDecodedBytes", "maxDecompressedBytes"] as const) {
      expect(() => encoder.decode(encoded, { [limitName]: 0.5 })).toThrow(Ddu64InvalidInputError);
      try {
        encoder.decode(encoded, { [limitName]: 0.5 });
      } catch (error) {
        expect((error as Ddu64InvalidInputError).code).toBe(Ddu64ErrorCode.InvalidInput);
      }
    }

    // 정수와 Infinity는 그대로 허용됩니다.
    expect(encoder.decode(encoded, { maxDecodedBytes: 1024 })).toBe("fractional-limit");
    expect(encoder.decode(encoded, { maxDecodedBytes: Number.POSITIVE_INFINITY })).toBe(
      "fractional-limit",
    );
  });

  it("preserves custom error class names and identity", () => {
    const err = new Ddu64InvalidInputError("name-check");
    // 소스 빌드에서는 항상 정확하며, published(미니파이) 빌드는 pack:check 스모크가 검증합니다.
    expect(err.name).toBe("Ddu64InvalidInputError");
    expect(err.code).toBe(Ddu64ErrorCode.InvalidInput);
  });

  it("returns derived key material independent of any shared backing buffer", () => {
    const adapter = new NodeAdapter();
    const a = adapter.deriveKeySync("key-isolation", { algorithm: "sha256" });
    const b = adapter.deriveKeySync("key-isolation", { algorithm: "sha256" });
    // 동일 입력이라도 서로 다른 버퍼를 반환해야 합니다(뷰 공유로 인한 키 자료 노출 방지).
    expect(a).not.toBe(b);
    expect(a.buffer).not.toBe(b.buffer);
    a.fill(0);
    expect(b.some((byte) => byte !== 0)).toBe(true);
  });
});
