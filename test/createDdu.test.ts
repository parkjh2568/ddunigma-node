import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createDdu as createNodeDdu, Ddu64 } from "../src/index.js";
import { createDdu as createBrowserDdu } from "../src/browser.js";
import { NodeAdapter } from "../src/adapters/NodeAdapter.js";
import { BrowserAdapter } from "../src/adapters/BrowserAdapter.js";
import { spawnSync } from "node:child_process";
import { Ddu64Error, Ddu64InvalidInputError } from "../src/core/errors.js";
import type { DduCodec, DduCreateOptions } from "../src/core/types.js";

describe.each([
  { name: "Node", createDdu: createNodeDdu, Adapter: NodeAdapter },
  { name: "Browser", createDdu: createBrowserDdu, Adapter: BrowserAdapter },
])("createDdu: $name", ({ name, createDdu, Adapter }) => {
  it("rejects detached KDF salt as a typed construction error", () => {
    const salt = new Uint8Array([1, 2, 3]);
    structuredClone(salt.buffer, { transfer: [salt.buffer] });
    expect(() => createDdu({ encryptionKey: "key", keyDerivation: { salt } })).toThrow(
      Ddu64InvalidInputError,
    );
  });

  it("retries invalid adapter initialization instead of caching a failed result", async () => {
    const adapter = new Adapter();
    const factory = vi.fn(async () => adapter).mockResolvedValueOnce(undefined as never);
    const ddu = createDdu({ compress: true, asyncAdapterFactory: factory });
    await expect(ddu.encode("first")).rejects.toMatchObject({ code: "DDU64_ADAPTER_UNAVAILABLE" });
    expect(await ddu.decode(await ddu.encode("retry"))).toBe("retry");
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("rejects async progress callbacks without an unhandled rejection", () => {
    const entry = new URL(
      name === "Node" ? "../src/index.ts" : "../src/browser.ts",
      import.meta.url,
    ).href;
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
      import { createDdu, Ddu64ErrorCode } from ${JSON.stringify(entry)};
      import { setImmediate } from "node:timers/promises";
      for (const reject of [false, true]) {
        const ddu = createDdu({ onProgress: async () => { if (reject) throw new Error("callback"); } });
        try { await ddu.encode("x"); throw new Error("unexpected success"); }
        catch (error) { if (error.code !== Ddu64ErrorCode.InvalidInput) throw error; }
      }
      await setImmediate();
      console.log("handled");
    `,
      ],
      { encoding: "utf8", timeout: 10_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("handled");
  });
  it.each<DduCreateOptions>([
    {},
    { dduSetSymbol: "ddu_v1" },
    { dduChar: "abcd", paddingChar: "=", chunkSize: 8, chunkSeparator: "\r\n|" },
    { obfuscate: true, urlSafe: true },
    { checksum: true, checksumScope: "plaintext" },
    { compress: true },
    { encryptionKey: "test-key", keyDerivation: { algorithm: "sha256" } },
    {
      compress: true,
      encryptionKey: "test-key",
      keyDerivation: { algorithm: "pbkdf2", salt: "test-salt", iterations: 10_000 },
      obfuscate: true,
      checksum: true,
    },
  ])("uses the same Promise methods with %j", async (options) => {
    const ddu = createDdu({ ...options, output: "text" });
    for (const input of ["", "\uFEFF한글 😀 test ".repeat(8)]) {
      const encoded = ddu.encode(input);
      expect(encoded).toBeInstanceOf(Promise);
      const decoded = ddu.decode(await encoded);
      expect(decoded).toBeInstanceOf(Promise);
      expect(await decoded).toBe(input);
    }
  });

  it("fixes the output type at creation and preserves arbitrary bytes", async () => {
    const text = createDdu();
    const bytes = createDdu({ output: "bytes", compress: true, checksum: true });
    expectTypeOf(text).toEqualTypeOf<DduCodec>();
    expectTypeOf(bytes).toEqualTypeOf<DduCodec<Uint8Array>>();
    expectTypeOf(text.decode).returns.toEqualTypeOf<Promise<string>>();
    expectTypeOf(bytes.decode).returns.toEqualTypeOf<Promise<Uint8Array>>();
    const dynamic: DduCreateOptions = { output: "bytes" };
    expectTypeOf(createDdu(dynamic)).toEqualTypeOf<DduCodec<string | Uint8Array>>();
    const input = new Uint8Array([0, 255, 128, 192, 1]);
    expect(await bytes.decode(await bytes.encode(input))).toEqual(input);
    expect(typeof new Ddu64().encode("legacy sync")).toBe("string");
  });

  it("does not initialize adapters for plain, checksum or obfuscation work", async () => {
    const factory = vi.fn(async () => new Adapter());
    const ddu = createDdu({ checksum: true, obfuscate: true, asyncAdapterFactory: factory });
    expect(await ddu.decode(await ddu.encode("no adapter"))).toBe("no adapter");
    expect(factory).not.toHaveBeenCalled();
  });

  it("shares first adapter and key initialization across concurrent calls", async () => {
    const adapter = new Adapter();
    const derive = vi.spyOn(adapter, "deriveKey");
    const factory = vi.fn(async () => adapter);
    const ddu = createDdu({
      compress: true,
      encryptionKey: "concurrent-key",
      keyDerivation: { algorithm: "sha256" },
      asyncAdapterFactory: factory,
    });
    const inputs = ["first", "second", "third"];
    const encoded = await Promise.all(inputs.map((input) => ddu.encode(input)));
    expect(await Promise.all(encoded.map((input) => ddu.decode(input)))).toEqual(inputs);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(derive).toHaveBeenCalledTimes(1);
  });

  it("retries failed initialization without leaking policy to other instances", async () => {
    const adapter = new Adapter();
    const derive = vi.spyOn(adapter, "deriveKey").mockRejectedValueOnce(new Error("key retry"));
    const factory = vi.fn(async () => adapter).mockRejectedValueOnce(new Error("adapter retry"));
    const ddu = createDdu({
      encryptionKey: "retry-key",
      keyDerivation: { algorithm: "sha256" },
      asyncAdapterFactory: factory,
    });
    await expect(ddu.encode("first")).rejects.toBeInstanceOf(Ddu64Error);
    await expect(ddu.encode("second")).rejects.toBeInstanceOf(Ddu64Error);
    expect(await ddu.decode(await ddu.encode("third"))).toBe("third");
    expect(factory).toHaveBeenCalledTimes(2);
    expect(derive).toHaveBeenCalledTimes(2);
    const plain = createDdu();
    expect(await plain.encode("plain")).toBe(new Ddu64().encode("plain"));
  });

  it("snapshots constructor settings and input before the first await", async () => {
    const input = new TextEncoder().encode("\uFEFFsnapshot input 😀");
    const original = input.slice();
    const options: DduCreateOptions = {
      output: "bytes",
      dduChar: ["가", "나", "다", "라"],
      codaChar: ["", "ㄱ"],
      paddingChar: "=",
      encryptionKey: "snapshot-key",
      keyDerivation: { algorithm: "pbkdf2", iterations: 10_000, salt: new Uint8Array([1, 2, 3]) },
      compress: true,
      checksum: true,
      obfuscate: true,
    };
    const ddu = createDdu(options);
    const reference = createDdu(options);
    const pending = ddu.encode(input.subarray(0));
    input.fill(0);
    structuredClone(input.buffer, { transfer: [input.buffer] });
    (options.dduChar as string[]).reverse();
    options.codaChar![1] = "ㄴ";
    (options.keyDerivation!.salt as Uint8Array).fill(9);
    options.keyDerivation!.iterations = 10_001;
    options.output = "text";
    options.obfuscate = false;
    const encoded = await pending;
    expect(await reference.decode(encoded)).toEqual(original);
    expect(await ddu.decode(encoded)).toEqual(original);
  });

  it("preserves explicit adapters, custom obfuscation and callback errors", async () => {
    const adapter = new Adapter();
    const ignoredFactory = vi.fn(async () => new Adapter());
    const layer = { obfuscate: vi.fn((s: string) => s), deobfuscate: vi.fn((s: string) => s) };
    const ddu = createDdu({
      compress: true,
      adapter,
      asyncAdapterFactory: ignoredFactory,
      obfuscate: true,
      obfuscationLayerFactory: () => layer,
    });
    expect(await ddu.decode(await ddu.encode("custom"))).toBe("custom");
    expect(ignoredFactory).not.toHaveBeenCalled();
    expect(layer.obfuscate).toHaveBeenCalledTimes(1);
    expect(layer.deobfuscate).toHaveBeenCalledTimes(1);
    const cause = new Error("callback failed");
    const failing = createDdu({
      onProgress: () => {
        throw cause;
      },
    });
    await expect(failing.encode("callback")).rejects.toMatchObject({ cause, operation: "encode" });
  });

  it("keeps decompression limits and rejects invalid inputs asynchronously", async () => {
    const ddu = createDdu({ compress: true, maxDecompressedBytes: 16 });
    await expect(ddu.decode(await ddu.encode("x".repeat(256)))).rejects.toMatchObject({
      code: "DDU64_DECOMPRESSION_FAILED",
      message: expect.stringMatching(/limit/i),
    });
    const encode = ddu.encode(null as any);
    const decode = ddu.decode(null as any);
    expect(encode).toBeInstanceOf(Promise);
    expect(decode).toBeInstanceOf(Promise);
    await expect(encode).rejects.toBeInstanceOf(Ddu64InvalidInputError);
    await expect(decode).rejects.toBeInstanceOf(Ddu64InvalidInputError);
  });

  it.each([null, [], "abcd", { output: "buffer" }, { output: null }, { compress: "yes" }])(
    "rejects invalid creation options synchronously: %j",
    (options) => {
      expect(() => createDdu(options as any)).toThrow(Ddu64InvalidInputError);
    },
  );
});
