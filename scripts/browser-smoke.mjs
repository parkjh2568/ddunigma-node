import { createServer } from "node:http";
import { basename } from "node:path";
import { build } from "esbuild";
import { chromium, firefox, webkit } from "playwright";
import { Ddu64 } from "@ddunigma/node";

const engines = { chromium, firefox, webkit };
const requested = process.argv.slice(2);
const names = requested.length ? requested : Object.keys(engines);
for (const name of names) {
  if (!Object.hasOwn(engines, name)) throw new Error(`Unknown browser: ${name}`);
}

// Serve only in-memory test bundles on loopback. Production imports resolve from dist.
const bundle = await build({
  entryPoints: ["test/browser-smoke.mjs"],
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outdir: "browser-smoke",
  write: false,
  logOverride: { "ignored-bare-import": "silent" },
});
const files = new Map(bundle.outputFiles.map((file) => [`/${basename(file.path)}`, file.contents]));
const server = createServer((request, response) => {
  if (request.url === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>ddunigma browser smoke</title>");
    return;
  }
  const contents = files.get(request.url);
  response.writeHead(contents ? 200 : 404, { "Content-Type": "text/javascript" });
  response.end(contents ?? "Not found");
});

const options = {
  compress: true,
  encryptionKey: "browser-engine-smoke-key",
  keyDerivation: { algorithm: "pbkdf2", salt: "ddunigma-browser-smoke", iterations: 10_000 },
  checksum: true,
};
const input = "브라우저 엔진과 Node의 호환성 ".repeat(64);
const codec = new Ddu64(options);
const vector = { options, input, encoded: await codec.encodeAsync(input) };

try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const name of names) {
    const browser = await engines[name].launch();
    let timeout;
    try {
      const page = await browser.newPage();
      await page.goto(url);
      const result = await Promise.race([
        page.evaluate(async (vector) => {
          const { runBrowserSmoke } = await import(
            new URL("/browser-smoke.js", globalThis.location.href).href
          );
          return runBrowserSmoke(vector);
        }, vector),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error(`${name}: smoke timed out`)), 30_000);
        }),
      ]);
      if ((await codec.decodeAsync(result.encoded)) !== input) {
        throw new Error(`${name}: browser to Node interoperability failed`);
      }
      console.log(
        `browser-smoke PASSED on ${name} ${browser.version()} (native Base64: ${result.nativeBase64})`,
      );
    } finally {
      clearTimeout(timeout);
      await browser.close();
    }
  }
} finally {
  if (server.listening) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
