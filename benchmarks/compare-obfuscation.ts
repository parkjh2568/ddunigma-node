import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { HangulObfuscationLayer } from "../src/obfuscation/ObfuscationLayer.js";

// 첫 인자는 무결성을 확인한 이전 npm 패키지를 풀어 둔 디렉터리입니다.
const baselinePath = process.argv[2];
if (!baselinePath) throw new Error("Pass the extracted baseline package directory");
const baseline = (await import(pathToFileURL(resolve(baselinePath, "dist/index.js")).href)) as {
  HangulObfuscationLayer: typeof HangulObfuscationLayer;
};
const alphabet = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="];
const before = new baseline.HangulObfuscationLayer(alphabet);
const after = new HangulObfuscationLayer(alphabet);
let sink = 0;
console.log(
  JSON.stringify({
    node: process.version,
    baselinePath: resolve(baselinePath),
    samples: 9,
    unit: "UTF-16 code units",
    memory: "observed heap delta without forced GC after call; not peak RSS",
  }),
);
for (const size of [32, 1024, 16 * 1024, 1024 * 1024, 8 * 1024 * 1024]) {
  const plain = "A".repeat(size);
  const encoded = before.obfuscate(plain);
  const iterations = size < 2048 ? 2000 : size < 1024 * 1024 ? 100 : size < 8 * 1024 * 1024 ? 3 : 1;
  const times = { before: [] as number[], after: [] as number[] };
  const heap = { before: [] as number[], after: [] as number[] };
  for (const layer of [before, after]) {
    for (let i = 0; i < 5; i++) assert.equal(layer.deobfuscate(encoded), plain);
  }
  for (let sample = 0; sample < 9; sample++) {
    const names = (
      sample % 2 ? ["after", "before"] : ["before", "after"]
    ) as (keyof typeof times)[];
    for (const name of names) {
      globalThis.gc?.();
      const layer = name === "before" ? before : after;
      const startedHeap = process.memoryUsage().heapUsed;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        const decoded = layer.deobfuscate(encoded);
        sink ^= decoded.length ^ decoded.charCodeAt(size >>> 1);
      }
      times[name].push((performance.now() - start) / iterations);
      heap[name].push(process.memoryUsage().heapUsed - startedHeap);
    }
  }
  console.log(JSON.stringify({ size, iterations, msPerCall: times, heapDeltaBytes: heap }));
}
console.log(JSON.stringify({ sink }));
