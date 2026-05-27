import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/browser.ts", "src/core.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: true,
  clean: true,
  target: "es2022",
  minify: true,
  treeshake: true,
  sourcemap: true,
  onSuccess: "mkdir -p dist/wasm && cp src/wasm/codec.wasm dist/wasm/codec.wasm",
});
