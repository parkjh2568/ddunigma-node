import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const baselinePath = process.argv[2];
if (!baselinePath) {
  throw new Error(
    "Usage: node scripts/verify-compat.mjs <extracted-package-directory>. " +
      "Only an integrity-verified @ddunigma/node@6.2.0 baseline is supported.",
  );
}
let baselineMetadata;
try {
  baselineMetadata = JSON.parse(readFileSync(resolve(baselinePath, "package.json"), "utf8"));
} catch (cause) {
  throw new Error("Cannot read a valid baseline package.json from the supplied directory.", {
    cause,
  });
}
if (
  typeof baselineMetadata !== "object" ||
  baselineMetadata === null ||
  Array.isArray(baselineMetadata) ||
  baselineMetadata.name !== "@ddunigma/node" ||
  typeof baselineMetadata.version !== "string"
) {
  throw new Error("Baseline package.json must identify @ddunigma/node with a string version.");
}
const baselineVersion = baselineMetadata.version;
if (baselineVersion !== "6.2.0") {
  throw new Error(
    `Unsupported baseline @ddunigma/node@${baselineVersion}. Only 6.2.0 is supported; ` +
      "this script does not verify migration from 2.x or other releases.",
  );
}
const options = [
  {},
  { dduSetSymbol: "ddu_v1" },
  { dduSetSymbol: "oneCharSet" },
  { dduChar: "abcd", paddingChar: "=", chunkSize: 8, chunkSeparator: "\r\n|" },
  { dduChar: "abcdefghi", paddingChar: "=", usePowerOfTwo: false },
  { dduChar: "abcdefghijklmnop", paddingChar: "1", useRepeatPadding: true },
  { obfuscate: true, urlSafe: true },
  { checksum: true, checksumScope: "plaintext" },
  { checksum: true, checksumScope: "output" },
  { compress: true },
  { encryptionKey: "compatibility-key", keyDerivation: { algorithm: "sha256" } },
  {
    compress: true,
    checksum: true,
    obfuscate: true,
    encryptionKey: "compatibility-key",
    keyDerivation: { salt: "compatibility-salt", iterations: 10_000 },
  },
];
let cases = 0;
for (const entry of ["index", "browser"]) {
  const old = await import(pathToFileURL(resolve(baselinePath, `dist/${entry}.js`)).href);
  const current = await import(`../dist/${entry}.js`);
  for (const name of Object.keys(old)) {
    assert.equal(typeof current[name], typeof old[name], `existing export: ${entry}/${name}`);
  }
  assert.deepEqual(current.DduSetSymbol, old.DduSetSymbol);
  assert.equal(typeof old.Ddu64.create, "function", `baseline API: ${entry}/Ddu64.create`);
  assert.equal(typeof current.Ddu64.create, "function", `public API: ${entry}/Ddu64.create`);
  // 공개 메서드는 상속 경로까지 확인하며 TypeScript private의 런타임 이름은 제외합니다.
  for (const name of [
    "encode",
    "decode",
    "decodeToUint8Array",
    "encodeAsync",
    "decodeAsync",
    "decodeToUint8ArrayAsync",
    "getCharSetInfo",
    "getStats",
    "getStatsAsync",
    "createEncodeStream",
    "createDecodeStream",
    ...(entry === "index" ? ["decodeToBuffer", "decodeToBufferAsync"] : []),
  ]) {
    assert.equal(typeof old.Ddu64.prototype[name], "function", `baseline API: ${entry}/${name}`);
    assert.equal(typeof current.Ddu64.prototype[name], "function", `public API: ${entry}/${name}`);
  }
  const profiles =
    entry === "index" ? [...options, { compress: true, compressionAlgorithm: "brotli" }] : options;
  for (const config of profiles) {
    const previous = new old.Ddu64(config);
    const next = new current.Ddu64(config);
    const simple = current.createDdu({ ...config, output: "bytes" });
    for (const input of [
      new Uint8Array(),
      new TextEncoder().encode("\uFEFF한글 😀 compatibility"),
      Uint8Array.from({ length: 257 }, (_, i) => i & 255),
    ]) {
      const oldEncoded = await previous.encodeAsync(input);
      assert.deepEqual(await next.decodeToUint8ArrayAsync(oldEncoded), input);
      assert.deepEqual(await simple.decode(oldEncoded), input);
      const newEncoded = await simple.encode(input);
      assert.deepEqual(await previous.decodeToUint8ArrayAsync(newEncoded), input);
      if (!config.encryptionKey) assert.equal(newEncoded, oldEncoded);
      cases++;
    }
  }
  const previous = new old.Ddu64("abcd", "=");
  const next = new current.Ddu64("abcd", "=");
  assert.equal(next.encode("legacy"), previous.encode("legacy"));
  assert.equal(next.decode(previous.encode("legacy")), "legacy");
  assert.deepEqual(next.getStats("legacy"), previous.getStats("legacy"));
}
console.log(
  `compat PASSED: ${baselineVersion} ↔ current, ${cases} profile/input cases plus legacy exports and sync APIs`,
);
