/**
 * 공개 진입점 import와 런타임 역할을 검증합니다.
 *
 * 4개 진입점(`.`/`./browser`/`./secure`/`./core`)의 공개 표면을 검증한다:
 * - 각 진입점에서 `Ddu64`가 노출되고 obfuscate 옵션이 동작
 * - 기본/브라우저 진입점은 저수준 adapter와 독립 Web Streams 함수 export를 노출하지 않음
 * - 기본 진입점 비동기 메서드는 현재 core에 runtime adapter만 지연 주입
 * - 기본 진입점의 `create()`는 adapter를 미리 준비하고 Web Streams 메서드는 구현을 지연 로드
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

describe.each([
  { name: "Node", Codec: nodeEntry.Ddu64 },
  { name: "Browser", Codec: browserEntry.Ddu64 },
])("async input and option snapshots: $name", ({ Codec }) => {
  it.each([false, true])(
    "snapshots async payloads and options with compress=%s",
    async (compress) => {
      const encoder = new Codec({
        encryptionKey: "payload-snapshot-key",
        keyDerivation: { algorithm: "sha256" },
      });
      for (const checksumScope of ["plaintext", "output"] as const) {
        const bytes = Buffer.from("ORIGINAL ".repeat(100));
        const original = bytes.toString();
        let progressCalls = 0;
        const options = {
          compress,
          obfuscate: true,
          checksum: true,
          checksumScope,
          onProgress: () => {
            progressCalls++;
          },
        };
        const pending = encoder.encodeAsync(bytes, options);
        bytes.fill(65);
        options.obfuscate = false;
        options.onProgress = () => {
          throw new Error("mutated callback");
        };
        const encoded = await pending;
        expect(progressCalls).toBeGreaterThan(1);
        expect(await encoder.decodeAsync(encoded, { obfuscate: true, checksum: true })).toBe(
          original,
        );
      }
    },
  );

  it("snapshots async decode limits before key derivation", async () => {
    const options = {
      encryptionKey: "limit-snapshot-key",
      keyDerivation: { algorithm: "sha256" as const },
    };
    const encoded = await new Codec(options).encodeAsync("x".repeat(2048), { compress: true });
    const decoder = new Codec(options);
    const limits = { maxDecompressedBytes: 16 };
    const pending = decoder.decodeAsync(encoded, limits);
    limits.maxDecompressedBytes = 4096;
    await expect(pending).rejects.toThrow(/limit/i);
  });

  it("snapshots async statistics options and transferred bytes", async () => {
    const encoder = new Codec();
    const bytes = new TextEncoder().encode("statistics payload ".repeat(100));
    const options = { compress: true, obfuscate: true };
    const expected = await encoder.getStatsAsync(bytes, options);
    const pending = encoder.getStatsAsync(bytes, options);
    bytes.fill(0);
    structuredClone(bytes.buffer, { transfer: [bytes.buffer] });
    expect(bytes.byteLength).toBe(0);
    options.compress = false;
    options.obfuscate = false;
    expect(await pending).toEqual(expected);
  });

  it.each(["default", "async", "sync", "explicit"])(
    "owns mutable options before %s adapter initialization",
    async (mode) => {
      const dduChar = ["가", "나", "다", "라"];
      const codaChar = ["", "ㄱ"];
      const keyDerivation: nodeEntry.KeyDerivationOptions = {
        algorithm: "pbkdf2",
        salt: Buffer.from([1, 2, 3]),
        iterations: 10_000,
        hash: "SHA-256",
      };
      const stable = new Codec({
        dduChar: [...dduChar],
        codaChar: [...codaChar],
        paddingChar: "=",
        encryptionKey: "snapshot-key",
        keyDerivation: { ...keyDerivation, salt: new Uint8Array([1, 2, 3]) },
      });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const adapter = new secureEntry.NodeAdapter();
      const pending = Codec.create({
        dduChar,
        codaChar,
        paddingChar: "=",
        encryptionKey: "snapshot-key",
        keyDerivation,
        ...(mode === "async"
          ? {
              asyncAdapterFactory: async () => {
                await gate;
                return adapter;
              },
            }
          : {}),
        ...(mode === "sync" ? { adapterFactory: () => adapter } : {}),
        ...(mode === "explicit" ? { adapter } : {}),
      });
      dduChar.reverse();
      codaChar[1] = "ㄴ";
      (keyDerivation.salt as Uint8Array).fill(9);
      keyDerivation.iterations = 10_001;
      keyDerivation.hash = "SHA-512";
      release();
      const encoder = await pending;
      expect(encoder.getCharSetInfo().charSet).toEqual(stable.getCharSetInfo().charSet);
      const encoded = await encoder.encodeAsync("snapshot input");
      expect(await stable.decodeAsync(encoded)).toBe("snapshot input");
    },
  );
});

describe("진입점 import 스모크", () => {
  describe("기본 진입점 (.)", () => {
    it("Ddu64를 노출하고 obfuscate 옵션이 라운드트립한다", () => {
      const ddu = new nodeEntry.Ddu64(undefined, undefined, { obfuscate: true });
      const encoded = ddu.encode("기본 진입점 난독화", { obfuscate: true });
      expect(ddu.decode(encoded, { obfuscate: true })).toBe("기본 진입점 난독화");
    });

    it("저수준 adapter와 독립 Web Streams 함수는 /secure에서만 노출한다", () => {
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

    it("create()는 adapter를 준비해 Node 동기 secure 호출을 지원한다", async () => {
      const ddu = await nodeEntry.Ddu64.create({
        compress: true,
        encryptionKey: "root-create-key",
        keyDerivation: {
          algorithm: "pbkdf2",
          salt: "root-create-salt",
          iterations: 10_000,
        },
      });
      const input = "root eager adapter ".repeat(20);
      const encoded = ddu.encode(input);

      expect(ddu.decode(encoded)).toBe(input);
    });

    it("create()의 외부 adapter 초기화 오류를 공개 에러로 래핑한다", async () => {
      await expect(
        nodeEntry.Ddu64.create({
          asyncAdapterFactory: async () => {
            throw new Error("adapter init failed");
          },
        }),
      ).rejects.toMatchObject({
        code: nodeEntry.Ddu64ErrorCode.AdapterUnavailable,
        operation: "adapter",
      });
    });

    it("create()도 생성자와 같은 런타임 옵션 검증 계약을 유지한다", async () => {
      await expect(
        nodeEntry.Ddu64.create({ adapterFactory: "invalid" } as never),
      ).rejects.toMatchObject({
        code: nodeEntry.Ddu64ErrorCode.InvalidInput,
        operation: "construct",
      });
    });

    it("Web Streams 메서드를 root 인스턴스에서 지연 생성한다", async () => {
      const ddu = new nodeEntry.Ddu64();

      expect(await ddu.createEncodeStream()).toBeInstanceOf(TransformStream);
      expect(await ddu.createDecodeStream()).toBeInstanceOf(TransformStream);
    });
  });

  describe("브라우저 진입점 (./browser)", () => {
    it("Ddu64를 노출하고 obfuscate 옵션이 라운드트립한다", () => {
      const ddu = new browserEntry.Ddu64(undefined, undefined, { obfuscate: true });
      const encoded = ddu.encode("브라우저 난독화", { obfuscate: true });
      expect(ddu.decode(encoded, { obfuscate: true })).toBe("브라우저 난독화");
    });

    it("저수준 adapter와 독립 Web Streams 함수는 /secure에서만 노출한다", () => {
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

    it("create()와 Web Streams 메서드를 브라우저 표면에서도 제공한다", async () => {
      const ddu = await browserEntry.Ddu64.create({ compress: true });
      const input = "browser eager adapter ".repeat(20);
      const encoded = await ddu.encodeAsync(input);

      expect(await ddu.decodeAsync(encoded)).toBe(input);
      expect(await ddu.createEncodeStream()).toBeInstanceOf(TransformStream);
      expect(await ddu.createDecodeStream()).toBeInstanceOf(TransformStream);
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
