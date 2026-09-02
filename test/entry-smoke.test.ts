/**
 * 공개 진입점 import와 런타임 역할을 검증합니다.
 *
 * 4개 진입점(`.`/`./browser`/`./secure`/`./core`)의 공개 표면을 검증한다:
 * - 각 진입점에서 `Ddu64`가 노출되고 obfuscate 옵션이 동작
 * - 기본/브라우저 진입점에서 secure 옵션 타입은 받되, 어댑터/WebStreams는 노출하지 않음
 * - 기본 진입점 비동기 메서드는 현재 core에 runtime adapter만 지연 주입
 * - secure 진입점에서 압축/암호화/체크섬과 어댑터/WebStreams 함수가 노출
 * - package.json exports['./secure'] 조건부 매핑이 올바른 빌드를 가리킴
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as nodeEntry from "../src/index.js";
import * as browserEntry from "../src/browser.js";
import * as secureEntry from "../src/secure.js";
import * as secureBrowserEntry from "../src/secure.browser.js";
import * as coreEntry from "../src/core.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("진입점 import 스모크", () => {
  describe("기본 진입점 (.)", () => {
    it("Ddu64를 노출하고 obfuscate 옵션이 라운드트립한다", () => {
      const ddu = new nodeEntry.Ddu64(undefined, undefined, { obfuscate: true });
      const encoded = ddu.encode("기본 진입점 난독화", { obfuscate: true });
      expect(ddu.decode(encoded, { obfuscate: true })).toBe("기본 진입점 난독화");
    });

    it("어댑터/WebStreams는 /secure에서만 노출한다", () => {
      const keys = Object.keys(nodeEntry);
      expect(keys).not.toContain("NodeAdapter");
      expect(keys).not.toContain("BrowserAdapter");
      expect(keys).not.toContain("createReadableEncodeStream");
      expect(keys).not.toContain("createReadableDecodeStream");
    });

    it("secure 옵션은 비동기에서 adapter를 지연 주입하고 sync는 명시 경로를 안내한다", async () => {
      const ddu = new nodeEntry.Ddu64();
      const input = "root lazy adapter 압축 ".repeat(20);
      const encoded = await ddu.encodeAsync(input, { compress: true, checksum: true });

      expect(await ddu.decodeAsync(encoded, { checksum: true })).toBe(input);
      expect(() => ddu.encode(input, { compress: true })).toThrow(
        /encodeAsync.*@ddunigma\/node\/secure/s,
      );
      // sync decode도 encode와 동일하게 명시 경로를 안내한다(가드 대칭).
      expect(() => ddu.decode(encoded, { compress: true })).toThrow(
        /encodeAsync.*@ddunigma\/node\/secure/s,
      );
    });

    it("생성자 secure 옵션도 비동기에서 lazy adapter로 동작한다", async () => {
      const ddu = new nodeEntry.Ddu64({ encryptionKey: "root-lazy-key", checksum: true });
      const input = "root lazy adapter 암호화";
      const encoded = await ddu.encodeAsync(input);

      expect(await ddu.decodeAsync(encoded)).toBe(input);
      expect(() => ddu.encode(input)).toThrow(/encodeAsync.*@ddunigma\/node\/secure/s);
    });

    it("동적 adapter 활성화 후에도 같은 core charset snapshot을 사용한다", async () => {
      const mutableCharset = [
        ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
      ];
      const originalCharset = [...mutableCharset];
      const ddu = new nodeEntry.Ddu64({ dduChar: mutableCharset, paddingChar: "=" });
      ddu.encode("initialize core");

      [mutableCharset[0], mutableCharset[1]] = [mutableCharset[1], mutableCharset[0]];
      const input = "single core adapter injection ".repeat(20);
      const encoded = await ddu.encodeAsync(input, { compress: true });
      const stableDecoder = new secureEntry.Ddu64({
        dduChar: originalCharset,
        paddingChar: "=",
      });

      expect(stableDecoder.decode(encoded)).toBe(input);
    });

    it("명시 adapterFactory는 root의 동기 secure 경로에서도 작동한다", () => {
      const ddu = new nodeEntry.Ddu64({
        compress: true,
        adapterFactory: () => new secureEntry.NodeAdapter(),
      });
      const input = "injected adapter factory ".repeat(20);

      expect(ddu.decode(ddu.encode(input))).toBe(input);
    });

    it("동시 첫 비동기 호출에서 adapter factory를 한 번만 실행한다", async () => {
      let factoryCalls = 0;
      const ddu = new nodeEntry.Ddu64({
        asyncAdapterFactory: async () => {
          factoryCalls++;
          await Promise.resolve();
          return new secureEntry.NodeAdapter();
        },
      });

      await Promise.all([
        ddu.encodeAsync("first ".repeat(20), { compress: true }),
        ddu.encodeAsync("second ".repeat(20), { compress: true }),
      ]);
      expect(factoryCalls).toBe(1);
    });

    it("실패한 async adapter factory는 다음 호출에서 재시도한다", async () => {
      let factoryCalls = 0;
      const ddu = new nodeEntry.Ddu64({
        asyncAdapterFactory: async () => {
          factoryCalls++;
          if (factoryCalls === 1) throw new Error("temporary adapter failure");
          return new secureEntry.NodeAdapter();
        },
      });
      const input = "retry lazy adapter ".repeat(20);

      await expect(ddu.encodeAsync(input, { compress: true })).rejects.toBeInstanceOf(
        nodeEntry.Ddu64Error,
      );
      const encoded = await ddu.encodeAsync(input, { compress: true });
      expect(await ddu.decodeAsync(encoded)).toBe(input);
      expect(factoryCalls).toBe(2);
    });
  });

  describe("브라우저 진입점 (./browser)", () => {
    it("Ddu64를 노출하고 obfuscate 옵션이 라운드트립한다", () => {
      const ddu = new browserEntry.Ddu64(undefined, undefined, { obfuscate: true });
      const encoded = ddu.encode("브라우저 난독화", { obfuscate: true });
      expect(ddu.decode(encoded, { obfuscate: true })).toBe("브라우저 난독화");
    });

    it("어댑터/WebStreams는 /secure에서만 노출한다", () => {
      const keys = Object.keys(browserEntry);
      expect(keys).not.toContain("BrowserAdapter");
      expect(keys).not.toContain("createReadableEncodeStream");
      expect(keys).not.toContain("createReadableDecodeStream");
    });

    it("adapter-backed sync 옵션은 async/secure 경로를 안내한다", () => {
      const ddu = new browserEntry.Ddu64();
      expect(() => ddu.encode("x", { compress: true })).toThrow(/encodeAsync/);
    });

    it("압축 옵션은 비동기에서 lazy adapter로 라운드트립하고 통계도 산출한다", async () => {
      const ddu = new browserEntry.Ddu64();
      const input = "browser lazy adapter 압축 ".repeat(20);
      const encoded = await ddu.encodeAsync(input, { compress: true, checksum: true });

      expect(await ddu.decodeAsync(encoded, { checksum: true })).toBe(input);
      const stats = await ddu.getStatsAsync(input, { compress: true });
      expect(typeof stats.compressedSize).toBe("number");
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
      const pkgPath = join(here, "..", "package.json");
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
