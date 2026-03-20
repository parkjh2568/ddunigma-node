import { Ddu64 } from "../index.js";

console.log("╔════════════════════════════════════════════════════════════════════════════╗");
console.log("║            DDU ENIGMA - 빠른 퀵테스트                                     ║");
console.log("║            (핵심 기능 빠르게 검증)                                        ║");
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
console.log("[ 1. 기본 인코딩/디코딩 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encoder = new Ddu64(BASE64_CHARS, "=");
  const testCases = [
    { name: "영문", data: "Hello World!" },
    { name: "한글", data: "안녕하세요" },
    { name: "혼합", data: "Hello안녕123!😀" },
  ];

  testCases.forEach(test => {
    try {
      const encoded = encoder.encode(test.data);
      const decoded = encoder.decode(encoded);
      reportTest(test.name, test.data === decoded);
    } catch (err: any) {
      reportTest(test.name, false, err.message);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 2. 멀티바이트 비 2의 제곱수 charset ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    const encoder = new Ddu64("우따야", "뭐", { usePowerOfTwo: false });
    const testData = "안녕하세요 Hello!";
    const encoded = encoder.encode(testData);
    const decoded = encoder.decode(encoded);
    reportTest("한글 3개 charset", testData === decoded);
  } catch (err: any) {
    reportTest("한글 3개 charset", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 3. 중복 문자 및 최소 길이 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    new Ddu64("우따야야", "뭐", { useBuildErrorReturn: true });
    reportTest("중복 문자 감지", false, "에러가 발생해야 함");
  } catch (err: any) {
    reportTest("중복 문자 감지", err.message.includes("duplicate"));
  }

  try {
    new Ddu64("A", "=", { useBuildErrorReturn: true });
    reportTest("단일 문자 charset 거부", false, "에러가 발생해야 함");
  } catch (err: any) {
    reportTest("단일 문자 charset 거부", err.message.includes("At least 2"));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 4. 패딩 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  // 음수 패딩
  try {
    const encoder = new Ddu64("우따야어", "뭐");
    encoder.decode("우따뭐-5");
    reportTest("음수 패딩 감지", false, "에러가 발생해야 함");
  } catch (err: any) {
    reportTest("음수 패딩 감지", err.message.includes("Invalid padding"));
  }

  // 패딩 오탐 방지
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const testData = "Test data with potential padding collision patterns!";
    const encoded = encoder.encode(testData);
    const decoded = encoder.decode(encoded);
    reportTest("패딩 문자열 오탐 방지", testData === decoded);
  } catch (err: any) {
    reportTest("패딩 문자열 오탐 방지", false, err.message);
  }

  // 숫자 paddingChar 충돌 방지
  try {
    const chars8 = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const encoder = new Ddu64(chars8, "1");
    const testData = "A";
    const encoded = encoder.encode(testData);
    const decoded = encoder.decode(encoded);
    reportTest("paddingChar='1' 충돌 방지", decoded === testData);
  } catch (err: any) {
    reportTest("paddingChar='1' 충돌 방지", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 5. 다양한 charset 크기 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  // 2의 제곱수
  try {
    const chars = Array.from({ length: 64 }, (_, i) => String.fromCharCode(0x4E00 + i));
    const encoder = new Ddu64(chars, "뭐");
    const testData = "64개 charset";
    const encoded = encoder.encode(testData);
    const decoded = encoder.decode(encoded);
    reportTest("64개 (2^6)", testData === decoded);
  } catch (err: any) {
    reportTest("64개 (2^6)", false, err.message);
  }

  // 비 2의 제곱수
  try {
    const chars = Array.from({ length: 100 }, (_, i) => String.fromCharCode(0x5000 + i));
    const encoder = new Ddu64(chars, "뭐", { usePowerOfTwo: false });
    const testData = "100개 charset";
    const encoded = encoder.encode(testData);
    const decoded = encoder.decode(encoded);
    reportTest("100개 (비 2의 제곱수)", testData === decoded);
  } catch (err: any) {
    reportTest("100개 (비 2의 제곱수)", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 6. 바이너리 데이터 (decodeToBuffer) ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encoder = new Ddu64(BASE64_CHARS, "=", { encoding: 'latin1' });

  try {
    const buffer = Buffer.alloc(50, 0xFF);
    const encoded = encoder.encode(buffer);
    const decodedBuffer = encoder.decodeToBuffer(encoded);
    reportTest("모든 0xFF 바이트", buffer.equals(decodedBuffer));
  } catch (err: any) {
    reportTest("모든 0xFF 바이트", false, err.message);
  }

  try {
    const buffer = Buffer.from([0xAA, 0x55].flatMap(b => Array(25).fill(b)));
    const encoded = encoder.encode(buffer);
    const decodedBuffer = encoder.decodeToBuffer(encoded);
    reportTest("반복 패턴 (0xAA, 0x55)", buffer.equals(decodedBuffer));
  } catch (err: any) {
    reportTest("반복 패턴 (0xAA, 0x55)", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 7. 에러 메시지 표준화 / getCharSetInfo ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    new Ddu64("ABC", undefined as any, { useBuildErrorReturn: true });
    reportTest("에러 메시지 접두사", false, "에러가 발생해야 함");
  } catch (err: any) {
    reportTest("에러 메시지 접두사", err.message.includes("[Ddu64 Constructor]"));
  }

  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const info = encoder.getCharSetInfo();
    const passed =
      info.charSet.length === 64 &&
      info.paddingChar === "=" &&
      info.bitLength === 6 &&
      info.usePowerOfTwo === true;
    reportTest("getCharSetInfo", passed);
  } catch (err: any) {
    reportTest("getCharSetInfo", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 8. Fast Path 및 패딩 비트 정밀 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const data = "FastPathTest123!@#";
    const encoded = encoder.encode(data);
    const decoded = encoder.decode(encoded);
    reportTest("Fast Path 동작 확인 (Base64)", data === decoded);
  } catch (err: any) {
    reportTest("Fast Path 동작 확인 (Base64)", false, err.message);
  }

  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const encoded = encoder.encode("A");
    const decoded = encoder.decode(encoded);
    reportTest("패딩 비트 정밀 계산 (1바이트)", decoded === "A");
  } catch (err: any) {
    reportTest("패딩 비트 정밀 계산 (1바이트)", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 9. 압축(compress) 옵션 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encoder = new Ddu64(BASE64_CHARS, "=");

  // 기본 압축
  try {
    const testData = "Hello World! This is a test for compression.";
    const encoded = encoder.encode(testData, { compress: true });
    const decoded = encoder.decode(encoded);
    reportTest("압축 인코딩 → 디코딩 일치", testData === decoded);
  } catch (err: any) {
    reportTest("압축 인코딩 → 디코딩 일치", false, err.message);
  }

  // 압축 decodeToBuffer
  try {
    const testData = "Buffer 압축 테스트 데이터입니다.";
    const encoded = encoder.encode(testData, { compress: true });
    const decodedBuffer = encoder.decodeToBuffer(encoded);
    reportTest("압축 decodeToBuffer 검증", testData === decodedBuffer.toString('utf-8'));
  } catch (err: any) {
    reportTest("압축 decodeToBuffer 검증", false, err.message);
  }

  // 한글 압축
  try {
    const koreanData = "안녕하세요! 반갑습니다. ".repeat(30);
    const compressEncoded = encoder.encode(koreanData, { compress: true });
    const decoded = encoder.decode(compressEncoded);
    reportTest("압축 (한글 데이터)", koreanData === decoded);
  } catch (err: any) {
    reportTest("압축 (한글 데이터)", false, err.message);
  }

  // 빈 문자열 압축
  try {
    const encoded = encoder.encode("", { compress: true });
    const decoded = encoder.decode(encoded);
    reportTest("압축 (빈 문자열)", "" === decoded);
  } catch (err: any) {
    reportTest("압축 (빈 문자열)", false, err.message);
  }

  // 비압축 데이터 호환성
  try {
    const testData = "Normal encoding without compression";
    const encoded = encoder.encode(testData);
    const decoded = encoder.decode(encoded);
    reportTest("비압축 데이터 디코딩 호환성", testData === decoded);
  } catch (err: any) {
    reportTest("비압축 데이터 디코딩 호환성", false, err.message);
  }

  // 바이너리 데이터 압축
  try {
    const binaryEncoder = new Ddu64(BASE64_CHARS, "=", { encoding: 'latin1' });
    const buffer = Buffer.alloc(500, 0xAB);
    const compressEncoded = binaryEncoder.encode(buffer, { compress: true });
    const decodedBuffer = binaryEncoder.decodeToBuffer(compressEncoded);
    reportTest("압축 (바이너리 데이터)", buffer.equals(decodedBuffer));
  } catch (err: any) {
    reportTest("압축 (바이너리 데이터)", false, err.message);
  }

  // 다른 charset 압축
  try {
    const koreanEncoder = new Ddu64("우따야", "뭐", { usePowerOfTwo: false });
    const testData = "다른 charset에서도 압축이 잘 되는지 테스트합니다!";
    const encoded = koreanEncoder.encode(testData, { compress: true });
    const decoded = koreanEncoder.decode(encoded);
    reportTest("압축 (다른 charset)", testData === decoded);
  } catch (err: any) {
    reportTest("압축 (다른 charset)", false, err.message);
  }

  // 대용량 압축
  try {
    const largeData = "Lorem ipsum dolor sit amet. ".repeat(1000);
    const encoded = encoder.encode(largeData, { compress: true });
    const decoded = encoder.decode(encoded);
    reportTest("압축 (대용량 28KB)", largeData === decoded);
  } catch (err: any) {
    reportTest("압축 (대용량 28KB)", false, err.message);
  }

  // 숫자 paddingChar + compress
  try {
    const numPadEncoder = new Ddu64(BASE64_CHARS.slice(0, 8), "9");
    const testData = "AAAA".repeat(200); // 압축 효과가 큰 반복 데이터
    const encoded = numPadEncoder.encode(testData, { compress: true });
    const decoded = numPadEncoder.decode(encoded);
    reportTest("숫자 paddingChar + compress", decoded === testData);
  } catch (err: any) {
    reportTest("숫자 paddingChar + compress", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 10. 보안/안정성 제한 (maxDecodedBytes / maxDecompressedBytes) ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const data = "A".repeat(1024);
    const encoded = encoder.encode(data);
    encoder.decodeToBuffer(encoded, { maxDecodedBytes: 16 });
    reportTest("maxDecodedBytes 제한", false, "에러가 발생해야 함");
  } catch (err: any) {
    reportTest("maxDecodedBytes 제한", String(err.message).includes("exceeds limit"));
  }

  try {
    const encoder = new Ddu64(BASE64_CHARS, "=", { compress: true });
    const data = "AAAAABBBBB".repeat(2000);
    const encoded = encoder.encode(data, { compress: true });
    encoder.decodeToBuffer(encoded, { maxDecompressedBytes: 64 });
    reportTest("maxDecompressedBytes 제한", false, "에러가 발생해야 함");
  } catch (err: any) {
    reportTest(
      "maxDecompressedBytes 제한",
      String(err.message).includes("Decompressed data exceeds limit") || String(err.message).includes("exceeds limit")
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 11. 성능 퀵테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const testData = "A".repeat(10000);
    const encoded = encoder.encode(testData);
    const decoded = encoder.decode(encoded);
    reportTest("10KB 데이터", testData === decoded);
  } catch (err: any) {
    reportTest("10KB 데이터", false, err.message);
  }

  try {
    const encoder = new Ddu64("우따야", "뭐", { usePowerOfTwo: false });
    const testData = "반복";
    let allPassed = true;
    for (let i = 0; i < 100; i++) {
      const encoded = encoder.encode(testData);
      const decoded = encoder.decode(encoded);
      if (decoded !== testData) { allPassed = false; break; }
    }
    reportTest("100회 반복", allPassed);
  } catch (err: any) {
    reportTest("100회 반복", false, err.message);
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
  console.log("✅ 모든 주요 기능 정상 작동!\n");
  console.log("💡 종합 테스트: npx tsx ./src/test/test-comprehensive.ts");
  console.log("💡 호환성 테스트: npx tsx ./src/test/test-compat.ts\n");
} else {
  console.log(`❌ ${failedTests}개 테스트 실패\n`);
  process.exit(1);
}

console.log("╔════════════════════════════════════════════════════════════════════════════╗");
console.log("║                       빠른 퀵테스트 완료!                                  ║");
console.log("╚════════════════════════════════════════════════════════════════════════════╝");
