import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/browser.ts",
    "src/core.ts",
    "src/secure.ts",
    "src/secure.browser.ts",
  ],
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
});
