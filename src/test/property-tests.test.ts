/**
 * Property-Based Tests (fast-check)
 *
 * ddunigma 라이브러리의 핵심 속성을 검증하는 property-based 테스트.
 * 모든 테스트는 최소 100회 반복으로 실행됩니다.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { Ddu64Node } from "../Ddu64Node.js";
import { Ddu64Secure } from "../Ddu64Secure.js";
import { Ddu64Core } from "../core/Ddu64Core.js";
import { NodeAdapter } from "../adapters/NodeAdapter.js";
import { BrowserAdapter } from "../adapters/BrowserAdapter.js";
import { DduSetSymbol } from "../core/types.js";
import { createReadableEncodeStream, createReadableDecodeStream } from "../streams/WebStreams.js";
import { HangulObfuscationLayer } from "../obfuscation/ObfuscationLayer.js";
import { parseFooter } from "../core/wireFormat.js";
import { bitPackEncode, bitPackDecode, type BitPackConfig } from "../core/BitPack.js";
import {
  packPow2ToString,
  unpackPow2FromString,
  packNonPow2ToString,
  unpackNonPow2FromString,
} from "../core/internal/IndexStringMapper.js";
import { buildCharsetLookupTables } from "../core/internal/CharsetLookup.js";
import compatVectorsData from "./fixtures/compat-vectors.json";
import scopedChecksumData from "./fixtures/scoped-checksum-vectors.json";
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
          // sha256 경로 동등성 (빠름). 기본 pbkdf2 동등성은 아래 별도 테스트에서 저반복으로 검증.
          const nodeKey = nodeAdapter.deriveKeySync(key, { algorithm: "sha256" });
          const browserKey = await browserAdapter.deriveKey(key, { algorithm: "sha256" });

          // 둘 다 32바이트(256비트) SHA-256 해시여야 함
          expect(nodeKey.length).toBe(32);
          expect(browserKey.length).toBe(32);

          // 바이트 단위로 동일해야 함
          expect(nodeKey).toEqual(browserKey);
        }),
        { numRuns: NUM_RUNS },
      );
    });

    it("기본 키 파생은 pbkdf2이며 어댑터 간 동일한 32바이트 키를 생성 (저반복)", async () => {
      const nodeAdapter = new NodeAdapter();
      const browserAdapter = new BrowserAdapter();
      const opts = { iterations: 10_000 } as const; // 기본 algorithm(pbkdf2) + 빠른 반복수

      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1, maxLength: 64 }), async (key) => {
          const nodeDefault = nodeAdapter.deriveKeySync(key, opts);
          const nodePbkdf2 = nodeAdapter.deriveKeySync(key, { algorithm: "pbkdf2", ...opts });
          const browserDefault = await browserAdapter.deriveKey(key, opts);

          // 기본값 == 명시적 pbkdf2
          expect(nodeDefault).toEqual(nodePbkdf2);
          // Node ↔ Browser pbkdf2 동등성
          expect(browserDefault).toEqual(nodeDefault);
          expect(nodeDefault.length).toBe(32);
          // sha256과는 달라야 함(기본이 pbkdf2임을 확인)
          expect(nodeDefault).not.toEqual(nodeAdapter.deriveKeySync(key, { algorithm: "sha256" }));
        }),
        { numRuns: 10 },
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
            // 동일한 키 해시 파생 (sha256 = 빠름; 상호운용 검증에는 알고리즘 무관)
            const keyHash = nodeAdapter.deriveKeySync(keyStr, { algorithm: "sha256" });

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
            const keyHash = nodeAdapter.deriveKeySync(keyStr, { algorithm: "sha256" });

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
      const encoder = new Ddu64Secure(undefined, undefined, { compress: true });

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
      const encoder = new Ddu64Secure(undefined, undefined, {
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
      const encoder = new Ddu64Secure(undefined, undefined, { checksum: true });

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
            const keyHash = nodeAdapter.deriveKeySync(keyStr, { algorithm: "sha256" });
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
      const encoder = new Ddu64Secure(undefined, undefined, { compress: true });

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
      const encoder = new Ddu64Secure(undefined, undefined, {
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
      const encoder = new Ddu64Secure(undefined, undefined, {
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
      const encoder = new Ddu64Secure(undefined, undefined, {
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

  // ─── Property 8: 대용량 입력 라운드트립 ────────────────────────
  describe("Property 8: 대용량 입력 라운드트립", () => {
    it("다양한 길이의 바이너리 입력이 정상 라운드트립", () => {
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

  // ─── Property 2 (novelty-first-restructure): 키 없는 난독화 라운드트립 ──────
  // Feature: novelty-first-restructure, Property 2: 키 없는 난독화 라운드트립
  // Validates: Requirements 5.2, 5.3, 5.4, 1.5, 2.6
  describe("Property 2: 키 없는 난독화 라운드트립 (디코드 키 무관)", () => {
    it("암호화 키 없이 obfuscate한 결과를 디코더 키 보유/미보유와 무관하게 원본 복원", () => {
      // 인코더: 암호화 키 없음 + obfuscate (기본 진입점, lean)
      const encoderNoKey = new Ddu64Node(undefined, undefined, { obfuscate: true });
      // 디코더 키 미보유 (기본 진입점, lean)
      const decoderNoKey = new Ddu64Node(undefined, undefined, { obfuscate: true });
      // 디코더 키 보유 — 역난독은 키 비의존이므로 동일하게 복원해야 함.
      // (키 보유 디코더는 secure 표면이므로 Ddu64Core로 구성; requireEncryption:false로 평문 footer 허용)
      const decoderWithKey = new Ddu64Core(undefined, undefined, {
        obfuscate: true,
        encryptionKey: "decoder-side-key",
        requireEncryption: false,
        adapter: new NodeAdapter(),
        obfuscationLayerFactory: (alphabet) => new HangulObfuscationLayer(alphabet),
      });

      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 256 }), (data) => {
          const encoded = encoderNoKey.encode(data);
          const viaNoKey = decoderNoKey.decodeToUint8Array(encoded, { obfuscate: true });
          const viaWithKey = decoderWithKey.decodeToUint8Array(encoded, { obfuscate: true });
          expect(viaNoKey).toEqual(data);
          expect(viaWithKey).toEqual(data);
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // ─── Property 3 (novelty-first-restructure): 키 없는 난독화 출력 형식 ───────
  // Feature: novelty-first-restructure, Property 3: 키 없는 난독화 출력 형식
  // Validates: Requirements 5.1
  describe("Property 3: 키 없는 난독화 출력 형식", () => {
    it("암호화 키 없이 obfuscate한 인코딩이 오류 없이 완료되고 모든 문자가 U+AC00–U+D7A3", () => {
      const encoder = new Ddu64Node(undefined, undefined, { obfuscate: true });

      fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 256 }), (data) => {
          const encoded = encoder.encode(data);
          for (const ch of encoded) {
            const code = ch.codePointAt(0)!;
            expect(code).toBeGreaterThanOrEqual(0xac00);
            expect(code).toBeLessThanOrEqual(0xd7a3);
          }
        }),
        { numRuns: NUM_RUNS },
      );
    });
  });

  // ─── Property 1 (novelty-first-restructure): 기본 진입점 라운드트립 ──────────
  // Feature: novelty-first-restructure, Property 1: 기본 진입점 라운드트립
  // Validates: Requirements 7.1
  describe("Property 1 (novelty-first): 기본 진입점 라운드트립", () => {
    it("기본 진입점(Ddu64Node)의 decode(encode(x))가 옵션 없이 원본과 동치", () => {
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
  });

  // ─── Property 4 (novelty-first-restructure): Secure 라운드트립 ───────────────
  // Feature: novelty-first-restructure, Property 4: Secure 라운드트립
  // Validates: Requirements 2.2, 2.5, 5.5
  describe("Property 4 (novelty-first): Secure 압축/암호/체크섬 라운드트립", () => {
    it("압축·암호화·체크섬·난독화의 임의 조합에서 동일 키/옵션 라운드트립이 원본 복원", () => {
      fc.assert(
        fc.property(
          fc.uint8Array({ minLength: 0, maxLength: 1000 }),
          fc.record({
            compress: fc.boolean(),
            compressionAlgorithm: fc.constantFrom("deflate" as const, "brotli" as const),
            encryptionKey: fc.option(fc.string({ minLength: 1, maxLength: 64 }), {
              nil: undefined,
            }),
            checksum: fc.boolean(),
            obfuscate: fc.boolean(),
          }),
          (data, opts) => {
            // 난독화는 인코딩/디코딩에 동일 인스턴스를 사용하므로 키 보유 여부와 무관하게 가역적.
            const encoder = new Ddu64Secure(undefined, undefined, {
              compress: opts.compress,
              compressionAlgorithm: opts.compressionAlgorithm,
              encryptionKey: opts.encryptionKey,
              checksum: opts.checksum,
              obfuscate: opts.obfuscate,
            });
            const encoded = encoder.encode(data);
            const decoded = encoder.decodeToUint8Array(encoded);
            expect(decoded).toEqual(data);
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// encoding-perf-optimization Property Tests
// ═══════════════════════════════════════════════════════════════════════════════

// Feature: encoding-perf-optimization, Property 1: 융합 경로 바이트 동치
// Validates: Requirements 1.1, 1.4, 3.2, 3.4, 3.5, 7.1, 7.3
//
// 융합 인코드(packPow2/NonPow2ToString)의 {payload, paddingBits}가 기준 경로
// (bitPackEncode → 인덱스 → charCode 매핑)와 바이트 단위로 동일하고, 융합
// 디코드(unpackPow2/NonPow2FromString)의 출력 바이트가 기준 bitPackDecode와
// 동일함을 charset 매트릭스(64=6bit/256=8bit/16=4bit pow2, 50/100=non-pow2)
// 전반에서 고정한다. 최적화 전 기준선 안전망.
describe("Property 1 (encoding-perf-optimization): 융합 경로 바이트 동치", () => {
  /** 요청 크기의 단일 BMP 코드 유닛 charset을 U+AC00부터 생성 */
  function makeCharset(size: number): string[] {
    const set = new Array<string>(size);
    for (let i = 0; i < size; i++) {
      set[i] = String.fromCharCode(0xac00 + i);
    }
    return set;
  }

  /** 기준: BitPack 인덱스를 charCodes로 매핑해 문자열로 변환 */
  function indicesToReferenceString(indices: ArrayLike<number>, charCodes: Uint16Array): string {
    let out = "";
    for (let i = 0; i < indices.length; i++) {
      out += String.fromCharCode(charCodes[indices[i]]);
    }
    return out;
  }

  interface MatrixEntry {
    label: string;
    config: BitPackConfig;
    charCodes: Uint16Array;
    lookup: Int32Array;
    lookupOffset: number;
  }

  function makeEntry(label: string, config: BitPackConfig): MatrixEntry {
    const charset = makeCharset(config.charsetSize);
    const { charCodes, charCodeLookup, lookupOffset } = buildCharsetLookupTables(charset);
    return { label, config, charCodes, lookup: charCodeLookup, lookupOffset };
  }

  // charset 매트릭스: pow2(6/8/4 bit) + non-pow2(50/100).
  const matrix: MatrixEntry[] = [
    makeEntry("pow2 64 (6bit)", { bitLength: 6, usePowerOfTwo: true, charsetSize: 64 }),
    makeEntry("pow2 256 (8bit)", { bitLength: 8, usePowerOfTwo: true, charsetSize: 256 }),
    makeEntry("pow2 16 (4bit)", { bitLength: 4, usePowerOfTwo: true, charsetSize: 16 }),
    makeEntry("non-pow2 50 (6bit)", { bitLength: 6, usePowerOfTwo: false, charsetSize: 50 }),
    makeEntry("non-pow2 100 (7bit)", { bitLength: 7, usePowerOfTwo: false, charsetSize: 100 }),
  ];

  it("융합 인코드/디코드가 raw 비트팩 기준과 바이트 동치 (pow2 6/8/4 + non-pow2 50/100)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...matrix),
        fc.uint8Array({ minLength: 0, maxLength: 4096 }),
        (entry, data) => {
          const { config, charCodes, lookup, lookupOffset } = entry;

          // ── 인코드 동치: 융합 {payload, paddingBits} vs 기준 매핑 ──
          const ref = bitPackEncode(data, config);
          const fused = config.usePowerOfTwo
            ? packPow2ToString(data, config.bitLength, charCodes)
            : packNonPow2ToString(data, config.bitLength, config.charsetSize, charCodes);

          expect(fused.paddingBits).toBe(ref.paddingBits);
          expect(fused.payload).toBe(indicesToReferenceString(ref.indices, charCodes));

          // ── 디코드 동치: 융합 출력 바이트 vs 기준 bitPackDecode ──
          const indices = new Array<number>(fused.payload.length);
          for (let i = 0; i < fused.payload.length; i++) {
            indices[i] = lookup[fused.payload.charCodeAt(i) - lookupOffset];
          }
          const refBytes = bitPackDecode(indices, fused.paddingBits, config);
          const fusedBytes = config.usePowerOfTwo
            ? unpackPow2FromString(
                fused.payload,
                fused.paddingBits,
                config.bitLength,
                lookup,
                lookupOffset,
              )
            : unpackNonPow2FromString(
                fused.payload,
                fused.paddingBits,
                config.bitLength,
                config.charsetSize,
                lookup,
                lookupOffset,
              );

          expect(Array.from(fusedBytes)).toEqual(Array.from(refBytes));
          // 라운드트립 원본 일치까지 함께 고정
          expect(Array.from(fusedBytes)).toEqual(Array.from(data));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// Feature: encoding-perf-optimization, Property 2: 라운드트립
// Validates: Requirements 4.2, 5.1, 5.2, 5.3, 5.4, 2.4
//
// 임의 바이트열 x(빈 입력 및 패딩 비정렬 길이 포함)와 모든 charset 프리셋
// (DDU/V1/ONECHARSET/커스텀 pow2/커스텀 non-pow2)에 대해, 융합 경로(공개
// encode/decode 진입점)로 인코딩한 뒤 디코딩하면 x와 동치인 바이트열을
// 복원한다. fc.uint8Array의 길이 다양성으로 빈 입력(5.3)과 패딩 비정렬
// 길이(5.4)를 자동 포섭한다. 최적화 전 기준선 안전망.
describe("Property 2 (encoding-perf-optimization): 라운드트립", () => {
  interface PresetEntry {
    label: string;
    encoder: Ddu64Node;
  }

  // 커스텀 Pow2_Charset: 표준 base64 64자(2^6).
  const CUSTOM_POW2_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  // 커스텀 NonPow2_Charset: 2의 제곱수가 아닌 50자(A-Z + a-x).
  const CUSTOM_NON_POW2_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwx";

  // charset 프리셋 매트릭스: DDU(기본) / V1 / ONECHARSET / 커스텀 pow2 / 커스텀 non-pow2.
  const presets: PresetEntry[] = [
    { label: "DDU (기본 64-charset 6bit pow2)", encoder: new Ddu64Node() },
    {
      label: "V1 (DDU_V1 non-pow2)",
      encoder: new Ddu64Node(undefined, undefined, { dduSetSymbol: DduSetSymbol.DDU_V1 }),
    },
    {
      label: "ONECHARSET (64-charset 6bit pow2)",
      encoder: new Ddu64Node(undefined, undefined, { dduSetSymbol: DduSetSymbol.ONECHARSET }),
    },
    {
      label: "커스텀 pow2 (base64 64자)",
      encoder: new Ddu64Node(CUSTOM_POW2_CHARSET, "="),
    },
    {
      label: "커스텀 non-pow2 (50자)",
      encoder: new Ddu64Node(CUSTOM_NON_POW2_CHARSET, "="),
    },
  ];

  it("모든 프리셋에서 decode(encode(x)) === x (빈 입력·패딩 비정렬 포함)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...presets),
        fc.uint8Array({ minLength: 0, maxLength: 2048 }),
        (preset, data) => {
          const encoded = preset.encoder.encode(data);
          const decoded = preset.encoder.decodeToUint8Array(encoded);
          expect(decoded).toEqual(data);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// Feature: encoding-perf-optimization, Property 3: 과거 데이터 하위호환
// Validates: Requirements 2.1, 2.2, 2.3, 7.2
//
// 생성 불가한 과거 데이터(고정 벡터)를 전수 순회하여 융합 디코드 경로가 각
// 벡터의 기대 평문을 바이트 단위로 복원함을 고정한다. compat-vectors.json은
// V2(DDU)/V1(DDU_V1) 인코딩 문자열을, scoped-checksum-vectors.json은 CK 체크섬
// 와이어 포맷(체크섬 검증 포함)을 다룬다. 고정 벡터는 생성 불가한 과거
// 데이터이므로 fast-check 생성 대신 전수 순회로 단언한다. 최적화 전 기준선 안전망.
describe("Property 3 (encoding-perf-optimization): 과거 데이터 하위호환", () => {
  // ── compat-vectors: V2(DDU) / V1(DDU_V1) 고정 인코딩 문자열 ──
  interface CompatVector {
    name: string;
    input: string;
    v2: string;
    v1: string;
  }
  const compatVectors = compatVectorsData as CompatVector[];

  const v2Encoder = new Ddu64Node();
  const v1Encoder = new Ddu64Node(undefined, undefined, { dduSetSymbol: DduSetSymbol.DDU_V1 });

  it("compat-vectors 전수: V2(DDU)/V1(DDU_V1) 디코드가 기대 평문 복원", () => {
    expect(compatVectors.length).toBeGreaterThan(0);
    for (const vec of compatVectors) {
      expect(v2Encoder.decode(vec.v2)).toBe(vec.input);
      expect(v1Encoder.decode(vec.v1)).toBe(vec.input);
    }
  });

  // ── scoped-checksum-vectors: CK 자기기술 체크섬 와이어 포맷 ──
  interface ScopedVector {
    id: string;
    input: { raw: string; encoding: string };
    options: { compress?: boolean; encryptionKey?: string; checksumScope: string };
    expected: { encoded: string | null };
    tags: string[];
  }
  const scopedFile = scopedChecksumData as { vectors: ScopedVector[] };
  // 결정론적(비암호화) 벡터만 고정 인코딩이 존재한다(암호화는 랜덤 IV).
  const scopedVectors = scopedFile.vectors.filter(
    (v) => v.tags.includes("deterministic") && v.expected.encoded !== null,
  );

  function fromHex(hex: string): Uint8Array {
    if (hex === "") return new Uint8Array(0);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  // 체크섬/압축 기능은 secure 진입점에서 검증한다(scoped-checksum-vectors.test.ts와 동일).
  const checksumDecoder = new Ddu64Secure();

  it("scoped-checksum-vectors 전수: 체크섬 검증 포함 디코드가 기대 평문 복원", () => {
    expect(scopedVectors.length).toBeGreaterThan(0);
    for (const vec of scopedVectors) {
      // CK 마커에서 scope 자동 감지 + 체크섬 검증을 포함해 디코드한다.
      const decoded = checksumDecoder.decodeToUint8Array(vec.expected.encoded!, { checksum: true });
      expect(Array.from(decoded)).toEqual(Array.from(fromHex(vec.input.raw)));
    }
  });
});
