/**
 * 진입점 import 스모크 테스트 (Task 5.3).
 *
 * 4개 진입점(`.`/`./browser`/`./secure`/`./core`)의 공개 표면을 검증한다:
 * - 각 진입점에서 `Ddu64`가 노출되고 obfuscate 옵션이 동작
 * - secure 진입점에서 압축/암호화/체크섬과 어댑터/WebStreams 함수가 노출
 * - 기본/브라우저 진입점에서 NodeAdapter/BrowserAdapter/WebStreams가 노출되지 않음(이전 완료)
 * - 기본 진입점 타입에서 `encode(x, { compress: true })`가 컴파일 에러(@ts-expect-error)
 * - package.json exports['./secure'] 조건부 매핑이 올바른 빌드를 가리킴
 *
 * Requirements: 1.1, 1.2, 1.3, 2.1, 2.3, 2.4, 3.1, 4.1, 4.4, 6.3, 8.5
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as nodeEntry from "../index.js";
import * as browserEntry from "../browser.js";
import * as secureEntry from "../secure.js";
import * as secureBrowserEntry from "../secure.browser.js";
import * as coreEntry from "../core.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("진입점 import 스모크", () => {
  describe("기본 진입점 (.)", () => {
    it("Ddu64를 노출하고 obfuscate 옵션이 라운드트립한다", () => {
      const ddu = new nodeEntry.Ddu64(undefined, undefined, { obfuscate: true });
      const encoded = ddu.encode("기본 진입점 난독화", { obfuscate: true });
      expect(ddu.decode(encoded, { obfuscate: true })).toBe("기본 진입점 난독화");
    });

    it("어댑터/WebStreams는 노출하지 않는다(secure로 이전)", () => {
      const keys = Object.keys(nodeEntry);
      expect(keys).not.toContain("NodeAdapter");
      expect(keys).not.toContain("BrowserAdapter");
      expect(keys).not.toContain("createReadableEncodeStream");
      expect(keys).not.toContain("createReadableDecodeStream");
    });

    it("기본 진입점 타입은 secure 옵션을 노출하지 않는다(컴파일 차단)", () => {
      const ddu = new nodeEntry.Ddu64();
      // @ts-expect-error compress는 DduBaseOptions에 없으므로 컴파일 에러여야 한다.
      void (() => ddu.encode("x", { compress: true }));
      expect(ddu).toBeInstanceOf(nodeEntry.Ddu64);
    });
  });

  describe("브라우저 진입점 (./browser)", () => {
    it("Ddu64를 노출하고 obfuscate 옵션이 라운드트립한다", () => {
      const ddu = new browserEntry.Ddu64(undefined, undefined, { obfuscate: true });
      const encoded = ddu.encode("브라우저 난독화", { obfuscate: true });
      expect(ddu.decode(encoded, { obfuscate: true })).toBe("브라우저 난독화");
    });

    it("어댑터/WebStreams는 노출하지 않는다(secure로 이전)", () => {
      const keys = Object.keys(browserEntry);
      expect(keys).not.toContain("BrowserAdapter");
      expect(keys).not.toContain("createReadableEncodeStream");
      expect(keys).not.toContain("createReadableDecodeStream");
    });
  });

  describe("secure 진입점 (./secure)", () => {
    it("Ddu64(=Ddu64Secure)와 Secure 클래스를 노출한다", () => {
      expect(typeof secureEntry.Ddu64).toBe("function");
      expect(typeof secureEntry.Ddu64Secure).toBe("function");
      expect(typeof secureEntry.Ddu64SecureBrowser).toBe("function");
    });

    it("압축/암호화/체크섬 라운드트립이 동작한다", () => {
      const ddu = new secureEntry.Ddu64(undefined, undefined, {
        encryptionKey: "smoke-key",
        compress: true,
        checksum: true,
      });
      const input = "secure 진입점 배터리 ".repeat(10);
      const encoded = ddu.encode(input);
      expect(ddu.decode(encoded)).toBe(input);
    });

    it("어댑터/WebStreams 함수가 노출된다", () => {
      expect(typeof secureEntry.NodeAdapter).toBe("function");
      expect(typeof secureEntry.BrowserAdapter).toBe("function");
      expect(typeof secureEntry.createReadableEncodeStream).toBe("function");
      expect(typeof secureEntry.createReadableDecodeStream).toBe("function");
    });
  });

  describe("secure 브라우저 진입점 (./secure browser 조건)", () => {
    it("Ddu64(=Ddu64SecureBrowser)와 BrowserAdapter/WebStreams를 노출한다", () => {
      expect(typeof secureBrowserEntry.Ddu64).toBe("function");
      expect(typeof secureBrowserEntry.Ddu64SecureBrowser).toBe("function");
      expect(typeof secureBrowserEntry.BrowserAdapter).toBe("function");
      expect(typeof secureBrowserEntry.createReadableEncodeStream).toBe("function");
      expect(typeof secureBrowserEntry.createReadableDecodeStream).toBe("function");
    });

    it("NodeAdapter는 노출하지 않는다(node 내장 정적 import 금지)", () => {
      expect(Object.keys(secureBrowserEntry)).not.toContain("NodeAdapter");
    });
  });

  describe("core 진입점 (./core)", () => {
    it("Ddu64(=Ddu64Core)를 노출한다", () => {
      expect(typeof coreEntry.Ddu64).toBe("function");
      expect(typeof coreEntry.Ddu64Core).toBe("function");
    });
  });

  describe("package.json exports['./secure'] 조건부 매핑", () => {
    it("node/browser/require 조건이 올바른 빌드를 가리킨다", () => {
      const pkgPath = join(here, "..", "..", "package.json");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const secure = pkg.exports["./secure"];
      expect(secure).toBeDefined();

      // browser 조건 → secure.browser 빌드
      expect(secure.browser.import).toBe("./dist/secure.browser.js");
      expect(secure.browser.types).toBe("./dist/secure.browser.d.ts");

      // node 조건 → secure 빌드 (import/require 분리)
      expect(secure.node.import.default).toBe("./dist/secure.js");
      expect(secure.node.require.default).toBe("./dist/secure.cjs");

      // 기본 import/require/default
      expect(secure.import.default).toBe("./dist/secure.browser.js");
      expect(secure.require.default).toBe("./dist/secure.cjs");
      expect(secure.default).toBe("./dist/secure.browser.js");
    });
  });
});
