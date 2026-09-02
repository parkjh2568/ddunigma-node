import { performance } from "node:perf_hooks";
import { packPow2ToString, unpackPow2FromString } from "../src/core/internal/IndexStringMapper.js";

type GuardCase = {
  name: string;
  iterations: number;
  bytes: number;
  minMbps: number;
  fn: () => unknown;
};

let sink = 0;

function consume(value: unknown): void {
  if (typeof value === "string") {
    const signature = value.length === 0 ? 0 : value.length ^ value.charCodeAt(value.length >>> 1);
    sink = Math.imul(sink ^ signature, 16_777_619);
    return;
  }

  if (value instanceof Uint8Array) {
    const signature =
      value.length === 0
        ? 0
        : value.length ^ value[0] ^ value[value.length >>> 1] ^ value[value.length - 1];
    sink = Math.imul(sink ^ signature, 16_777_619);
    return;
  }

  if (value && typeof value === "object") {
    const result = value as {
      payload?: string;
      indices?: ArrayLike<number>;
      paddingBits?: number;
    };
    let signature = result.paddingBits ?? 0;
    if (result.payload !== undefined) {
      signature ^=
        result.payload.length === 0
          ? 0
          : result.payload.length ^ result.payload.charCodeAt(result.payload.length >>> 1);
    }
    if (result.indices !== undefined) {
      signature ^=
        result.indices.length === 0
          ? 0
          : result.indices.length ^ result.indices[result.indices.length >>> 1];
    }
    sink = Math.imul(sink ^ signature, 16_777_619);
  }
}

function runCase(testCase: GuardCase): { name: string; mbps: number; passed: boolean } {
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
  consume(testCase.fn());

  const samples: number[] = [];
  for (let sample = 0; sample < 3; sample++) {
    gc?.();
    const started = performance.now();
    for (let i = 0; i < testCase.iterations; i++) {
      consume(testCase.fn());
    }
    const elapsedMs = performance.now() - started;
    const totalMb = (testCase.bytes * testCase.iterations) / (1024 * 1024);
    samples.push(totalMb / (elapsedMs / 1000));
  }

  samples.sort((a, b) => a - b);
  const mbps = samples[1];
  return { name: testCase.name, mbps, passed: mbps >= testCase.minMbps };
}

function main(): void {
  const bytes16k = new Uint8Array(16 * 1024);
  for (let i = 0; i < bytes16k.length; i++) bytes16k[i] = (i * 31 + 17) & 0xff;
  const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const charCodes = new Uint16Array([...base64Chars].map((char) => char.charCodeAt(0)));

  // unpackPow2FromString용 룩업 테이블(코드 유닛 → 인덱스)과 인코딩 페이로드 문자열.
  let minCode = 0xffff;
  let maxCode = 0;
  for (const code of charCodes) {
    if (code > maxCode) maxCode = code;
    if (code < minCode) minCode = code;
  }
  const lookup = new Int32Array(maxCode - minCode + 1).fill(-1);
  for (let i = 0; i < charCodes.length; i++) lookup[charCodes[i] - minCode] = i;
  const { payload: payload16k, paddingBits: pad16k } = packPow2ToString(bytes16k, 6, charCodes);

  const cases: GuardCase[] = [
    {
      name: "packPow2ToString 16KB",
      iterations: 2_000,
      bytes: bytes16k.byteLength,
      // L2 6/8비트 언롤 융합으로 ~40→~183 MB/s 개선. 측정 기반 보수적 하한
      // (로컬 median ~183, ~40% 마진). 환경 따라 변동하는 상대 하한이며 절대 단정 아님.
      minMbps: 110,
      fn: () => packPow2ToString(bytes16k, 6, charCodes),
    },
    {
      name: "unpackPow2FromString 16KB",
      iterations: 2_000,
      bytes: payload16k.length,
      // L2 대칭 언롤로 영향받는 디코드 경로. 측정 기반 보수적 하한
      // (로컬 median ~420, 노이즈 최저 ~283 대비에도 여유). 환경 따라 변동하는 상대 하한이며 절대 단정 아님.
      minMbps: 220,
      fn: () => unpackPow2FromString(payload16k, pad16k, 6, lookup, minCode),
    },
  ];

  const results = cases.map(runCase);
  console.log("case                         MB/s    min    status");
  console.log("----------------------------------------------------");
  for (const result of results) {
    const testCase = cases.find((item) => item.name === result.name)!;
    console.log(
      `${result.name.padEnd(26)} ${result.mbps.toFixed(1).padStart(7)} ` +
        `${testCase.minMbps.toFixed(1).padStart(6)} ` +
        `${result.passed ? "ok" : "fail"}`,
    );
  }
  console.log(`sink=${sink}`);

  const failed = results.filter((result) => !result.passed);
  if (failed.length > 0) {
    throw new Error(`Performance guard failed: ${failed.map((result) => result.name).join(", ")}`);
  }
}

main();
