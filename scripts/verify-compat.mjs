import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const baselinePath = process.argv[2];
if (!baselinePath) throw new Error("Pass an extracted, integrity-verified baseline npm package");
const baselineVersion = JSON.parse(readFileSync(resolve(baselinePath, "package.json"))).version;
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
  for (const name of Object.getOwnPropertyNames(old.Ddu64.prototype)) {
    assert.equal(typeof current.Ddu64.prototype[name], typeof old.Ddu64.prototype[name], name);
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
