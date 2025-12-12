# cp dist/mjs/index.d.ts dist 

# rm -rf dist/*/index.d.ts 

cat >dist/cjs/package.json <<!EOF
{
    "type": "commonjs"
}
!EOF

cat >dist/mjs/package.json <<!EOF
{
    "type": "module"
}
!EOF

# Node ESM에서는 상대경로 import/export에 확장자(.js) 또는 명시적 index.js가 필요합니다.
# tsc가 생성한 dist/mjs 산출물의 상대 specifier를 실제 파일 구조에 맞게 보정합니다.
node <<'NODE'
const fs = require("fs");
const path = require("path");

const root = path.resolve(process.cwd(), "dist/mjs");
if (!fs.existsSync(root)) process.exit(0);

const hasKnownExt = (p) => /\.[a-zA-Z0-9]+$/.test(p);
const isRelative = (p) => p.startsWith("./") || p.startsWith("../");
const isBareOrHttp = (p) => !isRelative(p) || p.startsWith("http:") || p.startsWith("https:");

function listJsFiles(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listJsFiles(full));
    else if (ent.isFile() && ent.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function resolveSpecifier(fromFile, spec) {
  if (isBareOrHttp(spec) || hasKnownExt(spec)) return spec;

  const fromDir = path.dirname(fromFile);
  const abs = path.resolve(fromDir, spec);

  // 1) 같은 경로의 파일(.js)로 존재하면 확장자 추가
  if (fs.existsSync(abs + ".js")) return spec + ".js";

  // 2) 디렉터리라면 index.js로 보정 (Node ESM은 디렉터리 import를 허용하지 않음)
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    const idx = path.join(abs, "index.js");
    if (fs.existsSync(idx)) return spec.replace(/\/$/, "") + "/index.js";
  }

  // 3) 이미 파일이지만 확장자만 없는 케이스(드물지만) - 안전하게 .js 시도
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return spec + ".js";

  return spec;
}

const RE = /(from\s+["'])([^"']+)(["'])/g;

for (const file of listJsFiles(root)) {
  const original = fs.readFileSync(file, "utf8");
  let changed = false;

  const next = original.replace(RE, (m, p1, spec, p3) => {
    const resolved = resolveSpecifier(file, spec);
    if (resolved !== spec) changed = true;
    return p1 + resolved + p3;
  });

  if (changed) fs.writeFileSync(file, next, "utf8");
}
NODE