/**
 * Browser-targeted build smoke test for Web API runtimes.
 *
 * Tests package export resolution and the explicit browser entry on Node, Bun,
 * and Deno. Both first lazy activation and eager create() are exercised.
 *
 * Usage: node|bun|deno scripts/runtime-web-smoke.mjs (run `pnpm build` first)
 */

import { Ddu64 as RootDdu64 } from "@ddunigma/node";
import { Ddu64 } from "@ddunigma/node/browser";
import { Ddu64 as SecureDdu64 } from "@ddunigma/node/secure";

const runtime =
  typeof globalThis.Bun !== "undefined"
    ? `Bun ${globalThis.Bun.version}`
    : typeof globalThis.Deno !== "undefined"
      ? `Deno ${globalThis.Deno.version.deno}`
      : `Node ${globalThis.process?.version ?? "unknown"}`;

if (
  (typeof globalThis.Bun !== "undefined" || typeof globalThis.Deno !== "undefined") &&
  RootDdu64 !== Ddu64
) {
  throw new Error(`${runtime}: package root did not select the browser entry`);
}

const options = {
  compress: true,
  encryptionKey: "web-runtime-smoke-key",
  keyDerivation: {
    algorithm: "pbkdf2",
    salt: "ddunigma-web-runtime-smoke",
    iterations: 10_000,
  },
  checksum: true,
};
const input = "browser adapter runtime smoke ".repeat(64);
for (const Codec of new Set([RootDdu64, Ddu64])) {
  for (const eager of [false, true]) {
    const encoder = eager ? await Codec.create(options) : new Codec(options);
    const encoded = await encoder.encodeAsync(input);
    if ((await encoder.decodeAsync(encoded)) !== input) {
      throw new Error(`${runtime}: ${Codec.name} eager=${eager} round-trip failed`);
    }
  }
}

// Node, Bun and Deno all expose the node export condition for /secure.
const secure = new SecureDdu64(options);
if (secure.decode(secure.encode(input)) !== input) {
  throw new Error(`${runtime}: package secure Node-compatible entry failed`);
}

const encoder = new Ddu64(options);
const streamReader = new Blob([input])
  .stream()
  .pipeThrough(await encoder.createEncodeStream())
  .getReader();
let streamEncoded = "";
for (;;) {
  const { done, value } = await streamReader.read();
  if (done) break;
  streamEncoded += value;
}
const streamDecoded = await new Response(
  new ReadableStream({
    start(controller) {
      controller.enqueue(streamEncoded);
      controller.close();
    },
  }).pipeThrough(await encoder.createDecodeStream()),
).text();

if (streamDecoded !== input) {
  throw new Error(`${runtime}: browser entry stream round-trip failed`);
}

console.log(`runtime-web-smoke PASSED on ${runtime}`);
