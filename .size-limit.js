// size-limit 설정 (ESM — package.json "type":"module").
// 진입점별 brotli 번들 예산을 고정해 회귀를 CI에서 차단합니다.
//
// 기본 진입점(index/browser)은 lean(인코딩 + 난독화)이라 어댑터를 정적 import하지 않고,
// secure 진입점(secure/secure.browser)만 압축/암호화/체크섬/스트림(어댑터)을 포함합니다.
// node 빌트인(crypto/zlib/util)은 secure 어댑터가 동적/외부 참조하므로 측정에서 제외(external).
// dist는 tsup가 side-effect-only 청크를 bare import로 emit하고 package.json sideEffects:false라,
// esbuild가 이를 "ignored-bare-import"로 무시하며 경고를 냅니다(측정엔 무해). 측정 로그
// 신뢰도를 위해 해당 경고만 silent 처리합니다.

const ignore = ["crypto", "zlib", "util", "node:crypto", "node:zlib", "node:util"];

const modifyEsbuildConfig = (config) => {
  config.logOverride = { ...(config.logOverride ?? {}), "ignored-bare-import": "silent" };
  return config;
};

export default [
  {
    name: "core entry — Ddu64 (encode/decode)",
    path: "dist/core.js",
    import: "{ Ddu64 }",
    ignore,
    modifyEsbuildConfig,
    limit: "15 KB",
  },
  {
    name: "node entry — Ddu64 (lean: encode + obfuscate)",
    path: "dist/index.js",
    import: "{ Ddu64 }",
    ignore,
    modifyEsbuildConfig,
    limit: "14.5 KB",
  },
  {
    name: "browser entry — Ddu64 (lean: encode + obfuscate)",
    path: "dist/browser.js",
    import: "{ Ddu64 }",
    ignore,
    modifyEsbuildConfig,
    limit: "14.5 KB",
  },
  {
    name: "secure entry — Ddu64 (batteries: compress/crypto/checksum)",
    path: "dist/secure.js",
    import: "{ Ddu64 }",
    ignore,
    modifyEsbuildConfig,
    limit: "17 KB",
  },
  {
    name: "secure.browser entry — Ddu64 (batteries)",
    path: "dist/secure.browser.js",
    import: "{ Ddu64 }",
    ignore,
    modifyEsbuildConfig,
    limit: "16.5 KB",
  },
];
