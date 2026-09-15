import { performance } from "node:perf_hooks";
import { packPow2ToString, unpackPow2FromString } from "../src/core/internal/IndexStringMapper.js";
import { Ddu64Node } from "../src/Ddu64Node.js";

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
      name: "packPow2ToString 16KiB",
      iterations: 2_000,
      bytes: bytes16k.byteLength,
      // 원시 입력 바이트 기준 고정 절대 하한. 전체 DDU 파이프라인 성능은 별도 측정합니다.
      minMbps: 110,
      fn: () => packPow2ToString(bytes16k, 6, charCodes),
    },
    {
      name: "unpackPow2FromString 16KiB",
      iterations: 2_000,
      bytes: payload16k.length,
      // 인코딩된 ASCII 바이트 기준 하한이므로 encode 수치와 분모가 다릅니다.
      minMbps: 220,
      fn: () => unpackPow2FromString(payload16k, pad16k, 6, lookup, minCode),
    },
  ];
  for (const obfuscate of [false, true]) {
    const codec = new Ddu64Node({ obfuscate });
    const encoded = codec.encode(bytes16k);
    const decoded = codec.decodeToUint8Array(encoded);
    if (decoded.length !== bytes16k.length || decoded.some((byte, i) => byte !== bytes16k[i])) {
      throw new Error(`DDU guard round-trip failed: obfuscate=${obfuscate}`);
    }
    cases.push(
      {
        name: `DDU encode${obfuscate ? " obfuscated" : ""}`,
        iterations: obfuscate ? 200 : 1_000,
        bytes: bytes16k.byteLength,
        minMbps: obfuscate ? 8 : 100,
        fn: () => codec.encode(bytes16k),
      },
      {
        name: `DDU decode${obfuscate ? " obfuscated" : ""}`,
        iterations: obfuscate ? 200 : 1_000,
        bytes: bytes16k.byteLength,
        minMbps: obfuscate ? 16 : 120,
        fn: () => codec.decodeToUint8Array(encoded),
      },
    );
  }

  const results = cases.map(runCase);
  console.log(
    "16KiB source; DDU uses original bytes in both directions, ASCII unpack uses encoded bytes.",
  );
  console.log("case                        MiB/s    min    status");
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
