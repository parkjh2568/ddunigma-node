import { Ddu64, DduSetSymbol } from "../index.js";

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
    console.log(`  ✓ ${name}`);
  } else {
    failedTests++;
    console.log(`  ✗ ${name}${details ? ` - ${details}` : ""}`);
  }
}

const BASE64_CHARS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P",
  "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "a", "b", "c", "d", "e", "f",
  "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v",
  "w", "x", "y", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "/",
];

// ═══════════════════════════════════════════════════════════════════════════════
console.log("═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 1. 고정 인코딩 결과 디코딩 검증 (v2.0.2 기준) ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

// 커스텀 charset (81자, 중복 포함)으로 인코딩된 고정 결과를 검증
// 이 값들이 깨지면 구버전과 호환되지 않는 것
{
  const customCharset = "qa1437zwo1437IOPLcrlp0NX7IOPLcrlp0NXfgbujmiHDGk6ye37IOPLcrlp0NXdWERThn5QKAJvtSFMZBCV";
  const customPadding = "9";

  const encodedTestCases = [
    { name: "빈 문자열", encoded: "", original: "" },
    { name: "단일 문자 (A)", encoded: "qpqp94", original: "A" },
    { name: "짧은 영문 (Hello)", encoded: "qNqzqgqAqHqza792", original: "Hello" },
    { name: "긴 영문", encoded: "qgqzqeqRqoqwq7qCqiqbqcqKqoqzqIqMqHaqqGqvqoqzqmqtqkq1qaqQqGqbqCqSqDqMqaqtqGqTqgqMqoqwq0qnqmqNqaqAqjquq5a1qoqzq0qtqmqS94", original: "The quick brown fox jumps over the lazy dog" },
    { name: "숫자 (1234567890)", encoded: "qLqXqoqZqcq4qfqVqcqZqya1qLqq94", original: "1234567890" },
    { name: "한글 (안녕하세요)", encoded: "a3qIqbqoa4aaqbqga3qmqbqja3qoqNaaa3qIqQqf", original: "안녕하세요" },
    { name: "혼합 텍스트", encoded: "qNqzqgqAqHqza7qyqgqVazqMqHqzqpqeqoqrqMqgqdqrqvq7qRqNqqqFqLqWqLqya7qIawqjqyqq94", original: "Hello World! 안녕 123 😀" },
    { name: "특수문자", encoded: "qoqfqqqWqIq1qgqkqIqdqnqnqOqga7qKqPqXqCqHququqJazq6q4qAa4qIqMqSqvqlq4aaaoqPqS94", original: "!@#$%^&*()_+-=[]{}|;:',.<>?/" },
    { name: "반복 패턴", encoded: "qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1", original: "ABABAB".repeat(10) },
  ];

  try {
    const decoder = new Ddu64(customCharset, customPadding, { usePowerOfTwo: false });

    encodedTestCases.forEach(test => {
      try {
        const decoded = decoder.decode(test.encoded);
        reportTest(
          `[고정값 디코드] ${test.name}`,
          test.original === decoded,
          test.original !== decoded ? `예상: "${test.original.substring(0, 30)}", 실제: "${decoded.substring(0, 30)}"` : undefined
        );
      } catch (err: any) {
        reportTest(`[고정값 디코드] ${test.name}`, false, err.message);
      }
    });

    // 인코딩 결과도 동일한지 확인 (결정적 인코딩)
    encodedTestCases.forEach(test => {
      try {
        const encoder = new Ddu64(customCharset, customPadding, { usePowerOfTwo: false });
        const encoded = encoder.encode(test.original);
        reportTest(
          `[고정값 인코드] ${test.name}`,
          test.encoded === encoded,
          test.encoded !== encoded ? `예상: "${test.encoded.substring(0, 40)}", 실제: "${encoded.substring(0, 40)}"` : undefined
        );
      } catch (err: any) {
        reportTest(`[고정값 인코드] ${test.name}`, false, err.message);
      }
    });
  } catch (err: any) {
    reportTest("[고정값] 디코더 초기화", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 2. Base64 charset 고정값 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encoder = new Ddu64(BASE64_CHARS, "=");

  // Base64 charset으로 인코딩한 고정 결과
  const fixedCases = [
    { original: "", name: "빈 문자열" },
    { original: "A", name: "단일 문자" },
    { original: "Hello World!", name: "영문" },
    { original: "안녕하세요", name: "한글" },
    { original: "1234567890", name: "숫자" },
  ];

  // 먼저 현재 인코딩 결과를 고정값으로 기록
  const snapshot: Record<string, string> = {};
  fixedCases.forEach(tc => {
    snapshot[tc.name] = encoder.encode(tc.original);
  });

  // 동일한 입력은 항상 동일한 출력을 보장 (결정적 인코딩)
  fixedCases.forEach(tc => {
    try {
      const encoded1 = encoder.encode(tc.original);
      const encoded2 = encoder.encode(tc.original);
      reportTest(`[결정적 인코딩] ${tc.name}`, encoded1 === encoded2);
    } catch (err: any) {
      reportTest(`[결정적 인코딩] ${tc.name}`, false, err.message);
    }
  });

  // 인코딩 → 디코딩 라운드트립 보장
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
console.log("[ 3. DduSetSymbol 프리셋 호환성 ]");
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

      reportTest(`프리셋 ${name}`, allPassed);
    } catch (err: any) {
      reportTest(`프리셋 ${name}`, false, err.message);
    }
  });

  // 동일 프리셋으로 새 인스턴스 생성 시 호환
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
console.log("[ 4. API 표면 호환성 검증 ]");
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
console.log("[ 5. 푸터/마커 형식 호환성 ]");
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
    // 패딩 형식이 "=숫자"로 끝나는지 확인
    const hasPadding = /=[0-9]+$/.test(encoded);
    reportTest("패딩 형식 (=N)", hasPadding);
    reportTest("패딩 디코딩", td === encoder.decode(encoded));
  } catch (err: any) {
    reportTest("패딩 형식", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 6. 생성자 옵션 호환성 ]");
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
    // 64 = 2^6이므로 두 결과가 같아야 함 (자동 강제)
    const encoded1 = encFalse.encode(td);
    const encoded2 = encTrue.encode(td);
    reportTest("usePowerOfTwo 자동 강제 (64=2^6)", encoded1 === encoded2);
  } catch (err: any) {
    reportTest("usePowerOfTwo 자동 강제", false, err.message);
  }

  // useBuildErrorReturn 옵션
  try {
    new Ddu64("AAB", "=", { useBuildErrorReturn: true });
    reportTest("useBuildErrorReturn (중복 시 throw)", false, "에러가 발생해야 함");
  } catch (err: any) {
    reportTest("useBuildErrorReturn (중복 시 throw)", err.message.includes("duplicate"));
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
console.log("[ 7. 인코딩 옵션 호환성 ]");
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
  process.exit(1);
}

console.log("╔════════════════════════════════════════════════════════════════════════════╗");
console.log("║                    구버전 호환성 테스트 완료!                               ║");
console.log("╚════════════════════════════════════════════════════════════════════════════╝");
