import { Ddu64 as RootDdu64, createDdu as createRootDdu, Ddu64ErrorCode } from "@ddunigma/node";
import { Ddu64, createDdu } from "@ddunigma/node/browser";
import { BrowserAdapter, Ddu64 as SecureDdu64 } from "@ddunigma/node/secure";
import footerCollisionVectors from "./fixtures/footer-collision-vectors.json";

// scripts/browser-smoke.mjs bundles this entry with browser export conditions.
export async function runBrowserSmoke({
  options,
  input,
  encoded: nodeEncoded,
  compressionVectors,
}) {
  if (
    RootDdu64 !== Ddu64 ||
    createRootDdu !== createDdu ||
    "decodeToBuffer" in SecureDdu64.prototype
  ) {
    throw new Error("Package exports did not select browser implementations");
  }

  const unhandled = [];
  const onUnhandled = (event) => {
    unhandled.push(event.reason);
    event.preventDefault();
  };
  globalThis.addEventListener("unhandledrejection", onUnhandled);
  try {
    for (const reject of [false, true]) {
      const ddu = createDdu({
        onProgress: async () => {
          if (reject) throw new Error("progress");
        },
      });
      let failed = false;
      try {
        await ddu.encode("x");
      } catch (error) {
        if (error.code !== Ddu64ErrorCode.InvalidInput) throw error;
        failed = true;
      }
      if (!failed) throw new Error("Promise progress result was accepted");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (unhandled.length) throw new Error("Progress callback leaked a rejection");
  } finally {
    globalThis.removeEventListener("unhandledrejection", onUnhandled);
  }

  const detached = new Uint8Array(3);
  structuredClone(detached.buffer, { transfer: [detached.buffer] });
  let invalidSalt = false;
  try {
    createDdu({ encryptionKey: "key", keyDerivation: { salt: detached } });
  } catch (error) {
    if (error.code !== Ddu64ErrorCode.InvalidInput) throw error;
    invalidSalt = true;
  }
  if (!invalidSalt) throw new Error("Detached KDF salt was accepted");

  for (const checksum of [false, true]) {
    const ddu = new Ddu64();
    for (const [stream, chunk] of [
      [await ddu.createEncodeStream({ checksum }), "abc"],
      [await ddu.createEncodeStream({ checksum }), detached],
      [await ddu.createDecodeStream({ maxBufferedChars: 1 }), ["x".repeat(224)]],
    ]) {
      const reader = stream.readable.getReader();
      const writer = stream.writable.getWriter();
      const reading = (async () => {
        for (;;) {
          if ((await reader.read()).done) break;
        }
      })();
      const writing = (async () => {
        await writer.write(chunk);
        await writer.close();
      })();
      const outcomes = await Promise.allSettled([reading, writing]);
      if (
        outcomes.some(
          (r) => r.status !== "rejected" || r.reason.code !== Ddu64ErrorCode.InvalidInput,
        )
      ) {
        throw new Error("Invalid stream chunk was accepted or its failure was lost");
      }
      if (outcomes[0].reason !== outcomes[1].reason)
        throw new Error("Stream sides received different errors");
    }
  }

  const b64 = createDdu({
    dduChar: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
    paddingChar: "=",
    chunkSize: 2,
    chunkSeparator: "ABA",
  });
  let overlap = false;
  try {
    await b64.encode(new Uint8Array([0, 16, 130]));
  } catch (error) {
    if (error.code !== Ddu64ErrorCode.EncodeFailed) throw error;
    overlap = true;
  }
  if (!overlap) throw new Error("Overlapping separator was accepted");

  const direct = new BrowserAdapter();
  const rawKey = await direct.deriveKey("cause", { algorithm: "sha256" });
  const tampered = await direct.encrypt(new Uint8Array([1]), rawKey);
  tampered[12] ^= 1;
  let authenticated = false;
  try {
    await direct.decrypt(tampered, rawKey);
  } catch (error) {
    if (!error.cause) throw new Error("WebCrypto cause was lost", { cause: error });
    authenticated = true;
  }
  if (!authenticated) throw new Error("Tampered ciphertext was accepted");

  for (const config of [{}, { obfuscate: true }, { checksum: true }, { compress: true }, options]) {
    const simple = createDdu(config);
    const pending = simple.encode(input);
    if (!(pending instanceof Promise) || (await simple.decode(await pending)) !== input) {
      throw new Error("createDdu Promise contract or round-trip failed");
    }
  }
  const simple = createDdu(options);
  if ((await simple.decode(nodeEncoded)) !== input) throw new Error("Node to createDdu failed");
  const simpleEncoded = await simple.encode(input);
  const binary = createDdu({ ...options, output: "bytes" });
  const binaryInput = new Uint8Array([0, 255, 128, 192]);
  const expectedBytes = binaryInput.slice();
  const pendingBytes = binary.encode(binaryInput);
  binaryInput.fill(0);
  const binaryDecoded = await binary.decode(await pendingBytes);
  if (
    binaryDecoded.length !== expectedBytes.length ||
    binaryDecoded.some((byte, i) => byte !== expectedBytes[i])
  ) {
    throw new Error("createDdu binary snapshot failed");
  }

  const compression = {};
  for (const { algorithm, encoded } of compressionVectors) {
    const format = algorithm === "deflate" ? "deflate-raw" : "brotli";
    const capabilities = {};
    for (const [direction, Stream] of [
      ["compress", globalThis.CompressionStream],
      ["decompress", globalThis.DecompressionStream],
    ]) {
      try {
        new Stream(format);
        capabilities[direction] = true;
      } catch {
        capabilities[direction] = false;
      }
    }
    compression[format] = capabilities;
    const ddu = createDdu({ compress: true, compressionAlgorithm: algorithm });
    for (const direction of ["compress", "decompress"]) {
      let succeeded = false;
      try {
        const result =
          direction === "compress" ? await ddu.encode(input) : await ddu.decode(encoded);
        succeeded = true;
        if (direction === "decompress" && result !== input)
          throw new Error("native decompression mismatch");
      } catch (error) {
        if (capabilities[direction] || error.code !== Ddu64ErrorCode.AdapterUnavailable)
          throw error;
      }
      if (succeeded !== capabilities[direction])
        throw new Error(`${format} ${direction} capability mismatch`);
    }
  }

  for (const { dduChar, paddingChar, encoded } of footerCollisionVectors.vectors) {
    const codec = new Ddu64({
      dduChar,
      paddingChar,
      encryptionKey: footerCollisionVectors.encryptionKey,
      keyDerivation: { algorithm: "sha256" },
    });
    if ((await codec.decodeAsync(encoded)) !== footerCollisionVectors.plaintext) {
      throw new Error(`Authenticated footer collision failed: padding=${paddingChar}`);
    }
  }

  for (const obfuscate of [false, true]) {
    const codec = new Ddu64({ obfuscate });
    for (const size of [0, 1, 2, 3, 31, 256, 16 * 1024]) {
      const bytes = Uint8Array.from({ length: size }, (_, i) => (i * 31 + 17) & 255);
      const decoded = codec.decodeToUint8Array(codec.encode(bytes));
      if (decoded.length !== size || decoded.some((byte, i) => byte !== bytes[i])) {
        throw new Error(`DDU round-trip failed: size=${size}, obfuscate=${obfuscate}`);
      }
    }
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const toBase64 = Object.getOwnPropertyDescriptor(Uint8Array.prototype, "toBase64");
  const fromBase64 = Object.getOwnPropertyDescriptor(Uint8Array, "fromBase64");
  try {
    // Exercise native typed-array Base64 and the JS fallback in the same engine.
    for (const fallback of [false, true]) {
      if (fallback) {
        Object.defineProperty(Uint8Array.prototype, "toBase64", {
          value: undefined,
          configurable: true,
        });
        Object.defineProperty(Uint8Array, "fromBase64", { value: undefined, configurable: true });
      }
      const codec = new Ddu64(alphabet, "=", { useRepeatPadding: true });
      const simple = createDdu({ dduChar: alphabet, paddingChar: "=", useRepeatPadding: true });
      for (const plain of ["A", "AB", "ABC", "ABCDEF"]) {
        const encoded = codec.encode(plain);
        if (encoded !== globalThis.btoa(plain) || codec.decode(encoded) !== plain) {
          throw new Error(`Base64 round-trip failed: fallback=${fallback}`);
        }
        if ((await simple.encode(plain)) !== encoded || (await simple.decode(encoded)) !== plain) {
          throw new Error(`createDdu Base64 failed: fallback=${fallback}`);
        }
      }
    }
  } finally {
    if (toBase64) Object.defineProperty(Uint8Array.prototype, "toBase64", toBase64);
    else delete Uint8Array.prototype.toBase64;
    if (fromBase64) Object.defineProperty(Uint8Array, "fromBase64", fromBase64);
    else delete Uint8Array.fromBase64;
  }

  const codec = new Ddu64(options);
  const progress = [];
  if (
    (await codec.decodeAsync(nodeEncoded, {
      onProgress: ({ percent }) => progress.push(percent),
    })) !== input
  ) {
    throw new Error("Node to browser encrypted/compressed interoperability failed");
  }
  if (progress.some((percent, i) => i > 0 && percent < progress[i - 1])) {
    throw new Error("Decode progress regressed");
  }
  const encoded = await codec.encodeAsync(input);
  for (const Codec of [Ddu64, SecureDdu64]) {
    const eager = Codec === Ddu64 ? await Codec.create(options) : new Codec(options);
    if ((await eager.decodeAsync(encoded)) !== input) {
      throw new Error(`${Codec.name} eager/secure round-trip failed`);
    }
  }

  const bytes = new TextEncoder().encode(input);
  const callOptions = { checksumScope: "plaintext", obfuscate: true };
  const pendingEncode = codec.encodeAsync(bytes, callOptions);
  bytes.fill(0);
  callOptions.obfuscate = false;
  if ((await codec.decodeAsync(await pendingEncode, { obfuscate: true })) !== input) {
    throw new Error("Async input/options snapshot failed");
  }

  const limitOptions = { maxDecompressedBytes: 1 };
  const pendingDecode = codec.decodeAsync(encoded, limitOptions);
  limitOptions.maxDecompressedBytes = 64 * 1024 * 1024;
  let limited = false;
  try {
    await pendingDecode;
  } catch (error) {
    if (error.code !== Ddu64ErrorCode.DecompressionFailed || !/limit/i.test(error.message))
      throw error;
    limited = true;
  }
  if (!limited) throw new Error("Async decompression limit was not preserved");

  for (const streamed of [new Ddu64(), codec]) {
    const streamOptions = { obfuscate: true };
    const pendingStream = streamed.createEncodeStream(streamOptions);
    streamOptions.obfuscate = false;
    const reader = new Blob([input])
      .stream()
      .pipeThrough(await pendingStream)
      .getReader();
    let streamEncoded = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      streamEncoded += value;
    }
    const decoded = await new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(streamEncoded);
          controller.close();
        },
      }).pipeThrough(await streamed.createDecodeStream({ obfuscate: true })),
    ).text();
    if (decoded !== input) throw new Error("Web Streams round-trip failed");
  }

  return {
    encoded,
    simpleEncoded,
    compression,
    nativeBase64: typeof toBase64?.value === "function",
  };
}
