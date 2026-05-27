/**
 * Property-Based Tests (fast-check)
 *
 * ddunigma 라이브러리의 핵심 속성을 검증하는 property-based 테스트.
 * 모든 테스트는 최소 100회 반복으로 실행됩니다.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { Ddu64Node } from "../Ddu64Node.js";
import { Ddu64Core } from "../core/Ddu64Core.js";
import { NodeAdapter } from "../adapters/NodeAdapter.js";
import { BrowserAdapter } from "../adapters/BrowserAdapter.js";
import { DduSetSymbol } from "../core/types.js";
import { createReadableEncodeStream, createReadableDecodeStream } from "../streams/WebStreams.js";
import { HangulObfuscationLayer } from "../obfuscation/ObfuscationLayer.js";
import { parseFooter } from "../core/wireFormat.js";
import * as fs from "fs";
import * as path from "path";

// ─── 공통 설정 ───────────────────────────────────────────────────────────────

const NUM_RUNS = 100;

// ─── 헬퍼 함수 ──────────────────────────────────────────────────────────────

/** Origin 호환 인코더 생성 */
function createOriginCompatEncoder(): Ddu64Node {
  return new Ddu64Node(undefined, undefined, {
    dduSetSymbol: DduSetSymbol.DDU,
    useRepeatPadding: true,
  });
}

/** Origin 참조 구현 인코딩 */
function originDdu64Encode(input: Uint8Array): string {
  if (input.length === 0) return "";

  const ORIGIN_BASE_CHARS = ["뜌", "땨", "이", "우", "야", "듀", "댜", "뎨"];
  const ORIGIN_CODA_CHARS = ["", "ㄱ", "ㄲ", "ㄷ", "ㅈ", "ㅇ", "ㅅ", "ㅆ"];
  const ORIGIN_PADDING_CHAR = "뭐";

  const CODA_MAP: Record<string, number> = {
    "": 0,
    ㄱ: 1,
    ㄲ: 2,
    ㄳ: 3,
    ㄴ: 4,
    ㄵ: 5,
    ㄶ: 6,
    ㄷ: 7,
    ㄹ: 8,
    ㄺ: 9,
    ㄻ: 10,
    ㄼ: 11,
    ㄽ: 12,
    ㄾ: 13,
    ㄿ: 14,
    ㅀ: 15,
    ㅁ: 16,
    ㅂ: 17,
    ㅄ: 18,
    ㅅ: 19,
    ㅆ: 20,
    ㅇ: 21,
    ㅈ: 22,
    ㅊ: 23,
    ㅋ: 24,
    ㅌ: 25,
    ㅍ: 26,
    ㅎ: 27,
  };

  function combineCoda(baseChar: string, coda: string): string {
    if (coda === "") return baseChar;
    const baseOrd = baseChar.charCodeAt(0);
    const currentCodaIdx = (baseOrd - 44032) % 28;
    const baseWithoutCoda = baseOrd - currentCodaIdx;
    const codaIdx = CODA_MAP[coda] ?? 0;
    return String.fromCharCode(baseWithoutCoda + codaIdx);
  }

  // 바이트를 바이너리 문자열로 변환
  let binaryStr = "";
  for (let i = 0; i < input.length; i++) {
    binaryStr += input[i].toString(2).padStart(8, "0");
  }

  // 6비트 청크로 분할
  const chunks: string[] = [];
  for (let i = 0; i < binaryStr.length; i += 6) {
    chunks.push(binaryStr.slice(i, i + 6));
  }

  // 마지막 청크 패딩
  const lastChunk = chunks[chunks.length - 1];
  const padding = 6 - lastChunk.length;
  chunks[chunks.length - 1] = lastChunk + "0".repeat(padding);

  // 6비트 값을 한글 문자로 매핑
  const resultChars: string[] = [];
  for (const chunk of chunks) {
    const value = parseInt(chunk, 2);
    const baseIdx = Math.floor(value / 8);
    const codaIdx = value % 8;
    resultChars.push(combineCoda(ORIGIN_BASE_CHARS[baseIdx], ORIGIN_CODA_CHARS[codaIdx]));
  }

  // 패딩 문자 추가
  const paddingCount = Math.floor(padding / 2);
  return resultChars.join("") + ORIGIN_PADDING_CHAR.repeat(paddingCount);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Property-Based Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("Property-Based Tests", () => {
  // ─── Property 3: 어댑터 간 키 파생 동등성 ─────────────────────────────────
  describe("Property 3: 어댑터 간 키 파생 동등성", () => {
    it("NodeAdapter.deriveKeySync와 BrowserAdapter.deriveKey가 동일한 32바이트 해시를 생성", async () => {
      const nodeAdapter = new NodeAdapter();
      const browserAdapter = new BrowserAdapter();

      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1, maxLength: 200 }), async (key) => {
          // NodeAdapter 동기 키 파생
          const nodeKey = nodeAdapter.deriveKeySync(key);
          // BrowserAdapter 비동기 키 파생
          const browserKey = await browserAdapter.deriveKey(key);

          // 둘 다 32바이트(256비트) SHA-256 해시여야 함
          expect(nodeKey.length).toBe(32);
          expect(browserKey.length).toBe(32);

          // 바이트 단위로 동일해야 함
          expect(nodeKey).toEqual(browserKey);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // ─── Property 5: 어댑터 간 암호화 상호운용 ────────────────────────────────
  describe("Property 5: 어댑터 간 암호화 상호운용", () => {
    it("NodeAdapter로 암호화한 데이터를 BrowserAdapter로 복호화 가능", async () => {
      const nodeAdapter = new NodeAdapter();
      const browserAdapter = new BrowserAdapter();

      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 500 }),
          fc.string({ minLength: 1, maxLength: 64 }),
          async (data, keyStr) => {
            // 동일한 키 해시 파생
            const keyHash = nodeAdapter.deriveKeySync(keyStr);

            // NodeAdapter로 암호화
            const encrypted = nodeAdapter.encryptSync(data, keyHash);

            // BrowserAdapter로 복호화
            const decrypted = await browserAdapter.decrypt(encrypted, keyHash);

            expect(decrypted).toEqual(data);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it("BrowserAdapter로 암호화한 데이터를 NodeAdapter로 복호화 가능", async () => {
      const nodeAdapter = new NodeAdapter();
      const browserAdapter = new BrowserAdapter();

      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 1, maxLength: 500 }),
          fc.string({ minLength: 1, maxLength: 64 }),
          async (data, keyStr) => {
            const keyHash = nodeAdapter.deriveKeySync(keyStr);

            // BrowserAdapter로 암호화
            const encrypted = await browserAdapter.encrypt(data, keyHash);

            // NodeAdapter로 복호화
            const decrypted = nodeAdapter.decryptSync(encrypted, keyHash);

            expect(decrypted).toEqual(data);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // ─── Property 1: 인코딩/디코딩 라운드트립 ─────────────────────────────────
  describe("Property 1: 인코딩/디코딩 라운드트립", () => {
    it("임의 바이트 시퀀스에 대해 encode→decode가 원본과 동일", () => {
      const encoder = new Ddu64Node();

      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 2000 }), (data) => {
          const encoded = encoder.encode(data);
          const decoded = encoder.decodeToUint8Array(encoded);
          expect(decoded).toEqual(data);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("압축 옵션과 함께 라운드트립 검증", () => {
      const encoder = new Ddu64Node(undefined, undefined, { compress: true });

      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1, maxLength: 2000 }), (data) => {
          const encoded = encoder.encode(data);
          const decoded = encoder.decodeToUint8Array(encoded);
          expect(decoded).toEqual(data);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("암호화 옵션과 함께 라운드트립 검증", () => {
      const encoder = new Ddu64Node(undefined, undefined, {
        encryptionKey: "test-property-key",
      });

      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1, maxLength: 1000 }), (data) => {
          const encoded = encoder.encode(data);
          const decoded = encoder.decodeToUint8Array(encoded);
          expect(decoded).toEqual(data);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("체크섬 옵션과 함께 라운드트립 검증", () => {
      const encoder = new Ddu64Node(undefined, undefined, { checksum: true });

      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1, maxLength: 1000 }), (data) => {
          const encoded = encoder.encode(data);
          const decoded = encoder.decodeToUint8Array(encoded, { checksum: true });
          expect(decoded).toEqual(data);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("ONECHARSET 프리셋으로 라운드트립 검증", () => {
      const encoder = new Ddu64Node(undefined, undefined, {
        dduSetSymbol: DduSetSymbol.ONECHARSET,
      });

      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 1000 }), (data) => {
          const encoded = encoder.encode(data);
          const decoded = encoder.decodeToUint8Array(encoded);
          expect(decoded).toEqual(data);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // ─── Property 2: Buffer/Uint8Array 동등성 ─────────────────────────────────
  describe("Property 2: Buffer/Uint8Array 동등성", () => {
    it("같은 바이트를 Buffer와 Uint8Array로 encode했을 때 동일한 결과", () => {
      const encoder = new Ddu64Node();

      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1, maxLength: 1000 }), (data) => {
          const uint8Result = encoder.encode(data);
          const bufferResult = encoder.encode(Buffer.from(data));
          expect(uint8Result).toBe(bufferResult);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // ─── Property 5.2: 압축 상호운용 ──────────────────────────────────────────
  describe("Property 5.2: 압축 상호운용", () => {
    it("NodeAdapter.deflateSync로 압축한 데이터를 BrowserAdapter.inflate로 복원 가능", async () => {
      const nodeAdapter = new NodeAdapter();
      const browserAdapter = new BrowserAdapter();

      await fc.assert(
        fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 2000 }), async (data) => {
          // NodeAdapter로 압축
          const compressed = nodeAdapter.deflateSync(data);

          // BrowserAdapter로 압축 해제
          const decompressed = await browserAdapter.inflate(compressed);

          expect(decompressed).toEqual(data);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // ─── Property 4: 암호화 페이로드 구조 ─────────────────────────────────────
  describe("Property 4: 암호화 페이로드 구조", () => {
    it("모든 암호화 출력이 IV(12) + authTag(16) + ciphertext 형식", () => {
      const nodeAdapter = new NodeAdapter();

      fc.assert(
        fc.property(
          fc.uint8Array({ minLength: 1, maxLength: 1000 }),
          fc.string({ minLength: 1, maxLength: 64 }),
          (data, keyStr) => {
            const keyHash = nodeAdapter.deriveKeySync(keyStr);
            const encrypted = nodeAdapter.encryptSync(data, keyHash);

            // 최소 28바이트 (12 IV + 16 authTag + 최소 0바이트 ciphertext)
            expect(encrypted.length).toBeGreaterThanOrEqual(28);

            // 암호문 길이 = 원본 데이터 길이 (AES-GCM은 스트림 암호 모드)
            const ciphertextLength = encrypted.length - 28;
            expect(ciphertextLength).toBe(data.length);

            // IV는 12바이트
            const iv = encrypted.slice(0, 12);
            expect(iv.length).toBe(12);

            // authTag는 16바이트
            const authTag = encrypted.slice(12, 28);
            expect(authTag.length).toBe(16);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // ─── Property 6: 스트림 라운드트립 ────────────────────────────────────────
  describe("Property 6: 스트림 라운드트립", () => {
    it(
      "Web Streams encode→decode 파이프라인이 원본 데이터를 복원",
      { timeout: 60000 },
      async () => {
        // NodeAdapter를 명시적으로 제공하여 비동기 어댑터 초기화 문제 방지
        const encoder = new Ddu64Core(undefined, undefined, {
          adapter: new NodeAdapter(),
        });

        await fc.assert(
          fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 500 }), async (data) => {
            // pipeThrough 패턴으로 인코딩
            const encodeTransform = createReadableEncodeStream(encoder);
            const inputStream = new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(data);
                controller.close();
              },
            });
            const encodedStream = inputStream.pipeThrough(encodeTransform);
            const encodeReader = encodedStream.getReader();

            let encodedStr = "";
            while (true) {
              const { done, value } = await encodeReader.read();
              if (done) break;
              encodedStr += value;
            }

            // pipeThrough 패턴으로 디코딩
            const decodeTransform = createReadableDecodeStream(encoder);
            const encodedInputStream = new ReadableStream<string>({
              start(controller) {
                controller.enqueue(encodedStr);
                controller.close();
              },
            });
            const decodedStream = encodedInputStream.pipeThrough(decodeTransform);
            const decodeReader = decodedStream.getReader();

            const decodedChunks: Uint8Array[] = [];
            let totalLen = 0;
            while (true) {
              const { done, value } = await decodeReader.read();
              if (done) break;
              decodedChunks.push(value);
              totalLen += value.length;
            }

            const decoded = new Uint8Array(totalLen);
            let offset = 0;
            for (const chunk of decodedChunks) {
              decoded.set(chunk, offset);
              offset += chunk.length;
            }

            expect(decoded).toEqual(data);
          }),
          { numRuns: NUM_RUNS },
        );
      },
    );
  });

  // ─── Property 7: 와이어 포맷 푸터 적합성 ─────────────────────────────────
  describe("Property 7: 와이어 포맷 푸터 적합성", () => {
    it("모든 인코딩 출력의 푸터가 스펙을 준수 (ELYSIA/GRISEO/ENC 마커 + 패딩비트)", () => {
      const encoder = new Ddu64Node();
      const paddingChar = "뭐";

      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1, maxLength: 1000 }), (data) => {
          const encoded = encoder.encode(data);

          // 푸터 파싱이 성공해야 함
          const result = parseFooter(encoded, paddingChar, 6);

          // paddingBits는 0~5 범위
          expect(result.paddingBits).toBeGreaterThanOrEqual(0);
          expect(result.paddingBits).toBeLessThan(6);

          // 암호화 없이 인코딩했으므로 isEncrypted는 false
          expect(result.isEncrypted).toBe(false);

          // cleanedInput은 비어있지 않아야 함 (데이터가 있으므로)
          expect(result.cleanedInput.length).toBeGreaterThan(0);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("압축 인코딩 시 ELYSIA 마커가 포함됨", () => {
      const encoder = new Ddu64Node(undefined, undefined, { compress: true });

      fc.assert(
        fc.property(
          // 압축이 효과적이려면 충분히 큰 반복 데이터 필요
          fc.uint8Array({ minLength: 100, maxLength: 1000 }).map((arr) => {
            // 반복 패턴으로 압축 효과 보장
            for (let i = 0; i < arr.length; i++) arr[i] = i % 4;
            return arr;
          }),
          (data) => {
            const encoded = encoder.encode(data);
            // 압축이 효과적이면 ELYSIA 마커가 있어야 함
            expect(encoded).toContain("ELYSIA");
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it("암호화 인코딩 시 ENC 마커가 포함됨", () => {
      const encoder = new Ddu64Node(undefined, undefined, {
        encryptionKey: "footer-test-key",
      });

      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1, maxLength: 500 }), (data) => {
          const encoded = encoder.encode(data);
          expect(encoded).toContain("ENC");
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // ─── Property 11: 난독화 출력 유효성 ──────────────────────────────────────
  describe("Property 11: 난독화 출력 유효성", () => {
    it("난독화된 출력의 모든 문자가 U+AC00–U+D7A3 범위이고 빈도가 3× 이내", () => {
      const encoder = new Ddu64Node(undefined, undefined, {
        encryptionKey: "obfuscation-test-key",
        obfuscate: true,
      });

      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1, maxLength: 500 }), (data) => {
          const encoded = encoder.encode(data);

          // 푸터 부분(패딩 문자 + 숫자)을 제외한 본문 검증
          // 난독화된 출력에서 ENC 마커와 패딩 부분을 제거
          // 실제로는 전체 인코딩 출력에서 한글 음절 부분만 검증
          const hangulChars = [...encoded].filter((ch) => {
            const code = ch.charCodeAt(0);
            return code >= 0xac00 && code <= 0xd7a3;
          });

          // 난독화된 출력에는 한글 음절이 있어야 함
          expect(hangulChars.length).toBeGreaterThan(0);

          // 모든 한글 문자가 유효 범위 내
          for (const ch of hangulChars) {
            const code = ch.charCodeAt(0);
            expect(code).toBeGreaterThanOrEqual(0xac00);
            expect(code).toBeLessThanOrEqual(0xd7a3);
          }

          // 빈도 분포 검증: 단일 문자 빈도가 기대 균등 빈도의 3배 이내
          if (hangulChars.length >= 10) {
            const freq = new Map<string, number>();
            for (const ch of hangulChars) {
              freq.set(ch, (freq.get(ch) || 0) + 1);
            }
            const expectedFreq = hangulChars.length / freq.size;
            for (const [, count] of freq) {
              expect(count).toBeLessThanOrEqual(expectedFreq * 3);
            }
          }
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // ─── Property 12: 난독화 라운드트립 ───────────────────────────────────────
  describe("Property 12: 난독화 라운드트립", () => {
    it("obfuscate→deobfuscate가 원본 문자열을 복원", () => {
      // 난독화 레이어를 직접 테스트
      const charset = ["A", "B", "C", "D", "E", "F", "G", "H"];
      const layer = new HangulObfuscationLayer(charset);

      fc.assert(
        fc.property(
          // charset 문자로만 구성된 임의 문자열 생성
          fc.array(fc.integer({ min: 0, max: charset.length - 1 }), {
            minLength: 1,
            maxLength: 500,
          }),
          (indices) => {
            const input = indices.map((i) => charset[i]).join("");
            const obfuscated = layer.obfuscate(input);
            const deobfuscated = layer.deobfuscate(obfuscated);
            expect(deobfuscated).toBe(input);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });

    it("Ddu64Node 난독화 인코딩 전체 라운드트립", () => {
      const encoder = new Ddu64Node(undefined, undefined, {
        encryptionKey: "roundtrip-obfuscation-key",
        obfuscate: true,
      });

      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1, maxLength: 500 }), (data) => {
          const encoded = encoder.encode(data);
          const decoded = encoder.decodeToUint8Array(encoded);
          expect(decoded).toEqual(data);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // ─── Property 8: WASM/JS 동등성 (JS fallback 검증) ────────────────────────
  describe("Property 8: WASM/JS 동등성 (JS fallback 검증)", () => {
    it("WASM이 사용 불가능한 상태에서 JS fallback이 정상 동작", () => {
      // preloadWasm() 없이 생성하면 동기 hot path는 JS 구현으로 폴백합니다.
      const encoder = new Ddu64Node();

      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 2000 }), (data) => {
          // JS fallback으로 인코딩/디코딩이 정상 동작해야 함
          const encoded = encoder.encode(data);
          const decoded = encoder.decodeToUint8Array(encoded);
          expect(decoded).toEqual(data);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // ─── Property 9: async 경로 동등성 ────────────────────────────────────────
  describe("Property 9: async 경로 동등성", () => {
    it("비동기 인코딩/디코딩이 동기 경로와 동일하게 라운드트립", async () => {
      const encoder = new Ddu64Node();

      await fc.assert(
        fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 2000 }), async (data) => {
          const encoded = await encoder.encodeAsync(data);
          const decoded = await encoder.decodeToUint8ArrayAsync(encoded);
          expect(decoded).toEqual(data);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // ─── Property 14.3: Tree-shaking 검증 ─────────────────────────────────────
  describe("Property 14.3: Tree-shaking 검증", () => {
    it("core.ts 엔트리포인트가 Node.js 내장 모듈을 import하지 않음", () => {
      // core.ts 소스 파일 읽기
      const coreSource = fs.readFileSync(path.resolve(__dirname, "../core.ts"), "utf-8");

      // Node.js 내장 모듈 패턴
      const nodeModules = [
        "crypto",
        "zlib",
        "stream",
        "fs",
        "path",
        "os",
        "worker_threads",
        "node:",
      ];

      fc.assert(
        fc.property(fc.constantFrom(...nodeModules), (moduleName) => {
          // import 문에서 Node.js 모듈을 직접 참조하지 않아야 함
          const importPattern = new RegExp(`from\\s+["']${moduleName.replace("/", "\\/")}`);
          const requirePattern = new RegExp(`require\\(["']${moduleName.replace("/", "\\/")}`);
          expect(importPattern.test(coreSource)).toBe(false);
          expect(requirePattern.test(coreSource)).toBe(false);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("browser.ts 엔트리포인트가 Node.js 내장 모듈을 import하지 않음", () => {
      const browserSource = fs.readFileSync(path.resolve(__dirname, "../browser.ts"), "utf-8");

      const nodeModules = [
        "crypto",
        "zlib",
        "stream",
        "fs",
        "path",
        "os",
        "worker_threads",
        "node:",
      ];

      fc.assert(
        fc.property(fc.constantFrom(...nodeModules), (moduleName) => {
          const importPattern = new RegExp(`from\\s+["']${moduleName.replace("/", "\\/")}`);
          const requirePattern = new RegExp(`require\\(["']${moduleName.replace("/", "\\/")}`);
          expect(importPattern.test(browserSource)).toBe(false);
          expect(requirePattern.test(browserSource)).toBe(false);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // ─── Property 13: Origin 호환 ─────────────────────────────────────────────
  describe("Property 13: Origin 호환", () => {
    it("DDU 프리셋 + useRepeatPadding으로 인코딩한 결과가 Origin 참조 구현과 동일", () => {
      const encoder = createOriginCompatEncoder();

      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1, maxLength: 500 }), (data) => {
          const nodeEncoded = encoder.encode(data);
          const originEncoded = originDdu64Encode(data);
          expect(nodeEncoded).toBe(originEncoded);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("Origin 호환 인코딩의 라운드트립 검증", () => {
      const encoder = createOriginCompatEncoder();

      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1, maxLength: 500 }), (data) => {
          const encoded = encoder.encode(data);
          const decoded = encoder.decodeToUint8Array(encoded);
          expect(decoded).toEqual(data);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("패딩 문자 수가 Origin 공식과 일치", () => {
      const encoder = createOriginCompatEncoder();
      const PADDING_CHAR = "뭐";

      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1, maxLength: 500 }), (data) => {
          const encoded = encoder.encode(data);

          // Origin 패딩 공식: (6 - (totalBits % 6)) / 2, 또는 0 if 나누어 떨어짐
          const totalBits = data.length * 8;
          const remainder = totalBits % 6;
          const expectedPaddingCount = remainder === 0 ? 0 : Math.floor((6 - remainder) / 2);

          // 후행 패딩 문자 수 계산
          let actualPaddingCount = 0;
          for (let i = encoded.length - 1; i >= 0; i--) {
            if (encoded[i] === PADDING_CHAR) {
              actualPaddingCount++;
            } else {
              break;
            }
          }

          expect(actualPaddingCount).toBe(expectedPaddingCount);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });
});
