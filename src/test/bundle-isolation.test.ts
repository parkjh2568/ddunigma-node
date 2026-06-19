/**
 * 번들 정적 스캔 테스트 (Task 6.2).
 *
 * 빌드 산출물(dist)의 진입점별 정적 import 그래프를 추적하여 번들 격리를 검증한다:
 * - 기본(lean) 진입점 `dist/index.js`/`dist/browser.js`는 Node 내장 암호화/압축
 *   (node:crypto / node:zlib 어댑터 코드)을 포함하지 않는다.
 * - secure 진입점(`dist/secure.js`)은 Node crypto/zlib를 포함한다.
 * - secure 브라우저(`dist/secure.browser.js`)는 WebCrypto/CompressionStream을 포함하되
 *   Node 내장 모듈은 포함하지 않는다.
 *
 * tsup는 공통 코드를 코드 스플리팅으로 별도 chunk에 emit하므로, 진입점 파일 하나만
 * 스캔하면 안 되고 진입점에서 도달 가능한 모든 상대 import chunk를 합쳐서 스캔한다.
 *
 * 참고(CRC32): `calculateCRC32`는 Node 내장이 아니라 코어(codecUtils)에 속한 순수 JS
 * 유틸이며 Ddu64Core 인코딩/디코딩 경로에서 공유된다. 코어/와이어 포맷 무변경 원칙상
 * lean 진입점에서도 동일 코어 chunk를 공유하므로 "부재"를 단언하지 않는다. 본 스캔의
 * 핵심 격리 대상은 무거운 Node 내장 어댑터(crypto/zlib)와 브라우저 WebCrypto/Stream이다.
 *
 * 이 테스트는 빌드 산출물을 읽으므로 dist가 없으면(빌드 전 단독 `pnpm test`) 스킵한다.
 * `pnpm verify`는 build를 test:coverage보다 먼저 실행하므로 항상 실행된다.
 *
 * Validates: Requirements 1.4, 4.2, 10.1, 10.2, 10.3, 10.4
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, "..", "..", "dist");

const entriesExist = ["index.js", "browser.js", "secure.js", "secure.browser.js"].every((f) =>
  existsSync(join(distDir, f)),
);

/** 진입점에서 도달 가능한 모든 상대 import chunk 소스를 합쳐서 반환한다. */
function collectGraph(entry: string): string {
  const seen = new Set<string>();
  const stack = [join(distDir, entry)];
  let combined = "";
  const importRe = /(?:from|import)\s*['"](\.\/[^'"]+)['"]/g;

  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, "utf-8");
    combined += src + "\n";
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(src)) !== null) {
      stack.push(resolve(dirname(file), m[1]));
    }
  }
  return combined;
}

// Node 내장 모듈 신호: 실제 import 문 또는 NodeAdapter 전용 동기 API.
// (주의: `brotliCompressSync` 등은 코어가 어댑터 capability를 메서드명으로 탐지할 때도
//  등장하므로 node:zlib 신호로 쓰지 않는다. `deflateRawSync`/`from'zlib'`만 신뢰한다.)
const NODE_CRYPTO = /from\s*['"](?:node:)?crypto['"]|createCipheriv|createDecipheriv/;
const NODE_ZLIB = /from\s*['"](?:node:)?zlib['"]|deflateRawSync|inflateRawSync/;
const WEB_COMPRESSION = /CompressionStream|DecompressionStream/;

describe.skipIf(!entriesExist)("번들 격리 정적 스캔", () => {
  describe("기본(lean) 진입점", () => {
    it("dist/index.js 그래프에 Node crypto/zlib 어댑터 코드가 없다", () => {
      const g = collectGraph("index.js");
      expect(NODE_CRYPTO.test(g)).toBe(false);
      expect(NODE_ZLIB.test(g)).toBe(false);
    });

    it("dist/browser.js 그래프에 Node crypto/zlib 및 WebCrypto 압축 코드가 없다", () => {
      const g = collectGraph("browser.js");
      expect(NODE_CRYPTO.test(g)).toBe(false);
      expect(NODE_ZLIB.test(g)).toBe(false);
      expect(WEB_COMPRESSION.test(g)).toBe(false);
    });
  });

  describe("secure 진입점", () => {
    it("dist/secure.js 그래프에 Node crypto/zlib가 포함된다", () => {
      const g = collectGraph("secure.js");
      expect(NODE_CRYPTO.test(g)).toBe(true);
      expect(NODE_ZLIB.test(g)).toBe(true);
    });

    it("dist/secure.browser.js 그래프에 WebCrypto/CompressionStream이 포함되고 Node 내장은 없다", () => {
      const g = collectGraph("secure.browser.js");
      expect(WEB_COMPRESSION.test(g)).toBe(true);
      expect(NODE_CRYPTO.test(g)).toBe(false);
      expect(NODE_ZLIB.test(g)).toBe(false);
    });
  });
});
