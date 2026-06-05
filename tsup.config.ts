import { defineConfig } from "tsup";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

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
  // 크로스 플랫폼: 셸(mkdir/cp) 대신 Node API로 WASM 자산을 복사합니다.
  onSuccess: async () => {
    const destDir = join(root, "dist", "wasm");
    await mkdir(destDir, { recursive: true });
    await copyFile(join(root, "src", "wasm", "codec.wasm"), join(destDir, "codec.wasm"));
  },
});
