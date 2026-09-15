import { Ddu64 as RootDdu64, Ddu64ErrorCode } from "@ddunigma/node";
import { Ddu64 } from "@ddunigma/node/browser";
import { Ddu64 as SecureDdu64 } from "@ddunigma/node/secure";
import footerCollisionVectors from "./fixtures/footer-collision-vectors.json";

// scripts/browser-smoke.mjs bundles this entry with browser export conditions.
export async function runBrowserSmoke({ options, input, encoded: nodeEncoded }) {
  if (RootDdu64 !== Ddu64 || "decodeToBuffer" in SecureDdu64.prototype) {
    throw new Error("Package exports did not select browser implementations");
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
      for (const plain of ["A", "AB", "ABC", "ABCDEF"]) {
        const encoded = codec.encode(plain);
        if (encoded !== globalThis.btoa(plain) || codec.decode(encoded) !== plain) {
          throw new Error(`Base64 round-trip failed: fallback=${fallback}`);
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

  return { encoded, nativeBase64: typeof toBase64?.value === "function" };
}
