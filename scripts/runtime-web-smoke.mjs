/**
 * Browser-targeted build smoke test for Web API runtimes.
 *
 * Node, Bun, and Deno execute the same built browser entry. Compression and
 * encryption force the lazy BrowserAdapter chunk to load on the current core.
 *
 * Usage: node|bun|deno scripts/runtime-web-smoke.mjs (run `pnpm build` first)
 */

import { Ddu64 } from "../dist/browser.js";

const runtime =
  typeof globalThis.Bun !== "undefined"
    ? `Bun ${globalThis.Bun.version}`
    : typeof globalThis.Deno !== "undefined"
      ? `Deno ${globalThis.Deno.version.deno}`
      : `Node ${globalThis.process?.version ?? "unknown"}`;

const encoder = await Ddu64.create({
  compress: true,
  encryptionKey: "web-runtime-smoke-key",
  keyDerivation: {
    algorithm: "pbkdf2",
    salt: "ddunigma-web-runtime-smoke",
    iterations: 10_000,
  },
  checksum: true,
});
const input = "browser adapter runtime smoke ".repeat(64);
const encoded = await encoder.encodeAsync(input);
const decoded = await encoder.decodeAsync(encoded);

if (decoded !== input) {
  throw new Error(`${runtime}: browser entry secure round-trip failed`);
}

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
