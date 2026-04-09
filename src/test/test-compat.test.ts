import { createHash } from "crypto";
import { Readable } from "stream";
import { test, expect } from "vitest";
import { createDecodeStream, createEncodeStream, Ddu64, DduSetSymbol } from "../index.js";

console.log("╔════════════════════════════════════════════════════════════════════════════╗");
console.log("║            DDU ENIGMA - 구버전 호환성 테스트                               ║");
console.log("║            (인코딩 결과 고정값 검증 / API 호환성)                          ║");
console.log("╚════════════════════════════════════════════════════════════════════════════╝\n");

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function reportTest(name: string, passed: boolean, details?: string) {
  totalTests++;
  if (passed) {
    passedTests++;
  } else {
    failedTests++;
  }

  test(name, () => {
    if (!passed) {
      if (details) {
        throw new Error(details);
      }
      expect(passed).toBe(true);
    }
  });
}

function runFixedValueTests(
  label: string,
  encoder: Ddu64,
  cases: { name: string; encoded: string; original?: string; inputHex?: string }[]
) {
  cases.forEach(test => {
    const original = test.inputHex
      ? Buffer.from(test.inputHex, "hex")
      : test.original!;

    // 디코딩 검증
    try {
      if (test.inputHex) {
        const decoded = encoder.decodeToBuffer(test.encoded);
        const expected = Buffer.from(test.inputHex, "hex");
        reportTest(
          `[${label} 디코드] ${test.name}`,
          expected.equals(decoded),
          !expected.equals(decoded) ? `예상hex: ${test.inputHex}, 실제hex: ${decoded.toString("hex").substring(0, 40)}` : undefined
        );
      } else {
        const decoded = encoder.decode(test.encoded);
        reportTest(
          `[${label} 디코드] ${test.name}`,
          test.original === decoded,
          test.original !== decoded ? `예상: "${test.original!.substring(0, 30)}", 실제: "${decoded.substring(0, 30)}"` : undefined
        );
      }
    } catch (err: any) {
      reportTest(`[${label} 디코드] ${test.name}`, false, err.message);
    }

    // 인코딩 검증
    try {
      const encoded = encoder.encode(original);
      reportTest(
        `[${label} 인코드] ${test.name}`,
        test.encoded === encoded,
        test.encoded !== encoded ? `예상: "${test.encoded.substring(0, 40)}", 실제: "${encoded.substring(0, 40)}"` : undefined
      );
    } catch (err: any) {
      reportTest(`[${label} 인코드] ${test.name}`, false, err.message);
    }
  });
}

async function streamToString(readable: NodeJS.ReadableStream): Promise<string> {
  const chunks: string[] = [];
  await new Promise<void>((resolve, reject) => {
    readable
      .on("data", (chunk: Buffer | string) => chunks.push(chunk.toString()))
      .on("end", resolve)
      .on("error", reject);
  });
  return chunks.join("");
}

async function streamToBuffer(readable: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    readable
      .on("data", (chunk: Buffer | string) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      )
      .on("end", resolve)
      .on("error", reject);
  });
  return Buffer.concat(chunks);
}

const BASE64_CHARS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P",
  "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "a", "b", "c", "d", "e", "f",
  "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v",
  "w", "x", "y", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "/",
];

// ═══════════════════════════════════════════════════════════════════════════════
console.log("═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 1. 커스텀 charset 고정 인코딩 결과 검증 (v2.0.2 기준) ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const customCharset = "qa1437zwo1437IOPLcrlp0NX7IOPLcrlp0NXfgbujmiHDGk6ye37IOPLcrlp0NXdWERThn5QKAJvtSFMZBCV";
  const customPadding = "9";
  const decoder = new Ddu64(customCharset, customPadding, { usePowerOfTwo: false });

  runFixedValueTests("커스텀charset", decoder, [
    { name: "빈 문자열", encoded: "", original: "" },
    { name: "단일 문자 (A)", encoded: "qpqp94", original: "A" },
    { name: "짧은 영문 (Hello)", encoded: "qNqzqgqAqHqza792", original: "Hello" },
    { name: "긴 영문", encoded: "qgqzqeqRqoqwq7qCqiqbqcqKqoqzqIqMqHaqqGqvqoqzqmqtqkq1qaqQqGqbqCqSqDqMqaqtqGqTqgqMqoqwq0qnqmqNqaqAqjquq5a1qoqzq0qtqmqS94", original: "The quick brown fox jumps over the lazy dog" },
    { name: "숫자 (1234567890)", encoded: "qLqXqoqZqcq4qfqVqcqZqya1qLqq94", original: "1234567890" },
    { name: "한글 (안녕하세요)", encoded: "a3qIqbqoa4aaqbqga3qmqbqja3qoqNaaa3qIqQqf", original: "안녕하세요" },
    { name: "혼합 텍스트", encoded: "qNqzqgqAqHqza7qyqgqVazqMqHqzqpqeqoqrqMqgqdqrqvq7qRqNqqqFqLqWqLqya7qIawqjqyqq94", original: "Hello World! 안녕 123 😀" },
    { name: "특수문자", encoded: "qoqfqqqWqIq1qgqkqIqdqnqnqOqga7qKqPqXqCqHququqJazq6q4qAa4qIqMqSqvqlq4aaaoqPqS94", original: "!@#$%^&*()_+-=[]{}|;:',.<>?/" },
    { name: "반복 패턴", encoded: "qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1", original: "ABABAB".repeat(10) },
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 2. Base64 charset 바이너리 고정값 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encoder = new Ddu64(BASE64_CHARS, "=");

  runFixedValueTests("Base64", encoder, [
    { name: "단일바이트_0x00", inputHex: "00", encoded: "AA=4" },
    { name: "단일바이트_0xFF", inputHex: "ff", encoded: "/w=4" },
    { name: "2바이트", inputHex: "cafe", encoded: "yv4=2" },
    { name: "3바이트_정렬", inputHex: "deadbe", encoded: "3q2+" },
    { name: "바이트_0to15", inputHex: "000102030405060708090a0b0c0d0e0f", encoded: "AAECAwQFBgcICQoLDA0ODw=4" },
    { name: "일본어", inputHex: "e38193e38293e381abe381a1e381afe4b896e7958c", encoded: "44GT44KT44Gr44Gh44Gv5LiW55WM" },
    { name: "이모지", inputHex: "f09f8e89f09f94a5f09f92bbf09f9a80", encoded: "8J+OifCflKXwn5K78J+agA=4" },
    { name: "줄바꿈포함", inputHex: "6c696e65315c6e6c696e65325c726c696e6533", encoded: "bGluZTFcbmxpbmUyXHJsaW5lMw=4" },
    { name: "공백탭", inputHex: "20205c745c742020", encoded: "ICBcdFx0ICA=2" },
    { name: "URL", inputHex: "68747470733a2f2f6578616d706c652e636f6d2f706174683f713d3126623d322366726167", encoded: "aHR0cHM6Ly9leGFtcGxlLmNvbS9wYXRoP3E9MSZiPTIjZnJhZw=4" },
    { name: "JSON", inputHex: "7b226b6579223a2276616c7565222c226e756d223a3132332c22617272223a5b312c322c335d7d", encoded: "eyJrZXkiOiJ2YWx1ZSIsIm51bSI6MTIzLCJhcnIiOlsxLDIsM119" },
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 3. DDU 프리셋 고정값 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const ddu = new Ddu64(undefined, undefined, { dduSetSymbol: DduSetSymbol.DDU });

  runFixedValueTests("DDU", ddu, [
    { name: "Hello", original: "Hello", encoded: "이이뜌?이!!야우우뜌?.야뭐2" },
    { name: "안녕하세요", original: "안녕하세요", encoded: ".우땨땨이?땨뜌.이.뜌이?이!.우우땨이?우뜌.우땨뜌이이.뜌.우땨땨!이이야" },
    { name: "Test123!@#", original: "Test123!@#", encoded: "이!뜌?이!?우우!뜌우뜌야?이땨야?이뜌!뜌뜌땨뜌?뭐1" },
    { name: "A x50", original: "A".repeat(50), encoded: "이뜌이야뜌!뜌땨이뜌이야뜌!뜌땨이뜌이야뜌!뜌땨이뜌이야뜌!뜌땨이뜌이야뜌!뜌땨이뜌이야뜌!뜌땨이뜌이야뜌!뜌땨이뜌이야뜌!뜌땨이뜌이야뜌!뜌땨이뜌이야뜌!뜌땨이뜌이야뜌!뜌땨이뜌이야뜌!뜌땨이뜌이야뜌!뜌땨이뜌이야뜌!뜌땨이뜌이야뜌!뜌땨이뜌이야뜌!뜌땨이뜌이야뜌야뭐2" },
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 4. ONECHARSET 프리셋 고정값 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const one = new Ddu64(undefined, undefined, { dduSetSymbol: DduSetSymbol.ONECHARSET });

  runFixedValueTests("ONECHARSET", one, [
    { name: "Hello", original: "Hello", encoded: "R3Wga37=2" },
    { name: "안녕하세요", original: "안녕하세요", encoded: "61VywpVW6ZVY6yRp61eU" },
    { name: "Test123!@#", original: "Test123!@#", encoded: "W3Wudr0m4mzAyk=4" },
    { name: "A x50", original: "A".repeat(50), encoded: "QUzsQUzsQUzsQUzsQUzsQUzsQUzsQUzsQUzsQUzsQUzsQUzsQUzsQUzsQUzsQUzsQU0=2" },
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 5. TWOCHARSET 프리셋 고정값 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const two = new Ddu64(undefined, undefined, { dduSetSymbol: DduSetSymbol.TWOCHARSET });

  runFixedValueTests("TWOCHARSET", two, [
    { name: "Hello", original: "Hello", encoded: "B0St3Qwj" },
    { name: "안녕하세요", original: "안녕하세요", encoded: "p8qdZCpW_XwUKLZ7Zcb9XI3T" },
    { name: "Test123!@#", original: "Test123!@#", encoded: "Zz_XbcM2ar8ROz54" },
    { name: "A x50", original: "A".repeat(50), encoded: "h01IOzu7h01IOzu7h01IOzu7h01IOzu7h01IOzu7h01IOzu7h01IOzu7h01IOzu7h01IOzu7h01IOzu7" },
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 6. THREECHARSET 프리셋 고정값 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const three = new Ddu64(undefined, undefined, { dduSetSymbol: DduSetSymbol.THREECHARSET });

  runFixedValueTests("THREECHARSET", three, [
    { name: "Hello", original: "Hello", encoded: "TO3P_bKOIELE5" },
    { name: "안녕하세요", original: "안녕하세요", encoded: "iLTyPLRzYFmFpw768WP35IX5" },
    { name: "Test123!@#", original: "Test123!@#", encoded: "HsZ6JkdhB-8qYrAvdZELE10" },
    { name: "A x50", original: "A".repeat(50), encoded: "q_qyoUYrN3XqT1FBKtuy8NV7q_qyoUYrN3XqT1FBKtuy8NV7q_qyoUYrN3XqT1FBKtuy8NV7q_qyoUwV-ELE5" },
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 7. 비 2의 제곱수 charset 고정값 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const enc5 = new Ddu64("ABCDE", "=", { usePowerOfTwo: false });
  runFixedValueTests("5-charset", enc5, [
    { name: "Hi", original: "Hi", encoded: "ACACAABBAEAE=2" },
    { name: "Test", original: "Test", encoded: "ACBAAABBACBABBADADBAAA=1" },
    { name: "안녕", original: "안녕", encoded: "BCADABABACBBABAABCACBCAAACBBACBA" },
  ]);

  const enc10 = new Ddu64("ABCDEFGHIJ", "=", { usePowerOfTwo: false });
  runFixedValueTests("10-charset", enc10, [
    { name: "Hi", original: "Hi", encoded: "AEAIAGAJ" },
    { name: "Test", original: "Test", encoded: "AFAEAGAFAHADAHAE" },
    { name: "안녕", original: "안녕", encoded: "BEBCAJAFAIAIBEBBAIAFAJAF" },
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 8. 압축 고정값 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encoder = new Ddu64(BASE64_CHARS, "=");

  const compressCases = [
    { name: "A x100 압축", original: "A".repeat(100), encoded: "eJxzdKQ9AAAC6Rll=ELYSIA0" },
    { name: "Hello World! x20 압축", original: "Hello World! ".repeat(20), encoded: "eJzzSM3JyVcIzy/KSVFU8BiZHACo7ldF=ELYSIA0" },
  ];

  compressCases.forEach(test => {
    // 디코딩 검증
    try {
      const decoded = encoder.decode(test.encoded);
      reportTest(
        `[압축 디코드] ${test.name}`,
        test.original === decoded,
        test.original !== decoded ? `길이 불일치: 예상=${test.original.length}, 실제=${decoded.length}` : undefined
      );
    } catch (err: any) {
      reportTest(`[압축 디코드] ${test.name}`, false, err.message);
    }

    // 인코딩 검증
    try {
      const encoded = encoder.encode(test.original, { compress: true });
      reportTest(
        `[압축 인코드] ${test.name}`,
        test.encoded === encoded,
        test.encoded !== encoded ? `예상: "${test.encoded.substring(0, 40)}", 실제: "${encoded.substring(0, 40)}"` : undefined
      );
    } catch (err: any) {
      reportTest(`[압축 인코드] ${test.name}`, false, err.message);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 9. 체크섬 고정값 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encoder = new Ddu64(BASE64_CHARS, "=");

  const checksumCases = [
    { name: "Hello", original: "Hello", encoded: "SGVsbG8=2CHKf7d18982" },
    { name: "안녕하세요", original: "안녕하세요", encoded: "7JWI64WV7ZWY7IS47JqUCHK4c8b7af1" },
    { name: "1234567890", original: "1234567890", encoded: "MTIzNDU2Nzg5MA=4CHK261daee5" },
  ];

  checksumCases.forEach(test => {
    // 디코딩 검증
    try {
      const decoded = encoder.decode(test.encoded, { checksum: true });
      reportTest(`[체크섬 디코드] ${test.name}`, test.original === decoded);
    } catch (err: any) {
      reportTest(`[체크섬 디코드] ${test.name}`, false, err.message);
    }

    // 인코딩 검증
    try {
      const encoded = encoder.encode(test.original, { checksum: true });
      reportTest(
        `[체크섬 인코드] ${test.name}`,
        test.encoded === encoded,
        test.encoded !== encoded ? `예상: "${test.encoded}", 실제: "${encoded}"` : undefined
      );
    } catch (err: any) {
      reportTest(`[체크섬 인코드] ${test.name}`, false, err.message);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 10. 청크 분할 고정값 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encoder = new Ddu64(BASE64_CHARS, "=");

  try {
    const original = "Hello World! This is a chunked encoding test.";
    const expectedChunked = "SGVsbG8gV29ybGQhIFRo\naXMgaXMgYSBjaHVua2Vk\nIGVuY29kaW5nIHRlc3Qu";
    const encoded = encoder.encode(original, { chunkSize: 20, chunkSeparator: "\n" });
    reportTest("[청크 인코드] chunkSize=20", expectedChunked === encoded);
    const decoded = encoder.decode(encoded);
    reportTest("[청크 디코드] chunkSize=20", original === decoded);
  } catch (err: any) {
    reportTest("[청크] chunkSize=20", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 11. 결정적 인코딩 / 라운드트립 보장 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encoder = new Ddu64(BASE64_CHARS, "=");

  const fixedCases = [
    { original: "", name: "빈 문자열" },
    { original: "A", name: "단일 문자" },
    { original: "Hello World!", name: "영문" },
    { original: "안녕하세요", name: "한글" },
    { original: "1234567890", name: "숫자" },
  ];

  // 결정적 인코딩
  fixedCases.forEach(tc => {
    try {
      const encoded1 = encoder.encode(tc.original);
      const encoded2 = encoder.encode(tc.original);
      reportTest(`[결정적 인코딩] ${tc.name}`, encoded1 === encoded2);
    } catch (err: any) {
      reportTest(`[결정적 인코딩] ${tc.name}`, false, err.message);
    }
  });

  // 라운드트립
  fixedCases.forEach(tc => {
    try {
      const encoded = encoder.encode(tc.original);
      const decoded = encoder.decode(encoded);
      reportTest(`[라운드트립] ${tc.name}`, tc.original === decoded);
    } catch (err: any) {
      reportTest(`[라운드트립] ${tc.name}`, false, err.message);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 12. DduSetSymbol 프리셋 라운드트립 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const symbols = [
    { name: "ONECHARSET", symbol: DduSetSymbol.ONECHARSET },
    { name: "DDU", symbol: DduSetSymbol.DDU },
    { name: "TWOCHARSET", symbol: DduSetSymbol.TWOCHARSET },
    { name: "THREECHARSET", symbol: DduSetSymbol.THREECHARSET },
  ];

  const testStrings = [
    "Hello World!",
    "안녕하세요",
    "Hello안녕123!😀",
    "A".repeat(1000),
  ];

  symbols.forEach(({ name, symbol }) => {
    try {
      const encoder = new Ddu64(undefined, undefined, { dduSetSymbol: symbol });
      let allPassed = true;

      testStrings.forEach(td => {
        try {
          const encoded = encoder.encode(td);
          const decoded = encoder.decode(encoded);
          if (decoded !== td) allPassed = false;
        } catch {
          allPassed = false;
        }
      });

      reportTest(`프리셋 ${name} 라운드트립`, allPassed);
    } catch (err: any) {
      reportTest(`프리셋 ${name} 라운드트립`, false, err.message);
    }
  });

  // 크로스 인스턴스
  symbols.forEach(({ name, symbol }) => {
    try {
      const enc1 = new Ddu64(undefined, undefined, { dduSetSymbol: symbol });
      const enc2 = new Ddu64(undefined, undefined, { dduSetSymbol: symbol });
      const td = "크로스 인스턴스 호환성 테스트";
      const encoded = enc1.encode(td);
      const decoded = enc2.decode(encoded);
      reportTest(`프리셋 ${name} 크로스 인스턴스`, td === decoded);
    } catch (err: any) {
      reportTest(`프리셋 ${name} 크로스 인스턴스`, false, err.message);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 13. Preset Fingerprint 고정값 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const presetFingerprints = [
    { name: "DDU", symbol: DduSetSymbol.DDU, sha256: "936aca6b5fe8d318d2e53f9182577b555f43668c62772f0d190c6acf40e92546" },
    { name: "ONECHARSET", symbol: DduSetSymbol.ONECHARSET, sha256: "d2becd25877816098156c5ba32b4b5b0be23ff21716b1cbab54c3cf0a49df782" },
    { name: "TWOCHARSET", symbol: DduSetSymbol.TWOCHARSET, sha256: "ce8124bd20b9f5cddbea2cc8209c97cd160fec979eb3735fd07ba2d6f50619a6" },
    { name: "THREECHARSET", symbol: DduSetSymbol.THREECHARSET, sha256: "5a774e228b3e9d33a95c1191069aaa6c587d1ae0b13b3e80b4be963893728af1" },
  ];

  presetFingerprints.forEach(({ name, symbol, sha256 }) => {
    try {
      const encoder = new Ddu64(undefined, undefined, { dduSetSymbol: symbol });
      const info = encoder.getCharSetInfo();
      const digest = createHash("sha256")
        .update(
          JSON.stringify({
            charSet: info.charSet,
            paddingChar: info.paddingChar,
            bitLength: info.bitLength,
            charLength: info.charLength,
            usePowerOfTwo: info.usePowerOfTwo,
          })
        )
        .digest("hex");

      reportTest(`프리셋 ${name} fingerprint`, digest === sha256, `예상: ${sha256}, 실제: ${digest}`);
    } catch (err: any) {
      reportTest(`프리셋 ${name} fingerprint`, false, err.message);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 14. 스트림 Wire Format 호환성 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encoder = new Ddu64(BASE64_CHARS, "=");

  try {
    const encoded = await streamToString(
      Readable.from([Buffer.from("Hello")]).pipe(createEncodeStream(encoder))
    );
    reportTest("기본 스트림 헤더 인코드 고정값", encoded === "=DDS1N0=SGVsbG8=2", `실제: "${encoded}"`);

    const decoded = await streamToBuffer(
      Readable.from([Buffer.from(encoded)]).pipe(createDecodeStream(encoder))
    );
    reportTest("기본 스트림 헤더 디코드", decoded.toString("utf-8") === "Hello");
  } catch (err: any) {
    reportTest("기본 스트림 헤더 호환성", false, err.message);
  }

  try {
    const legacyEncoded = await streamToString(
      Readable.from([Buffer.from("Hello")]).pipe(
        createEncodeStream(encoder, { streamAutoDetect: false })
      )
    );
    reportTest("레거시 footer-only 스트림 고정값", legacyEncoded === "SGVsbG8=2", `실제: "${legacyEncoded}"`);

    const decoded = await streamToBuffer(
      Readable.from([Buffer.from(legacyEncoded)]).pipe(createDecodeStream(encoder))
    );
    reportTest("레거시 footer-only 기본 디코드", decoded.toString("utf-8") === "Hello");
  } catch (err: any) {
    reportTest("레거시 footer-only 스트림 호환성", false, err.message);
  }

  try {
    const deflateEncoder = new Ddu64(BASE64_CHARS, "=", { compress: true });
    const encoded = await streamToString(
      Readable.from([Buffer.from("Hello Hello Hello Hello Hello")]).pipe(
        createEncodeStream(deflateEncoder)
      )
    );
    reportTest("압축 스트림 헤더 접두사", encoded.startsWith("=DDS1D0="), `실제: "${encoded.slice(0, 16)}"`);
  } catch (err: any) {
    reportTest("압축 스트림 헤더 접두사", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 15. API 표면 호환성 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encoder = new Ddu64(BASE64_CHARS, "=");

  // 필수 메서드 존재 확인
  const requiredMethods = [
    "encode",
    "decode",
    "decodeToBuffer",
    "encodeAsync",
    "decodeAsync",
    "decodeToBufferAsync",
    "getCharSetInfo",
    "getStats",
  ];

  requiredMethods.forEach(method => {
    reportTest(`API: ${method}() 존재`, typeof (encoder as any)[method] === "function");
  });

  // getCharSetInfo 반환 구조 확인
  try {
    const info = encoder.getCharSetInfo();
    reportTest("API: getCharSetInfo().charSet", Array.isArray(info.charSet));
    reportTest("API: getCharSetInfo().paddingChar", typeof info.paddingChar === "string");
    reportTest("API: getCharSetInfo().bitLength", typeof info.bitLength === "number");
    reportTest("API: getCharSetInfo().usePowerOfTwo", typeof info.usePowerOfTwo === "boolean");
    reportTest("API: getCharSetInfo().encoding", typeof info.encoding === "string");
  } catch (err: any) {
    reportTest("API: getCharSetInfo 구조", false, err.message);
  }

  // getStats 반환 구조 확인
  try {
    const stats = encoder.getStats("test");
    reportTest("API: getStats().originalSize", typeof stats.originalSize === "number");
    reportTest("API: getStats().encodedSize", typeof stats.encodedSize === "number");
    reportTest("API: getStats().expansionRatio", typeof stats.expansionRatio === "number");
    reportTest("API: getStats().charsetSize", typeof stats.charsetSize === "number");
    reportTest("API: getStats().bitLength", typeof stats.bitLength === "number");
  } catch (err: any) {
    reportTest("API: getStats 구조", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 16. 푸터/마커 형식 호환성 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  // 압축 마커 "ELYSIA" 호환성
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const td = "A".repeat(100);
    const compressed = encoder.encode(td, { compress: true });
    reportTest("ELYSIA 압축 마커 존재", compressed.includes("ELYSIA"));
    reportTest("ELYSIA 압축 디코딩", td === encoder.decode(compressed));
  } catch (err: any) {
    reportTest("ELYSIA 압축 마커", false, err.message);
  }

  // 체크섬 마커 "CHK" 호환성
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const td = "checksum test";
    const encoded = encoder.encode(td, { checksum: true });
    const chkMatch = encoded.match(/CHK[0-9a-f]{8}$/i);
    reportTest("CHK 체크섬 마커 형식", chkMatch !== null);
    reportTest("CHK 체크섬 디코딩", td === encoder.decode(encoded, { checksum: true }));
  } catch (err: any) {
    reportTest("CHK 체크섬 마커", false, err.message);
  }

  // 암호화 마커 "ENC" 호환성
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=", { encryptionKey: "test-key" });
    const td = "encryption test";
    const encoded = encoder.encode(td);
    reportTest("ENC 암호화 마커 존재", encoded.includes("ENC"));
    reportTest("ENC 암호화 디코딩", td === encoder.decode(encoded));
  } catch (err: any) {
    reportTest("ENC 암호화 마커", false, err.message);
  }

  // 패딩 형식: 패딩문자 + 숫자(paddingBits)
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const td = "A"; // 1바이트 → 패딩 필요
    const encoded = encoder.encode(td);
    const hasPadding = /=[0-9]+$/.test(encoded);
    reportTest("패딩 형식 (=N)", hasPadding);
    reportTest("패딩 디코딩", td === encoder.decode(encoded));
  } catch (err: any) {
    reportTest("패딩 형식", false, err.message);
  }

  // 압축+체크섬 복합 마커
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const td = "A".repeat(100);
    const encoded = encoder.encode(td, { compress: true, checksum: true });
    reportTest("압축+체크섬 복합 마커", encoded.includes("ELYSIA") && encoded.includes("CHK"));
    reportTest("압축+체크섬 디코딩", td === encoder.decode(encoded, { checksum: true }));
  } catch (err: any) {
    reportTest("압축+체크섬 복합", false, err.message);
  }

  // 암호화+압축 복합 (암호화 데이터는 랜덤이므로 압축이 효과 없을 수 있어 ELYSIA가 없을 수 있음)
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=", { encryptionKey: "complex-key" });
    const td = "A".repeat(100);
    const encoded = encoder.encode(td, { compress: true });
    reportTest("암호화+압축 마커 (ENC 필수)", encoded.includes("ENC"));
    reportTest("암호화+압축 디코딩", td === encoder.decode(encoded));
  } catch (err: any) {
    reportTest("암호화+압축 복합", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 17. 생성자 옵션 호환성 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  // 문자열 charset 입력
  try {
    const enc = new Ddu64("ABCDEFGH", "=");
    const td = "test";
    reportTest("문자열 charset 입력", td === enc.decode(enc.encode(td)));
  } catch (err: any) {
    reportTest("문자열 charset 입력", false, err.message);
  }

  // 배열 charset 입력
  try {
    const enc = new Ddu64(["A", "B", "C", "D", "E", "F", "G", "H"], "=");
    const td = "test";
    reportTest("배열 charset 입력", td === enc.decode(enc.encode(td)));
  } catch (err: any) {
    reportTest("배열 charset 입력", false, err.message);
  }

  // undefined charset (프리셋 사용)
  try {
    const enc = new Ddu64(undefined, undefined, { dduSetSymbol: DduSetSymbol.ONECHARSET });
    const td = "test";
    reportTest("undefined charset (프리셋)", td === enc.decode(enc.encode(td)));
  } catch (err: any) {
    reportTest("undefined charset (프리셋)", false, err.message);
  }

  // usePowerOfTwo 옵션
  try {
    const encFalse = new Ddu64(BASE64_CHARS, "=", { usePowerOfTwo: false });
    const encTrue = new Ddu64(BASE64_CHARS, "=", { usePowerOfTwo: true });
    const td = "강제 설정 테스트";
    const encoded1 = encFalse.encode(td);
    const encoded2 = encTrue.encode(td);
    reportTest("usePowerOfTwo 자동 강제 (64=2^6)", encoded1 === encoded2);
  } catch (err: any) {
    reportTest("usePowerOfTwo 자동 강제", false, err.message);
  }

  // useBuildErrorReturn 옵션 (deprecated 호환)
  try {
    new Ddu64("AAB", "=", { useBuildErrorReturn: true });
    reportTest("useBuildErrorReturn (중복 시 throw)", false, "에러가 발생해야 함");
  } catch (err: any) {
    reportTest("useBuildErrorReturn (중복 시 throw)", err.message.includes("duplicate"));
  }

  // throwOnError 옵션
  try {
    new Ddu64("AAB", "=", { throwOnError: true });
    reportTest("throwOnError (중복 시 throw)", false, "에러가 발생해야 함");
  } catch (err: any) {
    reportTest("throwOnError (중복 시 throw)", err.message.includes("duplicate"));
  }

  // encoding 옵션
  try {
    const enc = new Ddu64(BASE64_CHARS, "=", { encoding: "latin1" });
    const buf = Buffer.from([0xFF, 0x00, 0xAA]);
    const encoded = enc.encode(buf);
    const decoded = enc.decodeToBuffer(encoded);
    reportTest("encoding: latin1 옵션", buf.equals(decoded));
  } catch (err: any) {
    reportTest("encoding: latin1 옵션", false, err.message);
  }

  // Buffer 입력 지원
  try {
    const enc = new Ddu64(BASE64_CHARS, "=");
    const buf = Buffer.from("Buffer 입력 테스트", "utf-8");
    const encoded = enc.encode(buf);
    const decoded = enc.decode(encoded);
    reportTest("Buffer 입력 지원", decoded === "Buffer 입력 테스트");
  } catch (err: any) {
    reportTest("Buffer 입력 지원", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 18. 인코딩 옵션 호환성 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encoder = new Ddu64(BASE64_CHARS, "=");
  const td = "옵션 호환성 테스트 데이터입니다. ".repeat(10);

  // compress 옵션
  try {
    const encoded = encoder.encode(td, { compress: true });
    reportTest("encode 옵션: compress", td === encoder.decode(encoded));
  } catch (err: any) {
    reportTest("encode 옵션: compress", false, err.message);
  }

  // compressionLevel 옵션
  try {
    const encoded1 = encoder.encode(td, { compress: true, compressionLevel: 1 });
    const encoded9 = encoder.encode(td, { compress: true, compressionLevel: 9 });
    reportTest("encode 옵션: compressionLevel=1 디코딩", td === encoder.decode(encoded1));
    reportTest("encode 옵션: compressionLevel=9 디코딩", td === encoder.decode(encoded9));
  } catch (err: any) {
    reportTest("encode 옵션: compressionLevel", false, err.message);
  }

  // checksum 옵션
  try {
    const encoded = encoder.encode(td, { checksum: true });
    reportTest("encode 옵션: checksum", td === encoder.decode(encoded, { checksum: true }));
  } catch (err: any) {
    reportTest("encode 옵션: checksum", false, err.message);
  }

  // chunkSize + chunkSeparator 옵션
  try {
    const encoded = encoder.encode(td, { chunkSize: 76, chunkSeparator: "\n" });
    reportTest("encode 옵션: chunkSize+separator", td === encoder.decode(encoded));
  } catch (err: any) {
    reportTest("encode 옵션: chunkSize+separator", false, err.message);
  }

  // onProgress 옵션
  try {
    let called = false;
    encoder.encode(td, { onProgress: () => { called = true; } });
    reportTest("encode 옵션: onProgress", called);
  } catch (err: any) {
    reportTest("encode 옵션: onProgress", false, err.message);
  }

  // decode 옵션: maxDecodedBytes
  try {
    const encoded = encoder.encode("A".repeat(100));
    encoder.decodeToBuffer(encoded, { maxDecodedBytes: 10 });
    reportTest("decode 옵션: maxDecodedBytes", false, "에러가 발생해야 함");
  } catch (err: any) {
    reportTest("decode 옵션: maxDecodedBytes", String(err.message).includes("exceeds limit"));
  }

  // decode 옵션: maxDecompressedBytes
  try {
    const bigData = "X".repeat(10000);
    const compressed = encoder.encode(bigData, { compress: true });
    encoder.decode(compressed, { maxDecompressedBytes: 100 });
    reportTest("decode 옵션: maxDecompressedBytes", false, "에러가 발생해야 함");
  } catch (err: any) {
    reportTest("decode 옵션: maxDecompressedBytes", String(err.message).includes("exceeds limit"));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 19. 엣지 케이스 바이너리 고정값 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encoder = new Ddu64(BASE64_CHARS, "=");

  // 다양한 바이트 길이별 라운드트립 (패딩 비트 변화 검증)
  for (let len = 1; len <= 8; len++) {
    try {
      const buf = Buffer.alloc(len);
      for (let i = 0; i < len; i++) buf[i] = (i * 37 + 0xAB) & 0xFF;
      const encoded = encoder.encode(buf);
      const decoded = encoder.decodeToBuffer(encoded);
      reportTest(`[바이트길이 ${len}] 라운드트립`, buf.equals(decoded));
    } catch (err: any) {
      reportTest(`[바이트길이 ${len}] 라운드트립`, false, err.message);
    }
  }

  // 전체 바이트 범위 (0x00~0xFF)
  try {
    const allBytes = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) allBytes[i] = i;
    const encoded = encoder.encode(allBytes);
    const decoded = encoder.decodeToBuffer(encoded);
    reportTest("[전체 바이트 0x00-0xFF] 라운드트립", allBytes.equals(decoded));
  } catch (err: any) {
    reportTest("[전체 바이트 0x00-0xFF] 라운드트립", false, err.message);
  }

  // 전부 0x00
  try {
    const zeros = Buffer.alloc(32, 0);
    const encoded = encoder.encode(zeros);
    const decoded = encoder.decodeToBuffer(encoded);
    reportTest("[32바이트 0x00] 라운드트립", zeros.equals(decoded));
  } catch (err: any) {
    reportTest("[32바이트 0x00] 라운드트립", false, err.message);
  }

  // 전부 0xFF
  try {
    const ones = Buffer.alloc(32, 0xFF);
    const encoded = encoder.encode(ones);
    const decoded = encoder.decodeToBuffer(encoded);
    reportTest("[32바이트 0xFF] 라운드트립", ones.equals(decoded));
  } catch (err: any) {
    reportTest("[32바이트 0xFF] 라운드트립", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 최종 결과 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

const successRate = ((passedTests / totalTests) * 100).toFixed(1);

console.log(`총 테스트: ${totalTests}개`);
console.log(`통과: ${passedTests}개 (${successRate}%)`);
console.log(`실패: ${failedTests}개\n`);

if (failedTests === 0) {
  console.log("✅ 모든 호환성 테스트 통과! 구버전과 완벽히 호환됩니다.\n");
} else {
  console.log(`❌ ${failedTests}개 호환성 테스트 실패 - 구버전 호환성이 깨졌을 수 있습니다.\n`);
}

console.log("╔════════════════════════════════════════════════════════════════════════════╗");
console.log("║                    구버전 호환성 테스트 완료!                               ║");
console.log("╚════════════════════════════════════════════════════════════════════════════╝");
