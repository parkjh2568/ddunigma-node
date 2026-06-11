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
  // 미니파이가 클래스/함수 식별자를 축약해도 런타임 `name`을 보존합니다.
  // (Ddu64Error 계열이 `new.target.name`으로 name을 설정하므로, keepNames 없이는
  //  published dist에서 error.name이 "N" 같은 축약명이 됩니다.)
  keepNames: true,
  treeshake: true,
  // sourcemap은 생성하지 않습니다. package.json files가 `.map`을 제외하므로
  // 맵을 생성하면 published JS에 dangling sourceMappingURL 참조만 남습니다.
  sourcemap: false,
  loader: {
    ".wasm": "dataurl",
  },
  // 크로스 플랫폼: 셸(mkdir/cp) 대신 Node API로 WASM 자산을 복사합니다.
  onSuccess: async () => {
    const destDir = join(root, "dist", "wasm");
    await mkdir(destDir, { recursive: true });
    await copyFile(join(root, "src", "wasm", "codec.wasm"), join(destDir, "codec.wasm"));
  },
});
