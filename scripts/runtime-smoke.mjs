/**
 * 런타임 호환성 smoke 테스트.
 *
 * 빌드된 dist 산출물을 실제 Node 런타임에서 실행하여 핵심 기능이 동작하는지
 * 검증합니다. 특히 선언된 최소 Node 버전(>=22)에서 Web Streams를 포함한
 * 전 기능이 저하 없이 동작하는지 확인하는 용도입니다.
 *
 * 6.0 진입점 구조: lean(인코딩+난독화)은 `dist/index.js`, 배터리(압축/암호화/체크섬/
 * Web Streams)는 `dist/secure.js`에서 가져옵니다.
 *
 * 사용: node scripts/runtime-smoke.mjs   (사전에 pnpm build 필요)
 */

import assert from "node:assert/strict";
import { Ddu64 } from "../dist/index.js";
import {
  Ddu64 as Ddu64Secure,
  createReadableEncodeStream,
  createReadableDecodeStream,
} from "../dist/secure.js";

function eq(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  console.log(`  ok: ${label}`);
}

async function main() {
  console.log(`runtime-smoke on Node ${process.version}`);

  // 1) 기본 문자열 라운드트립
  {
    const ddu = new Ddu64();
    const input = "안녕하세요 ddunigma 0123 ABC";
    eq(ddu.decode(ddu.encode(input)), input, "string round-trip");
  }

  // 2) 바이너리 + Buffer 디코드(Node 전용)
  {
    const ddu = new Ddu64();
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 42, 7]);
    eq(ddu.decodeToUint8Array(ddu.encode(bytes)), bytes, "binary round-trip");
    eq(new Uint8Array(ddu.decodeToBuffer(ddu.encode(bytes))), bytes, "decodeToBuffer");
  }

  // 3) 압축 + 체크섬 (zlib + maxOutputLength 한도 경로) — secure 진입점
  {
    const ddu = new Ddu64Secure({ compress: true, checksum: true });
    const input = "x".repeat(4096);
    eq(ddu.decode(ddu.encode(input)), input, "compress+checksum round-trip");
  }

  // 4) brotli — secure 진입점
  {
    const ddu = new Ddu64Secure({ compress: true, compressionAlgorithm: "brotli" });
    const input = "y".repeat(4096);
    eq(ddu.decode(ddu.encode(input)), input, "brotli round-trip");
  }

  // 5) AES-256-GCM 암호화 (pbkdf2 키 파생) — secure 진입점
  {
    const ddu = new Ddu64Secure({ encryptionKey: "smoke-secret", checksum: true });
    const input = "보호 대상 데이터";
    eq(ddu.decode(ddu.encode(input)), input, "encrypt round-trip");
  }

  // 6) Web Streams (Node 글로벌 TransformStream) — secure 진입점
  {
    const ddu = new Ddu64Secure();
    const input = new TextEncoder().encode("stream payload ".repeat(1000));

    const encoded = await collectString(
      streamFrom([input]).pipeThrough(createReadableEncodeStream(ddu)),
    );
    const decoded = await collectBytes(
      streamFrom([encoded]).pipeThrough(createReadableDecodeStream(ddu)),
    );
    eq(decoded, input, "web streams round-trip");
  }

  console.log("runtime-smoke PASSED");
}

function streamFrom(items) {
  return new ReadableStream({
    start(controller) {
      for (const item of items) controller.enqueue(item);
      controller.close();
    },
  });
}

async function collectString(readable) {
  const reader = readable.getReader();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += value;
  }
  return out;
}

async function collectBytes(readable) {
  const reader = readable.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

main().catch((error) => {
  console.error("runtime-smoke FAILED:", error);
  process.exit(1);
});
