import { Ddu64, DduSetSymbol } from "../index.js";

console.log("╔════════════════════════════════════════════════════════════════════════════╗");
console.log("║            DDU ENIGMA - 빠른 검증 테스트                                  ║");
console.log("║            (주요 기능만 빠르게 테스트)                                    ║");
console.log("╚════════════════════════════════════════════════════════════════════════════╝\n");

// 테스트 통계
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
  console.log("한글 3개 charset:");
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
console.log("[ 3. 중복 문자 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    new Ddu64("우따야야", "뭐", { useBuildErrorReturn: true });
    reportTest("중복 문자 감지", false, "에러가 발생해야 함");
  } catch (err: any) {
    reportTest("중복 문자 감지", err.message.includes("duplicate"));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 3-1. 최소 charset 길이 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    new Ddu64("A", "=", { useBuildErrorReturn: true });
    reportTest("단일 문자 charset 거부", false, "에러가 발생해야 함");
  } catch (err: any) {
    reportTest("단일 문자 charset 거부", err.message.includes("At least 2"));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 4. 패딩 형식 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    const encoder = new Ddu64("우따야어", "뭐");
    encoder.decode("우따뭐-5");
    reportTest("음수 패딩 감지", false, "에러가 발생해야 함");
  } catch (err: any) {
    reportTest("음수 패딩 감지", err.message.includes("Invalid padding"));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 4-1. 패딩 문자열 오탐 방지 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  // 미리 정의된 BASE64 charset으로 간단하게 테스트
  // "=1" 같은 패턴이 인코딩 결과 중간에 나타나도 패딩으로 오인하지 않는지 확인
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    
    // "=1", "=2" 같은 패턴이 포함될 수 있는 데이터로 테스트
    const testData = "Test data with potential padding collision patterns!";
    const encoded = encoder.encode(testData);
    const decoded = encoder.decode(encoded);
    
    reportTest(
      "패딩 문자열 오탐 방지",
      testData === decoded,
      `original=${testData}, decoded=${decoded}`
    );
  } catch (err: any) {
    reportTest("패딩 문자열 오탐 방지", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 4-2. 숫자 paddingChar 충돌 방지 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  // paddingChar 자체가 숫자일 때, 뒤에 붙는 paddingBits(10진수)와 충돌하여
  // lastIndexOf 기반 파싱이 깨질 수 있는 케이스를 회귀 테스트로 고정.
  try {
    const chars8 = ["a", "b", "c", "d", "e", "f", "g", "h"]; // 8 = 2^3
    const encoder = new Ddu64(chars8, "1");
    const testData = "A"; // 1바이트 -> 3bit 인코딩 시 paddingBits=1이 되기 쉬움 ("...11" 형태)
    const encoded = encoder.encode(testData);
    const decoded = encoder.decode(encoded);
    reportTest("paddingChar='1' 충돌 방지", decoded === testData, `Encoded: ${encoded}`);
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
  
  // 0xFF 바이트
  try {
    const buffer = Buffer.alloc(50, 0xFF);
    const encoded = encoder.encode(buffer);
    const decodedBuffer = encoder.decodeToBuffer(encoded);
    reportTest("모든 0xFF 바이트", buffer.equals(decodedBuffer));
  } catch (err: any) {
    reportTest("모든 0xFF 바이트", false, err.message);
  }

  // 반복 패턴
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
console.log("[ 7. 에러 메시지 표준화 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    new Ddu64("ABC", undefined as any, { useBuildErrorReturn: true });
    reportTest("에러 메시지 접두사", false, "에러가 발생해야 함");
  } catch (err: any) {
    reportTest("에러 메시지 접두사", err.message.includes("[Ddu64 Constructor]"));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 8. getCharSetInfo 메서드 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
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
console.log("[ 9. 성능 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  // 대용량 데이터
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const testData = "A".repeat(10000);
    const encoded = encoder.encode(testData);
    const decoded = encoder.decode(encoded);
    reportTest("10KB 데이터", testData === decoded);
  } catch (err: any) {
    reportTest("10KB 데이터", false, err.message);
  }

  // 반복 테스트
  try {
    const encoder = new Ddu64("우따야", "뭐", { usePowerOfTwo: false });
    const testData = "반복";
    let allPassed = true;
    
    for (let i = 0; i < 100; i++) {
      const encoded = encoder.encode(testData);
      const decoded = encoder.decode(encoded);
      if (decoded !== testData) {
        allPassed = false;
        break;
      }
    }
    
    reportTest("100회 반복", allPassed);
  } catch (err: any) {
    reportTest("100회 반복", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 10. 커스텀 charset (81자) 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const customCharset = "qa1437zwo1437IOPLcrlp0NX7IOPLcrlp0NXfgbujmiHDGk6ye37IOPLcrlp0NXdWERThn5QKAJvtSFMZBCV";
  const customPadding = "9";
  
  console.log(`Charset 길이: ${customCharset.length}자 (중복 포함)`);
  console.log(`Padding: "${customPadding}"\n`);
  
  try {
    const encoder = new Ddu64(customCharset, customPadding, { usePowerOfTwo: false });
    const info = encoder.getCharSetInfo();
    console.log(`실제 사용 문자 수: ${info.charSet.length}자 (중복 제거 후)`);
    console.log(`BitLength: ${info.bitLength}, PowerOfTwo: ${info.usePowerOfTwo}\n`);
    
    const testCases = [
      { name: "빈 문자열", data: "" },
      { name: "단일 문자", data: "A" },
      { name: "짧은 영문", data: "Hello" },
      { name: "긴 영문", data: "The quick brown fox jumps over the lazy dog" },
      { name: "숫자", data: "1234567890" },
      { name: "한글", data: "안녕하세요" },
      { name: "혼합 텍스트", data: "Hello World! 안녕 123 😀" },
      { name: "특수문자", data: "!@#$%^&*()_+-=[]{}|;:',.<>?/" },
      { name: "반복 패턴", data: "ABABAB".repeat(10) },
      { name: "대용량 (1KB)", data: "Lorem ipsum dolor sit amet, ".repeat(40) },
    ];
    
    const encodedResults: { name: string; encoded: string; original: string }[] = [];
    
    testCases.forEach(test => {
      try {
        const encoded = encoder.encode(test.data);
        const decoded = encoder.decode(encoded);
        const passed = test.data === decoded;
        
        // 인코딩 결과를 저장 (대용량 데이터는 일부만)
        encodedResults.push({
          name: test.name,
          encoded: encoded,
          original: test.data
        });
        
        reportTest(
          `[커스텀81] ${test.name}`,
          passed,
          passed ? undefined : `길이: ${test.data.length} → ${decoded.length}`
        );
      } catch (err: any) {
        reportTest(`[커스텀81] ${test.name}`, false, err.message);
      }
    });
    
  } catch (err: any) {
    reportTest("[커스텀81] 인코더 초기화", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 10-1. 커스텀 charset decode 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const customCharset = "qa1437zwo1437IOPLcrlp0NX7IOPLcrlp0NXfgbujmiHDGk6ye37IOPLcrlp0NXdWERThn5QKAJvtSFMZBCV";
  const customPadding = "9";
  
  // 10번 테스트의 실제 인코딩 결과들
  const encodedTestCases = [
    { name: "빈 문자열", encoded: "", original: "" },
    { name: "단일 문자", encoded: "qpqp94", original: "A" },
    { name: "짧은 영문", encoded: "qNqzqgqAqHqza792", original: "Hello" },
    { name: "긴 영문", encoded: "qgqzqeqRqoqwq7qCqiqbqcqKqoqzqIqMqHaqqGqvqoqzqmqtqkq1qaqQqGqbqCqSqDqMqaqtqGqTqgqMqoqwq0qnqmqNqaqAqjquq5a1qoqzq0qtqmqS94", original: "The quick brown fox jumps over the lazy dog" },
    { name: "숫자", encoded: "qLqXqoqZqcq4qfqVqcqZqya1qLqq94", original: "1234567890" },
    { name: "한글", encoded: "a3qIqbqoa4aaqbqga3qmqbqja3qoqNaaa3qIqQqf", original: "안녕하세요" },
    { name: "혼합 텍스트", encoded: "qNqzqgqAqHqza7qyqgqVazqMqHqzqpqeqoqrqMqgqdqrqvq7qRqNqqqFqLqWqLqya7qIawqjqyqq94", original: "Hello World! 안녕 123 😀" },
    { name: "특수문자", encoded: "qoqfqqqWqIq1qgqkqIqdqnqnqOqga7qKqPqXqCqHququqJazq6q4qAa4qIqMqSqvqlq4aaaoqPqS94", original: "!@#$%^&*()_+-=[]{}|;:',.<>?/" },
    { name: "반복 패턴", encoded: "qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1qpqfqIqaqpqEq7q1", original: "ABABAB".repeat(10) },
    { name: "대용량 (1KB)", encoded: "qXqzazqMqmqbqBqyqiquqaqZqGqbqBqyqmqzazqAqHaqqoqyqDqVqRqBqoqzq7qJqmquqpqAqoq3qFqtqDqTqgqJqoqzqRqSqDaqqgqJqoqzq0qtqHqzazqMqoqwqcq5qGq1qaqeqHqbqgqBqPq1qaqLqHaqqIqRqHqNqaq5qDqwqcqCqHqNqaqEqHqVqFqtqDqdqaqZqiquqpqyqjqbqCqRqGq1qSqyqXqzazqMqmqbqBqyqiquqaqZqGqbqBqyqmqzazqAqHaqqoqyqDqVqRqBqoqzq7qJqmquqpqAqoq3qFqtqDqTqgqJqoqzqRqSqDaqqgqJqoqzq0qtqHqzazqMqoqwqcq5qGq1qaqeqHqbqgqBqPq1qaqLqHaqqIqRqHqNqaq5qDqwqcqCqHqNqaqEqHqVqFqtqDqdqaqZqiquqpqyqjqbqCqRqGq1qSqyqXqzazqMqmqbqBqyqiquqaqZqGqbqBqyqmqzazqAqHaqqoqyqDqVqRqBqoqzq7qJqmquqpqAqoq3qFqtqDqTqgqJqoqzqRqSqDaqqgqJqoqzq0qtqHqzazqMqoqwqcq5qGq1qaqeqHqbqgqBqPq1qaqLqHaqqIqRqHqNqaq5qDqwqcqCqHqNqaqEqHqVqFqtqDqdqaqZqiquqpqyqjqbqCqRqGq1qSqyqXqzazqMqmqbqBqyqiquqaqZqGqbqBqyqmqzazqAqHaqqoqyqDqVqRqBqoqzq7qJqmquqpqAqoq3qFqtqDqTqgqJqoqzqRqSqDaqqgqJqoqzq0qtqHqzazqMqoqwqcq5qGq1qaqeqHqbqgqBqPq1qaqLqHaqqIqRqHqNqaq5qDqwqcqCqHqNqaqEqHqVqFqtqDqdqaqZqiquqpqyqjqbqCqRqGq1qSqyqXqzazqMqmqbqBqyqiquqaqZqGqbqBqyqmqzazqAqHaqqoqyqDqVqRqBqoqzq7qJqmquqpqAqoq3qFqtqDqTqgqJqoqzqRqSqDaqqgqJqoqzq0qtqHqzazqMqoqwqcq5qGq1qaqeqHqbqgqBqPq1qaqLqHaqqIqRqHqNqaq5qDqwqcqCqHqNqaqEqHqVqFqtqDqdqaqZqiquqpqyqjqbqCqRqGq1qSqyqXqzazqMqmqbqBqyqiquqaqZqGqbqBqyqmqzazqAqHaqqoqyqDqVqRqBqoqzq7qJqmquqpqAqoq3qFqtqDqTqgqJqoqzqRqSqDaqqgqJqoqzq0qtqHqzazqMqoqwqcq5qGq1qaqeqHqbqgqBqPq1qaqLqHaqqIqRqHqNqaq5qDqwqcqCqHqNqaqEqHqVqFqtqDqdqaqZqiquqpqyqjqbqCqRqGq1qSqyqXqzazqMqmqbqBqyqiquqaqZqGqbqBqyqmqzazqAqHaqqoqyqDqVqRqBqoqzq7qJqmquqpqAqoq3qFqtqDqTqgqJqoqzqRqSqDaqqgqJqoqzq0qtqHqzazqMqoqwqcq5qGq1qaqeqHqbqgqBqPq1qaqLqHaqqIqRqHqNqaq5qDqwqcqCqHqNqaqEqHqVqFqtqDqdqaqZqiquqpqyqjqbqCqRqGq1qSqyqXqzazqMqmqbqBqyqiquqaqZqGqbqBqyqmqzazqAqHaqqoqyqDqVqRqBqoqzq7qJqmquqpqAqoq3qFqtqDqTqgqJqoqzqRqSqDaqqgqJqoqzq0qtqHqzazqMqoqwqcq5qGq1qaqeqHqbqgqBqPq1qaqLqHaqqIqRqHqNqaq5qDqwqcqCqHqNqaqEqHqVqFqtqDqdqaqZqiquqpqyqjqbqCqRqGq1qSqyqXqzazqMqmqbqBqyqiquqaqZqGqbqBqyqmqzazqAqHaqqoqyqDqVqRqBqoqzq7qJqmquqpqAqoq3qFqtqDqTqgqJqoqzqRqSqDaqqgqJqoqzq0qtqHqzazqMqoqwqcq5qGq1qaqeqHqbqgqBqPq1qaqLqHaqqIqRqHqNqaq5qDqwqcqCqHqNqaqEqHqVqFqtqDqdqaqZqiquqpqyqjqbqCqRqGq1qSqyqXqzazqMqmqbqBqyqiquqaqZqGqbqBqyqmqzazqAqHaqqoqyqDqVqRqBqoqzq7qJqmquqpqAqoq3qFqtqDqTqgqJqoqzqRqSqDaqqgqJqoqzq0qtqHqzazqMqoqwqcq5qGq1qaqeqHqbqgqBqPq1qaqLqHaqqIqRqHqNqaq5qDqwqcqCqHqNqaqEqHqVqFqtqDqdqaqZqiquqpqyqjqbqCqRqGq1qSqyqXqzazqMqmqbqBqyqiquqaqZqGqbqBqyqmqzazqAqHaqqoqyqDqVqRqBqoqzq7qJqmquqpqAqoq3qFqtqDqTqgqJqoqzqRqSqDaqqgqJqoqzq0qtqHqzazqMqoqwqcq5qGq1qaqeqHqbqgqBqPq1qaqLqHaqqIqRqHqNqaq5qDqwqcqCqHqNqaqEqHqVqFqtqDqdqaqZqiquqpqyqjqbqCqRqGq1qSqyqXqzazqMqmqbqBqyqiquqaqZqGqbqBqyqmqzazqAqHaqqoqyqDqVqRqBqoqzq7qJqmquqpqAqoq3qFqtqDqTqgqJqoqzqRqSqDaqqgqJqoqzq0qtqHqzazqMqoqwqcq5qGq1qaqeqHqbqgqBqPq1qaqLqHaqqIqRqHqNqaq5qDqwqcqCqHqNqaqEqHqVqFqtqDqdqaqZqiquqpqyqjqbqCqRqGq1qSqyqXqzazqMqmqbqBqyqiquqaqZqGqbqBqyqmqzazqAqHaqqoqyqDqVqRqBqoqzq7qJqmquqpqAqoq3qFqtqDqTqgqJqoqzqRqSqDaqqgqJqoqzq0qtqHqzazqMqoqwqcq5qGq1qaqeqHqbqgqBqPq1qaqLqHaqqIqRqHqNqaq5qDqwqcqCqHqNqaqEqHqVqFqtqDqdqaqZqiquqpqyqjqbqCqRqGq1qSqyqXqzazqMqmqbqBqyqiquqaqZqGqbqBqyqmqzazqAqHaqqoqyqDqVqRqBqoqzq7qJqmquqpqAqoqq94", original: "Lorem ipsum dolor sit amet, ".repeat(40) },
  ];
  
  try {
    const decoder = new Ddu64(customCharset, customPadding, { usePowerOfTwo: false });
    
    encodedTestCases.forEach(test => {
      try {
        const decoded = decoder.decode(test.encoded);
        const passed = test.original === decoded;
        reportTest(
          `[디코드] ${test.name}`,
          passed,
          passed ? undefined : `예상: "${test.original.substring(0, 50)}...", 실제: "${decoded.substring(0, 50)}..."`
        );
      } catch (err: any) {
        reportTest(`[디코드] ${test.name}`, false, err.message);
      }
    });
  } catch (err: any) {
    reportTest("[디코드] 디코더 초기화", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 11. Fast Path 최적화 및 정밀 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  // 1) Fast Path (<25 bit) - 일반적인 Base64 (6bit)
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const info = encoder.getCharSetInfo();
    console.log(`  [Fast Path] BitLength: ${info.bitLength} (<= 24)`);
    
    const data = "FastPathTest123!@#";
    const encoded = encoder.encode(data);
    const decoded = encoder.decode(encoded);
    reportTest("Fast Path 동작 확인 (Base64)", data === decoded);
  } catch (err: any) {
    reportTest("Fast Path 동작 확인 (Base64)", false, err.message);
  }

  // 2) 패딩 비트 정밀 테스트 (1바이트 입력)
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    // "A" (ASCII 65 = 0x41 = 01000001)
    // 6비트 단위 분할:
    // 1. 010000 (16) -> 'Q'
    // 2. 01 (남은 2비트)
    //    -> 왼쪽 정렬(Shift): 010000 (16) -> 'Q'
    //    -> 패딩 문자열: "=" + "2" (2비트 패딩됨을 의미하는 것이 아니라, 2비트가 남았었다는 의미가 아니라 Ddu64는 paddingBits 개수를 기록함)
    //    -> 코드상 paddingBits = bitLength - accumulatorBits
    //    -> bitLength(6) - accumulatorBits(2) = 4비트가 모자람(패딩됨)
    //    -> 따라서 "=4" 가 붙어야 함.
    
    const encoded = encoder.encode("A");
    const decoded = encoder.decode(encoded);
    
    const passed = decoded === "A";
    reportTest("패딩 비트 정밀 계산 (1바이트)", passed, passed ? undefined : `Encoded: ${encoded}`);
  } catch (err: any) {
    reportTest("패딩 비트 정밀 계산 (1바이트)", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 12. 압축(compress) 옵션 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encoder = new Ddu64(BASE64_CHARS, "=");
  
  // ─────────────────────────────────────────────────────────────────────────────
  // 상세 비교 테이블
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("┌─────────────────────────────────────────────────────────────────────────────┐");
  console.log("│                    원문 vs 기존인코딩 vs 압축인코딩 비교                    │");
  console.log("├───────────────────┬──────────┬──────────┬──────────┬──────────┬────────────┤");
  console.log("│ 데이터 타입       │ 원문(자) │ 기존(자) │ 압축(자) │ 압축률   │ 디코딩검증 │");
  console.log("├───────────────────┼──────────┼──────────┼──────────┼──────────┼────────────┤");

  const testCases = [
    { name: "짧은 영문", data: "Hello World!" },
    { name: "반복 패턴", data: "ABCD".repeat(250) },
    { name: "긴 영문", data: "The quick brown fox jumps over the lazy dog. ".repeat(25) },
    { name: "한글 텍스트", data: "안녕하세요! 반갑습니다. 오늘 날씨가 좋네요. ".repeat(20) },
    { name: "혼합 텍스트", data: "Hello안녕123!@#가나다ABC".repeat(40) },
    { name: "숫자 반복", data: "0123456789".repeat(100) },
    { name: "특수문자", data: "!@#$%^&*()_+-=[]{}|;':\",./<>?".repeat(30) },
    { name: "공백 반복", data: "    ".repeat(250) },
    { name: "영어 로렘압숨",data:`Lorem ipsum dolor sit amet, consectetur adipiscing elit. Fusce diam quam, fermentum rutrum ornare ut, cursus ac leo. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Ut eget orci sed leo auctor cursus a sed magna. Nullam ultricies, nulla in ullamcorper dictum, ligula mauris gravida risus, in convallis arcu mauris eu purus. Maecenas pretium, sem ac dapibus consequat, risus odio sagittis elit, eu bibendum ante quam euismod eros. Integer bibendum nibh dictum porta aliquet. Morbi eget diam magna. Cras ultricies, justo et dignissim elementum, neque nisl imperdiet dui, quis aliquet magna lacus at mi. Aliquam vehicula ornare lacus et varius. Donec id gravida lacus. Integer commodo turpis vitae fermentum ornare. Integer ac purus vel tellus vehicula consequat ac ut eros.

Proin a dapibus massa. In in ex nec nulla mattis vehicula. Nulla consequat ex at dolor malesuada auctor fringilla ac diam. Sed nec felis tortor. Integer metus eros, hendrerit interdum fringilla non, pharetra non dui. Sed fringilla vehicula augue, ut facilisis libero feugiat ac. Proin a porttitor odio, volutpat laoreet lectus. Donec vitae imperdiet augue. Ut pretium porta interdum. Ut luctus tempus urna, ut mollis mi finibus vel. Ut accumsan, dui id pulvinar dignissim, enim libero elementum diam, sed dapibus sapien leo nec turpis. Sed lacus nulla, fermentum vitae felis sit amet, tempus condimentum sapien. Ut condimentum id augue at pulvinar.

Fusce molestie sem nec tristique mattis. Morbi pretium vehicula orci vitae efficitur. Sed blandit nunc mattis ultricies tristique. Morbi volutpat mauris ac tortor mattis, ut volutpat metus scelerisque. Mauris ante turpis, dignissim eget ante nec, rhoncus efficitur leo. Fusce sed iaculis est. Duis non sodales mi.

Curabitur sit amet nibh eros. Vivamus nec ornare risus. Donec tempor eget dui a vestibulum. Vivamus finibus et dui eget porttitor. Nunc purus est, porttitor sit amet augue vel, vestibulum euismod magna. Morbi ultrices maximus augue, ut aliquet ipsum semper ac. Morbi nec libero eget dui luctus tempor sit amet a augue. Nullam bibendum ultrices nisi ac interdum.

Phasellus egestas interdum faucibus. Maecenas at venenatis erat, pellentesque porta mi. Etiam sed dapibus lectus. Aenean auctor arcu sit amet vehicula egestas. Donec feugiat diam eget faucibus semper. Quisque pharetra rhoncus dolor. Quisque ultrices eros at nisi bibendum, eget sodales libero finibus. Fusce vitae augue rutrum, elementum ipsum vitae, commodo nisl. Curabitur sed malesuada sem, ut sollicitudin eros. Curabitur cursus magna pretium vestibulum dictum. Nullam ut cursus metus, sed vulputate ex. Curabitur dui eros, euismod sit amet nunc scelerisque, semper convallis purus. In non nulla eget erat vehicula tincidunt. Nulla sit amet sem ac tortor imperdiet malesuada.

Morbi tristique augue leo, eu mollis nisl sollicitudin sed. Suspendisse quis orci aliquam, aliquam ante sit amet, efficitur mi. Mauris pretium luctus augue in semper. Pellentesque a ullamcorper magna, ac tristique sem. Vestibulum hendrerit, felis aliquet ultrices aliquet, ex eros dictum tellus, sed porta nibh eros vitae leo. Ut gravida augue et mattis tempor. Praesent lacinia bibendum eleifend. Nulla aliquet tempus magna. Ut elementum, lacus id placerat ornare, dui felis gravida ante, in porttitor lectus arcu eu ipsum. Vivamus cursus suscipit purus sed tristique. In ac quam sit amet sem mollis feugiat. Cras vestibulum dignissim lacus vitae iaculis. Interdum et malesuada fames ac ante ipsum primis in faucibus. Mauris tempus dolor dolor, ut aliquet leo tristique ac.

Suspendisse massa leo, posuere ac molestie non, dictum a diam. Praesent ante mauris, aliquam nec condimentum at, vestibulum eu mauris. Mauris at nisl at nunc dignissim dignissim eget eu nulla. Nunc in diam id nibh rutrum pretium vel eu dui. Nunc hendrerit purus non diam porttitor, id gravida nulla luctus. Mauris pharetra, ante sed iaculis consectetur, odio eros eleifend magna, eget volutpat est mauris efficitur urna. Duis maximus sollicitudin ultrices. Mauris dolor orci, consequat quis condimentum nec, ullamcorper at sapien. Curabitur non tortor nec orci fermentum condimentum. Fusce mauris arcu, commodo a nisi et, finibus commodo velit. Curabitur quis ex at augue accumsan vulputate venenatis quis tortor. Nam convallis, augue at condimentum ornare, lorem ipsum interdum sem, eu sodales tortor ipsum porttitor dolor. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque interdum luctus ex ac lobortis.

Aliquam vestibulum, risus quis pulvinar tempus, lectus arcu fringilla ex, sed dictum dui elit at sapien. Integer consectetur tellus ipsum, sagittis volutpat augue congue vitae. Ut ut risus ut urna congue ultricies vitae ut augue. Donec non orci ac magna viverra pulvinar id nec nisi. Etiam non elementum felis. Etiam faucibus neque tellus, sit amet egestas ligula egestas vel. Praesent sed mauris gravida, faucibus libero sed, euismod urna. Quisque posuere, est ac rhoncus tincidunt, felis quam mattis diam, ac lacinia ex urna vitae tellus. In euismod imperdiet mi finibus dignissim. Integer bibendum elit at nisi blandit lacinia. Nulla ultrices leo vitae arcu tincidunt, sit amet mattis tellus bibendum. Sed lorem mi, commodo eget dolor feugiat, sollicitudin consequat justo.

In eu lectus eleifend, tincidunt arcu nec, convallis tellus. Etiam eu elementum lectus, in cursus nibh. Fusce at leo elit. Mauris tempor felis vitae dignissim tincidunt. Nulla vitae nunc nisi. In ut felis bibendum, tincidunt felis quis, tincidunt velit. Cras id velit commodo, hendrerit libero ut, dictum tortor. Phasellus sed posuere nulla. Sed ultrices lobortis luctus. Donec sed mattis nibh. Vivamus id erat in urna euismod hendrerit eu sit amet ipsum. Aliquam id mi odio. Aliquam porttitor mollis sapien sed gravida. Vivamus at nisl a nunc elementum pellentesque.

Integer imperdiet, augue a iaculis hendrerit, ipsum elit ultricies massa, eget maximus sapien dolor eget ligula. Etiam tempor, nunc vel egestas rhoncus, lacus est posuere neque, ut laoreet lectus ipsum molestie purus. Aliquam venenatis nibh tellus, non egestas metus lacinia malesuada. Nunc ut maximus justo. Curabitur elementum viverra turpis sed pharetra. Donec non aliquam eros, tincidunt elementum nunc. Vestibulum fringilla faucibus sollicitudin. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Nunc sed sem a diam ultrices commodo. In porttitor, leo ut tempor eleifend, urna purus luctus lorem, in fermentum nisi turpis non dolor.

Maecenas tempus neque id auctor ultricies. Aenean suscipit ligula leo, vel suscipit felis facilisis viverra. Praesent sagittis faucibus lorem, et tempor nisl faucibus non. In porta imperdiet auctor. Aliquam quis suscipit lorem. Cras tristique ex sem, eu scelerisque erat facilisis ac. Nulla feugiat porta ex, in blandit lectus. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Cras ut ipsum id mi sodales facilisis. Nullam vel mi ut sem interdum ornare sit amet id neque. Vivamus in volutpat orci. Vivamus id urna augue. In tincidunt quis odio nec posuere. Vestibulum commodo sapien urna, nec dictum orci faucibus varius. Vivamus lectus dui, pellentesque sed lorem a, pellentesque hendrerit libero.

Nam orci leo, iaculis ut commodo ac, fermentum mollis ex. Fusce vel elit magna. Proin quis nisl dignissim, venenatis sem eget, elementum tellus. Fusce eget sagittis ante. Mauris rhoncus, elit ut mattis cursus, massa tellus feugiat sapien, nec molestie nulla turpis quis mi. Quisque facilisis, magna non porttitor congue, est tortor dictum odio, vel tincidunt magna nulla id metus. Proin euismod magna non aliquet tristique. Fusce nec egestas metus. Donec et euismod eros, id tincidunt metus. Nunc tincidunt eros et urna elementum mollis.

Praesent accumsan magna et diam lacinia viverra. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nam id diam sed enim rutrum blandit. Nullam facilisis placerat porta. Interdum et malesuada fames ac ante ipsum primis in faucibus. Morbi tempus egestas eros in pulvinar. Quisque eget dui at mauris bibendum egestas sed sit amet enim. Mauris ac auctor ipsum. Mauris at velit accumsan, fermentum nulla et, dapibus lectus. Praesent feugiat risus sit amet posuere ultricies. Mauris sollicitudin nibh non varius fermentum. Fusce metus nibh, tempus nec felis at, pharetra venenatis metus. Sed nec magna volutpat, hendrerit lectus eu, interdum sem. Etiam augue ipsum, mattis vitae sollicitudin id, viverra laoreet metus.

Vivamus bibendum semper leo et dapibus. Duis dictum in lectus ut interdum. Nullam sed porttitor purus, pharetra efficitur magna. Ut tempus nisi urna, malesuada posuere lacus condimentum consequat. Praesent accumsan egestas dolor, quis semper sapien iaculis et. Duis convallis nibh odio, et tincidunt eros pulvinar lobortis. Nam ex velit, maximus at urna luctus, sollicitudin viverra ex. Nam porttitor lectus id scelerisque egestas. Morbi elementum elit sed metus tempus, id consectetur risus molestie. Etiam felis nibh, volutpat faucibus feugiat volutpat, posuere a mauris.

Aliquam ut lectus pulvinar, porttitor sem a, auctor turpis. Nam tincidunt vel massa sed porta. Vestibulum erat odio, suscipit cursus ornare ac, pulvinar sit amet nunc. Nulla gravida enim erat, cursus efficitur eros volutpat at. Mauris dictum, diam ut tristique lobortis, velit ex pulvinar ipsum, quis auctor urna ante sed velit. Sed blandit semper felis, eget maximus sapien dictum at. Sed felis lectus, dignissim vitae libero a, pellentesque accumsan tortor. Aliquam condimentum fringilla mollis. Praesent non venenatis purus, eu efficitur arcu. Praesent pretium egestas sem eu elementum. Etiam non placerat ante. Donec ac enim auctor, porttitor arcu non, sagittis velit. Aenean eu ante et ante auctor sagittis. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Donec feugiat enim ex, ultricies luctus metus malesuada ac.

Fusce ut commodo nunc. Ut posuere pulvinar egestas. Nulla facilisi. Mauris sollicitudin tincidunt erat, a convallis urna aliquam eu. Mauris vel odio ac urna venenatis auctor. Maecenas sed elit luctus, finibus augue in, convallis diam. Integer ullamcorper blandit justo at euismod. Nullam tortor ipsum, luctus et mi in, viverra auctor lorem. Suspendisse dignissim interdum rutrum. Integer tempus felis sed quam lobortis, eu convallis lorem iaculis. Ut ut pharetra elit, eu venenatis risus. Integer et laoreet orci. Nulla facilisi.

Suspendisse ac neque non leo fringilla iaculis. Donec sit amet metus malesuada, ultrices est id, accumsan ligula. Etiam euismod sodales volutpat. Nulla facilisi. Fusce dapibus vulputate nisl vel elementum. Integer sagittis est in tempor condimentum. Morbi auctor libero ex, id rutrum mi pharetra at. Quisque ac mauris accumsan, faucibus mi vel, tempor lectus. Sed faucibus, tellus ac fermentum sollicitudin, massa risus bibendum lectus, in tempus nisi sem et magna. Phasellus eu pellentesque nibh. Suspendisse ac odio at nibh vestibulum gravida. Etiam lacus dui, tincidunt in arcu eget, malesuada fermentum erat.

Praesent eget accumsan mi. Nam pretium tellus arcu, non mattis tortor dignissim et. Donec tempor ornare nisl. Donec euismod dui in libero pharetra, sit amet porttitor orci scelerisque. Suspendisse sed sollicitudin tortor. Vivamus cursus, elit in egestas fermentum, velit quam suscipit nisi, vel tincidunt magna augue non nunc. Nunc posuere nulla blandit ante eleifend maximus. Mauris augue libero, consequat nec consequat non, interdum quis orci. Vestibulum venenatis viverra sapien at lacinia. Cras vitae finibus nulla. Suspendisse sagittis lacus eget tristique pulvinar. Sed id eros accumsan, vulputate tellus vel, interdum odio. Duis finibus neque et tempus vehicula. Aliquam feugiat sapien turpis, vel cursus velit eleifend facilisis. Maecenas eget ante id justo posuere mattis.

Morbi id rhoncus erat. Curabitur non dignissim risus, non ornare arcu. Suspendisse id leo non risus dictum mollis. Quisque sed diam sem. Pellentesque lacinia dictum tellus et ullamcorper. Curabitur sit amet ipsum a purus egestas eleifend sit amet ac arcu. Maecenas massa arcu, iaculis sed enim non, mattis tincidunt odio. Integer sagittis nibh vitae dignissim euismod. Mauris facilisis venenatis scelerisque. Proin luctus augue in ligula varius, sit amet gravida eros pulvinar. Nullam orci dui, varius et nunc non, venenatis faucibus elit. Etiam sed enim ultricies, auctor ligula ac, vulputate dolor. Aliquam non suscipit enim. Sed mollis sollicitudin lacinia.

Fusce dictum, lorem in gravida tempus, lorem enim maximus metus, in faucibus odio nunc a arcu. Vestibulum ac quam odio. Nulla sit amet leo augue. Quisque fermentum magna vestibulum pellentesque ornare. Quisque euismod sem in metus pulvinar, nec sodales neque ornare. Sed sodales at dui lobortis consectetur. In suscipit dapibus odio, ut cursus magna viverra id. Vivamus in diam massa. Curabitur id consequat nisi. Phasellus vitae diam tortor. Suspendisse potenti. Cras in eleifend eros.

Duis et dapibus tortor. Ut facilisis scelerisque nibh ut tincidunt. Fusce ipsum mauris, convallis nec arcu eget, maximus bibendum ex. Sed in eros laoreet, vulputate lacus et, vehicula libero. Interdum et malesuada fames ac ante ipsum primis in faucibus. Curabitur lobortis, mi vitae suscipit suscipit, erat turpis sagittis purus, in commodo odio ex non nunc. Quisque a fringilla lacus. Aliquam tincidunt magna sed ultrices ullamcorper. Curabitur venenatis feugiat massa, nec pulvinar velit aliquet at. Proin in nulla lectus. Nunc non cursus elit, et maximus erat.

Etiam at varius enim. Pellentesque nisl metus, tristique et vulputate vitae, fringilla nec velit. Praesent egestas justo et dolor egestas varius. Sed rutrum vel leo semper scelerisque. Curabitur venenatis libero non lacus egestas, nec lacinia odio laoreet. Nunc commodo dui in urna pellentesque ullamcorper in vitae augue. Nullam ac nulla sit amet neque semper imperdiet. Aenean odio ipsum, convallis et venenatis nec, eleifend in dui. Sed ut ligula a magna aliquet vehicula at sed sem. Vestibulum sed tincidunt nibh. Nunc at lectus id eros vehicula sollicitudin. Vestibulum vehicula eros non volutpat pellentesque. Nulla consectetur laoreet gravida. Suspendisse potenti. Quisque egestas eros eu sagittis ullamcorper. Donec et nisl eget tortor mattis pellentesque.

Sed finibus commodo congue. Vivamus rhoncus, mauris vel hendrerit ullamcorper, enim justo tristique odio, in varius quam felis sed enim. Curabitur lobortis ultrices nulla, eu congue nulla interdum eu. Ut urna turpis, aliquam tempus justo ut, semper dapibus orci. Cras placerat sem ut diam pulvinar, at venenatis ipsum rutrum. Donec consectetur imperdiet leo. Integer et tellus in mauris ornare sagittis vel sit amet ligula. Mauris aliquet ipsum consectetur tellus posuere hendrerit. Duis gravida vehicula dignissim. Fusce gravida bibendum rutrum. Sed et molestie lorem, vitae molestie ex. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Quisque tempus mauris sed sapien ultricies, vehicula molestie nisl mattis. Phasellus ac efficitur turpis.

Interdum et malesuada fames ac ante ipsum primis in faucibus. Donec rhoncus vel nulla in commodo. Suspendisse sed viverra libero. Etiam elementum tempus purus ut malesuada. Curabitur eu egestas risus. Donec id lacus nec ligula fermentum commodo. Morbi convallis varius arcu. Praesent placerat mi in felis tincidunt, vel accumsan est feugiat. In elementum interdum neque, ut luctus felis lobortis ac. Nunc gravida metus viverra nulla eleifend hendrerit. Quisque scelerisque quam volutpat nibh aliquam, eu semper lorem consequat. Sed tincidunt eget lectus et facilisis. Sed augue leo, semper in nibh nec, porttitor tempor felis. Nulla elementum blandit fermentum. Integer ut pulvinar magna, at consectetur lectus.

Aenean ac fermentum dolor. Cras a mi et massa congue condimentum. Maecenas laoreet id nunc vel malesuada. Donec at magna vitae dolor congue porta non vel massa. Ut finibus diam nec pretium finibus. Aenean fringilla, est ac elementum pellentesque, magna ligula finibus urna, ut aliquam dui velit a ex. Curabitur et semper lorem. Ut venenatis ultrices urna, quis pretium sem facilisis ut.

Quisque eget velit nunc. Duis nec lorem vehicula, ullamcorper felis id, ornare massa. Aliquam dictum venenatis neque, nec ornare mi. Quisque aliquet aliquam commodo. Mauris justo est, finibus nec massa quis, iaculis interdum erat. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Sed non scelerisque eros. Cras id lorem tortor. Vestibulum nisl eros, faucibus non orci gravida, vestibulum molestie ipsum. Aliquam lobortis dignissim sapien nec molestie. Cras scelerisque lacus non odio pulvinar, vitae cursus erat laoreet.

Morbi luctus leo diam, eu lacinia odio finibus sit amet. Mauris nec arcu purus. Phasellus rutrum tempus turpis, a aliquet metus sollicitudin at. Phasellus vitae lectus ut risus dictum faucibus. Proin vel ultrices enim. Donec cursus imperdiet nunc, sit amet porttitor mauris. Phasellus eget malesuada purus. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Quisque semper eleifend ligula id tincidunt. Proin quis dui ante. Integer finibus sapien eu lectus tincidunt auctor. Phasellus consectetur sem felis, a suscipit diam condimentum lacinia. Nulla viverra ex nec molestie eleifend. Suspendisse dui sem, imperdiet non consequat at, vehicula sit amet felis.

Sed cursus congue leo, eu congue risus hendrerit vitae. Vestibulum sem lorem, vehicula eget velit a, maximus pretium tortor. Sed eu varius sapien. Integer eros ligula, volutpat eget enim vel, condimentum ullamcorper velit. Etiam facilisis pellentesque turpis, vitae ultrices sapien auctor mollis. Nullam malesuada enim ac urna convallis, eu cursus augue tempus. Vestibulum arcu velit, blandit vel molestie vel, sodales in nunc. Morbi pharetra pharetra nisl non volutpat. Suspendisse potenti. Suspendisse potenti. Ut interdum sollicitudin lacinia. Praesent congue, nulla a vehicula rhoncus, eros neque suscipit neque, ut aliquet sem lectus eu erat. Suspendisse lectus metus, efficitur et purus ac, vestibulum commodo augue. Proin luctus eleifend iaculis.

Sed faucibus rhoncus efficitur. Donec egestas id risus vel congue. Vivamus commodo egestas vestibulum. Praesent quis tortor et tellus faucibus ornare sit amet non ligula. Phasellus aliquet vestibulum porta. Duis quis purus venenatis, sodales enim sit amet, pellentesque lacus. Pellentesque a scelerisque nibh, eu suscipit nunc. Nunc gravida in lacus vel maximus. Vivamus id diam egestas, sodales enim ut, dictum arcu.

Vestibulum id finibus sapien. Cras a venenatis risus, ut vehicula ante. Proin accumsan rhoncus quam ac elementum. Donec dapibus maximus lacus rhoncus dignissim. Phasellus non aliquam nunc, ac rhoncus urna. Mauris eros purus, gravida mattis porta at, vulputate vitae ligula. In pretium blandit diam a volutpat. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Donec at ipsum neque. Fusce sit amet odio euismod, posuere risus id, cursus velit. Aenean a varius purus. Suspendisse dignissim, metus eget elementum dignissim, dui elit bibendum orci, a pretium nisl magna vel tellus.

Donec pulvinar blandit malesuada. Nam felis orci, pulvinar vitae enim quis, molestie tempor nisi. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut consectetur eu orci ut porttitor. Maecenas in ligula ex. Mauris faucibus tortor id urna fringilla luctus. Donec feugiat eros ac aliquet facilisis. Nullam a mattis est. Proin ac volutpat magna, ac facilisis diam. Sed vitae risus sit amet lectus egestas molestie sit amet sit amet tortor. Donec eu turpis ipsum. Vestibulum euismod nisl vel neque sodales, sed posuere diam imperdiet.

Fusce semper a diam eget condimentum. Fusce id placerat metus, at sollicitudin ipsum. Cras ac ultrices est. Sed nibh diam, vulputate quis lectus vel, aliquet efficitur odio. Fusce massa mauris, suscipit a facilisis sit amet, lobortis sit amet erat. Fusce maximus eu diam vitae pellentesque. Sed malesuada turpis nec erat ullamcorper luctus. Aliquam accumsan tristique auctor. Aenean sed risus faucibus magna sodales efficitur.

Aenean risus felis, pretium eget diam at, fermentum elementum lorem. Sed a eros vel mauris maximus tristique sollicitudin vel erat. Aliquam auctor hendrerit nisl eu commodo. Donec facilisis tortor quis metus porttitor, sed dignissim magna molestie. Fusce dapibus aliquam ante, ultrices fermentum leo commodo non. Sed nulla nibh, aliquam quis sem in, condimentum sagittis mauris. Quisque sit amet urna vel nisi varius egestas. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Donec ut augue nisi. Duis porttitor lacinia turpis, non porttitor libero lobortis nec.

Donec in consequat metus. In hendrerit mollis odio a iaculis. Aliquam non purus nec nulla accumsan eleifend. In eu rhoncus nisl. Nam sed lobortis sapien. In in magna a lectus molestie pharetra. Sed vitae semper purus. Aliquam eleifend nisl ac erat gravida elementum. Praesent dignissim pulvinar pulvinar. Mauris velit lacus, aliquam id facilisis vitae, dapibus sit amet nisi.

Vivamus quis neque sollicitudin, aliquam justo ut, porttitor felis. Mauris tristique dui id urna bibendum, in elementum enim eleifend. Nullam sit amet venenatis lorem. Nam quis luctus erat, sed posuere dui. Nulla a elit ultricies, consequat ligula vitae, gravida lorem. Duis posuere consectetur turpis vel pretium. Nulla non consequat augue.

Nulla vitae semper diam, id auctor dui. Phasellus velit risus, suscipit ac metus sed, mattis tempus eros. Nunc non augue consequat, sodales mauris non, vehicula sapien. Aliquam ornare, libero quis eleifend molestie, diam velit viverra nibh, a placerat tortor lacus vestibulum metus. Nullam sit amet velit non quam fermentum tincidunt et at nulla. Mauris id lacus commodo, tincidunt ipsum sit amet, molestie dolor. Curabitur facilisis interdum neque, at viverra est aliquet a. Pellentesque vitae dui sed est vulputate ornare a tristique neque. Duis fermentum ultrices arcu in convallis. Vivamus vitae leo metus. In luctus tincidunt lacus non pharetra.

Donec blandit leo vel eros facilisis, eget lacinia nibh tincidunt. Cras nisi magna, ultricies sit amet purus in, efficitur aliquet tortor. Vivamus convallis tellus leo, blandit iaculis orci blandit eu. Fusce tristique arcu risus, consectetur feugiat mi aliquet id. Sed facilisis malesuada lectus at ornare. Duis ut quam quis lectus ornare cursus. Cras eget turpis porta justo interdum ultrices. Sed pulvinar, enim et blandit porta, felis ipsum scelerisque lacus, eget vulputate tortor quam eget massa. Suspendisse sed feugiat ante. Praesent cursus odio quis augue vestibulum, vel pellentesque massa suscipit.

Donec ut suscipit lacus. Nullam ut tortor luctus urna imperdiet varius sed ut est. Curabitur at neque malesuada, suscipit urna sed, pretium est. Proin ut urna blandit, iaculis risus ultrices, varius quam. Integer consequat nisi a dictum mollis. Aliquam posuere lectus in arcu euismod interdum ut at dolor. Sed felis est, consequat non ligula sit amet, mollis consectetur tellus. Nulla posuere mauris id leo egestas sagittis. Donec in fringilla ante. Nulla dictum, sem vitae auctor congue, nulla velit pellentesque nisl, ac bibendum sapien velit eu risus. Vivamus rhoncus maximus erat, ultricies lobortis tellus venenatis sit amet.

Sed facilisis pellentesque nisi, in vehicula tortor. Suspendisse convallis libero vel eros convallis ultricies. Phasellus tristique eros placerat dui egestas congue non vitae leo. Sed cursus, ligula aliquam consectetur interdum, ex dolor elementum felis, in mattis metus risus non sapien. Phasellus viverra sapien felis, vitae fermentum massa suscipit ut. Nunc posuere dignissim est a blandit. Nunc nisi ex, feugiat placerat dolor a, euismod ornare nisl. Aenean vel tellus et elit blandit dapibus non sed risus. Ut ut varius ligula. Curabitur egestas quis est ut finibus. Donec rutrum eget justo quis venenatis. Sed nec nisl maximus est eleifend imperdiet at id orci. Proin dignissim erat non dolor iaculis malesuada. Duis volutpat vel nunc a vehicula. Maecenas at lorem pellentesque, hendrerit augue ultrices, eleifend lorem. Maecenas lobortis quam consectetur porttitor varius.

Nullam eros turpis, aliquet dignissim tellus in, imperdiet interdum dui. Mauris in purus ultricies, fermentum urna eget, pulvinar leo. Curabitur turpis orci, pellentesque a aliquet eu, posuere eget quam. Sed eget nulla felis. Nam placerat risus ut lacus ultricies aliquet. Donec malesuada risus elit, sit amet bibendum augue aliquet porttitor. Nam pulvinar mauris ac est hendrerit, ac suscipit ante aliquet. Cras eu ligula eros. Aliquam dolor ipsum, cursus eu luctus sed, molestie eu quam. Aliquam ornare accumsan felis sit amet luctus. Nullam finibus justo a rhoncus commodo. Nunc ornare non libero ut condimentum. Duis pellentesque lorem ut arcu pellentesque, in malesuada neque feugiat. Ut ullamcorper vel dolor et rutrum. In hendrerit eu tellus vel aliquet. Integer dictum enim sit amet ex feugiat ullamcorper at sit amet sapien.

Etiam odio nulla, ultrices ut malesuada sit amet, cursus et lacus. Proin rutrum maximus arcu. Donec non leo quis ipsum ullamcorper blandit. Curabitur aliquam massa lectus, sodales viverra nisl blandit a. Nullam sodales ut nulla sit amet pulvinar. Morbi quam purus, bibendum tincidunt sem non, porttitor congue purus. Maecenas commodo lectus et lectus volutpat, a ullamcorper sapien gravida. Duis in ligula nec odio commodo laoreet lacinia quis tellus. Nullam augue orci, efficitur nec ornare sed, feugiat id libero. Sed nulla magna, facilisis quis ex vel, rutrum porttitor enim. Pellentesque varius nisl in orci pellentesque cursus. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Etiam ligula libero, lobortis non diam ut, imperdiet fringilla est. Aliquam dapibus felis eget tristique luctus. Duis aliquet dolor in ex pharetra, eget placerat quam dapibus. Curabitur sed tincidunt risus, vitae scelerisque augue.

Praesent iaculis nibh eros, ut maximus dui pulvinar facilisis. Integer ac sollicitudin ante, lacinia tincidunt turpis. Integer faucibus libero tortor, a interdum urna semper nec. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Vivamus nec luctus lacus. Etiam nec pretium ipsum. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. In eget nisi elementum, facilisis turpis ac, pellentesque odio. Nulla volutpat ipsum ut facilisis feugiat. Integer mauris tellus, maximus quis metus in, efficitur iaculis turpis. Phasellus congue risus ut dapibus porttitor.

Nunc nunc nulla, rhoncus a pellentesque ac, facilisis ac dui. Donec iaculis, mauris non pretium aliquam, felis lacus sagittis dolor, vitae fringilla nisl ante eu velit. Integer aliquet ultrices blandit. Ut auctor interdum libero, eu bibendum magna. Praesent consequat tristique bibendum. Aenean porta massa lorem, at rhoncus neque interdum quis. Donec pharetra massa non arcu elementum, et rutrum metus gravida. Suspendisse id tortor et turpis facilisis pharetra. Suspendisse potenti. Donec ornare cursus fermentum.

Vivamus id cursus tellus. Integer quis egestas dui. Aliquam pharetra ac sapien ut condimentum. Maecenas lobortis quam mauris, in eleifend felis commodo molestie. Sed quis tortor est. Vestibulum pretium cursus urna, sit amet finibus orci condimentum sed. Nam metus eros, pellentesque eget nibh ultrices, tempor faucibus enim. Duis et feugiat tortor. Proin viverra urna ut risus consectetur convallis.

Nam mattis, ex at mattis congue, odio felis vestibulum tellus, at commodo odio orci ut lectus. Nullam enim eros, feugiat sed turpis quis, vestibulum luctus nunc. Cras euismod lobortis efficitur. Mauris nec tortor leo. Fusce eu nisl ut arcu imperdiet pretium. Vivamus ac elit maximus, tempor est ut, luctus nulla. Proin elementum, lacus vel dignissim tincidunt, dui libero vehicula neque, ut malesuada ex mauris sed dolor. Sed eget felis elit. Vestibulum ornare sed tortor sed auctor. Nam non massa laoreet, faucibus nisl et, commodo dolor. Nulla pharetra elit urna, eu auctor enim lacinia vel. In hac habitasse platea dictumst. Vestibulum tortor lacus, placerat ut orci vel, accumsan sodales nunc. Mauris rutrum finibus viverra. Curabitur maximus enim dapibus augue iaculis, eu vestibulum risus ultrices. Vivamus viverra gravida ex quis ultricies.

Maecenas viverra tortor quis pellentesque lacinia. Donec vestibulum vestibulum consectetur. Morbi fermentum, justo et varius varius, neque est varius elit, ut eleifend erat tortor a diam. Nulla sit amet sodales ligula. Donec purus erat, ultrices at arcu non, tempus hendrerit sapien. Sed id varius erat, sit amet tincidunt felis. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla nec mauris purus. Donec non justo sed leo suscipit faucibus. Phasellus gravida, diam non finibus cursus, eros nisl faucibus augue, vitae posuere erat quam et lectus. Sed rutrum sit amet nunc vel consequat. Etiam eu tempus nisi. Vivamus id molestie lacus. Nunc id tellus volutpat, posuere metus nec, consequat tortor.

Nulla elementum finibus ultricies. Sed vel risus in leo faucibus suscipit vitae quis purus. Etiam ut nisl nulla. Nulla pulvinar nibh id neque rhoncus, a tincidunt orci porttitor. Sed vel malesuada eros. Nulla posuere, purus a tincidunt blandit, orci ipsum tincidunt quam, in viverra felis dui vel nisl. Praesent dapibus tellus orci, ac consequat justo commodo eget. Curabitur tincidunt quis nibh nec dignissim. Duis suscipit dignissim orci, et rhoncus purus imperdiet non. Phasellus placerat neque eget dolor placerat, vel ullamcorper nisl luctus. Fusce placerat gravida est, eget consequat nunc egestas eu. Vivamus tempus non augue in semper. Proin sit amet arcu tincidunt, lobortis dolor ac, facilisis libero. Vivamus rutrum, quam a sodales facilisis, risus sapien lacinia libero, id consequat massa nisl vel nulla. Mauris tincidunt dolor quis lobortis convallis. Suspendisse semper nunc tortor, at convallis nunc congue vel.

Aliquam dapibus neque tortor, et dignissim neque auctor vel. Donec in ex cursus, eleifend dui eu, elementum sapien. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Nullam vitae condimentum augue, id feugiat risus. Suspendisse viverra sodales elementum. Fusce quis ultrices ante. Aliquam mauris sem, finibus ut erat quis, interdum posuere libero.

Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Praesent dignissim quam vel aliquam imperdiet. Fusce varius libero at orci tincidunt sollicitudin. Proin in augue nec sapien mattis pulvinar. Ut iaculis nunc sit amet orci lobortis, a lacinia odio condimentum. Fusce id ullamcorper magna. Mauris convallis volutpat odio, quis suscipit est auctor eu. Interdum et malesuada fames ac ante ipsum primis in faucibus. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Phasellus tempor, sem venenatis blandit condimentum, mauris urna interdum ante, iaculis finibus neque purus in ipsum. Morbi ac efficitur sapien.

Sed libero orci, dignissim et ipsum vitae, iaculis ornare nulla. Phasellus mi dolor, accumsan et lacinia sit amet, aliquam lobortis erat. Vivamus ornare venenatis odio sit amet condimentum. Praesent laoreet consectetur eros id venenatis. Pellentesque nunc velit, dignissim imperdiet dui sit amet, pellentesque interdum sapien. Morbi congue eget nisi at faucibus. Suspendisse vel imperdiet tortor, at pretium orci. Donec convallis eleifend metus, sit amet hendrerit ex rutrum id. Integer quis sodales massa. Etiam ac lobortis nibh. Vestibulum malesuada at velit eu auctor. Aliquam lorem massa, commodo sit amet erat non, consectetur lobortis nibh. Sed consequat vel risus nec ornare. Ut ut pharetra nisi. Nullam viverra, odio a sagittis bibendum, nulla arcu vestibulum dui, in mollis elit lectus id diam.

Praesent pharetra gravida massa in viverra. Duis ultricies molestie arcu id iaculis. Proin tristique dolor eget ligula euismod, id tincidunt leo blandit. Sed pellentesque sit amet justo ac feugiat. Donec eu pretium felis. Curabitur augue risus, finibus in neque et, dapibus porttitor quam. Praesent nibh ante, sollicitudin vitae enim vitae, convallis maximus elit. Aliquam orci risus, imperdiet sed mollis ut, efficitur vel turpis. Sed bibendum enim dui, ut tempor diam luctus eget.

Nulla eu eros sed nisl tincidunt lacinia eget a quam. Maecenas finibus consectetur arcu sit amet consectetur. Vestibulum suscipit mi sed erat fringilla hendrerit. Sed turpis nunc, posuere quis facilisis vitae, viverra vel dolor. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Morbi id finibus velit. Maecenas sed justo eget lorem tincidunt facilisis at nec nisl. Morbi blandit suscipit massa at ultricies. Cras ut hendrerit tortor, quis consequat ex. Phasellus finibus nisi ut dolor hendrerit porta. Cras ac metus id mauris mattis fermentum sed a nisl. Aliquam facilisis elit vitae purus blandit suscipit non in odio. Aliquam sit amet fringilla lectus, a sollicitudin lacus. Aenean vel dapibus nulla, vitae congue purus.

Nullam tincidunt ligula in erat viverra, et suscipit quam lobortis. Suspendisse imperdiet egestas sapien eget euismod. Nullam at diam non ex scelerisque aliquam. Maecenas ultricies a ipsum vel efficitur. Phasellus pharetra odio ut nisl viverra vestibulum. Pellentesque sed ornare enim. Morbi eget venenatis nisi, ut fermentum felis. Donec tempus nunc feugiat euismod vulputate. Praesent magna odio, rhoncus nec orci at, imperdiet elementum urna. Integer convallis, lectus non tincidunt aliquet, leo sapien porttitor tortor, in feugiat ligula arcu a dui.

Proin condimentum tempor mollis. Sed risus nulla, varius ut arcu vel, auctor semper diam. Aenean tortor lacus, feugiat in hendrerit vitae, convallis ac felis. Fusce suscipit ac purus ut elementum. Maecenas ut rutrum orci. Nullam purus urna, mattis nec mi et, maximus posuere diam. In a suscipit tortor. Praesent sollicitudin sit amet orci at pulvinar. Aliquam pulvinar odio purus, eget accumsan ligula placerat aliquam. Ut imperdiet pharetra mi id elementum. Vestibulum porttitor ante metus, eget dapibus mauris lacinia a. Morbi sed diam id felis maximus porta in ac ipsum. Donec ligula urna, sollicitudin nec lacinia at, mollis eget nisi.

Curabitur sed mattis lorem, in sodales libero. Aliquam vitae venenatis elit, eget dictum justo. Nam mi elit, iaculis at varius sit amet, tincidunt quis elit. Pellentesque vulputate tortor mi, non consectetur ante mollis vel. Pellentesque rhoncus, nisl ut pellentesque imperdiet, nisi lectus fringilla arcu, in ullamcorper leo diam at sem. Curabitur vel nibh nec nisi gravida mollis. Vivamus vitae venenatis elit, eu facilisis nulla. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae;

Nunc sit amet vestibulum ante, sit amet eleifend libero. Vestibulum eget nisi rutrum, varius risus id, luctus justo. Aliquam ac ultricies arcu. Vivamus a leo odio. Quisque sed condimentum lectus. Vivamus ac arcu id dui blandit mollis ut nec enim. Phasellus interdum eu dolor sit amet posuere. Proin sollicitudin consectetur tempor.

Curabitur facilisis felis ac sem accumsan hendrerit. Etiam ac lorem rhoncus nibh bibendum finibus ac a libero. Vivamus eros ex, posuere vel porttitor a, aliquam at mauris. Donec eu tempus lorem, sit amet dictum leo. Proin et sapien et turpis tempus convallis sit amet non neque. Nunc eget nisl magna. Morbi non rutrum felis. Donec nec sollicitudin lorem, vitae venenatis felis. Aliquam porta at tortor quis tincidunt.

Suspendisse malesuada augue eu augue varius, et euismod purus posuere. Nulla mollis vestibulum tincidunt. Praesent pharetra non ante dignissim varius. Mauris ullamcorper euismod turpis quis volutpat. Ut nec fringilla sapien. Pellentesque convallis ligula quis facilisis lacinia. Proin lacinia gravida ante quis vehicula. Nullam feugiat eleifend diam pulvinar sagittis. Praesent lobortis, sem maximus volutpat interdum, diam ex porta nisl, elementum pretium erat sapien eget lacus. Cras et dolor sit amet massa volutpat ullamcorper a in lectus. Ut ac dolor nec arcu posuere dignissim auctor feugiat quam. Nunc suscipit orci pellentesque erat imperdiet ullamcorper. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Aenean elit magna, laoreet nec viverra a, mattis eget enim. Pellentesque porttitor ex eu vulputate blandit. Etiam tortor est, varius cursus mauris at, volutpat bibendum enim.

Donec a diam nisi. Duis lobortis libero id nisi congue rutrum. Aenean interdum luctus tortor et dictum. Curabitur laoreet libero ut orci rhoncus sollicitudin. Morbi eleifend augue sit amet facilisis tempus. Aliquam sapien justo, feugiat et porttitor sed, consectetur nec neque. Etiam faucibus dapibus aliquet. Fusce gravida lectus eu neque tristique, bibendum scelerisque sapien varius. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Cras sed quam nec magna dignissim porta et in lacus.

Cras vulputate tellus et mi elementum ullamcorper. Morbi id aliquam odio. Mauris id augue non nunc condimentum mattis et a dui. Proin sed pretium sapien, eu eleifend leo. Morbi tristique aliquet metus, quis ultrices ante aliquam non. Vivamus cursus diam nec mi ornare consequat. Quisque eget consequat neque, nec hendrerit nulla. Sed varius gravida ipsum. Maecenas feugiat nec nunc vitae ultricies. Vivamus interdum augue vel varius commodo. Etiam sagittis neque quam, ac lobortis ipsum mollis vitae. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Quisque scelerisque accumsan urna, placerat suscipit massa suscipit a.

Quisque ultrices leo vitae urna gravida, eu aliquam leo ullamcorper. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum sodales scelerisque consequat. Aenean ac nibh libero. Etiam vulputate lectus tristique imperdiet efficitur. Fusce tempus vitae dolor eget interdum. Aenean euismod imperdiet commodo. Sed ante nisi, scelerisque ut porttitor quis, consectetur sit amet diam. Pellentesque at dignissim dui. Vivamus varius, tellus sed maximus efficitur, metus ante volutpat tellus, ac ultrices orci nulla at neque. Quisque semper ornare ex. Pellentesque dictum a lacus eu mattis. Duis pellentesque malesuada mollis. In mattis sapien quis odio gravida pulvinar.

Morbi in pretium ipsum. Etiam bibendum maximus augue, id posuere dui faucibus a. Etiam pellentesque vulputate accumsan. Aenean at nisl in diam faucibus mattis. Aenean tellus libero, hendrerit quis nisl id, cursus volutpat lorem. Vivamus venenatis posuere rutrum. Ut laoreet pretium lectus a ullamcorper. Proin et metus ut ex molestie rhoncus eget eu risus. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus.

Donec sollicitudin ultricies velit, eget finibus metus egestas non. Quisque rhoncus, mi sed consequat posuere, ipsum nunc euismod sem, id placerat lacus mi fermentum sem. Ut efficitur, est sit amet placerat dapibus, tellus arcu finibus nunc, vel placerat risus eros a magna. Vivamus volutpat nulla enim, ut vehicula diam dignissim vel. Curabitur mollis erat at libero venenatis blandit. Nam dictum arcu vel odio fringilla, ut rhoncus ex interdum. Vivamus pellentesque facilisis lectus, eu consectetur nunc tempor ac. Donec pellentesque orci ut nunc finibus, sit amet facilisis eros interdum. Vestibulum euismod lorem in eros maximus fringilla. Maecenas vel nisi eleifend, faucibus tortor non, sollicitudin massa.

Quisque elit ante, eleifend quis ultricies eu, aliquam id ante. Vestibulum eu enim at nisl tincidunt imperdiet a vitae justo. Curabitur a purus quis felis volutpat tempus. Nunc a interdum mi. Duis id sem pretium, auctor orci at, semper arcu. Donec tempus lobortis est eget fermentum. Donec ornare faucibus tellus, a ornare ante tempus sit amet. Quisque ultricies vestibulum mi sed fermentum. Fusce placerat sagittis metus, et sagittis mauris. Sed non dignissim mi, a faucibus mauris. Nullam et rutrum mauris, vitae scelerisque orci. Maecenas ullamcorper risus vel arcu elementum, vitae malesuada augue auctor. Phasellus porta bibendum turpis, a gravida elit efficitur a. Duis ut metus lacus. Duis est libero, ultricies sed lectus at, viverra scelerisque odio. Donec congue, urna id viverra feugiat, lectus augue pretium orci, vel consequat lorem tellus iaculis mauris.

Etiam massa leo, congue eu dui et, placerat vestibulum mi. Proin pharetra finibus dictum. Curabitur sit amet eros sed quam consectetur ornare eu sodales magna. Mauris consequat odio nec finibus tempus. Maecenas et purus massa. Ut nec justo diam. Praesent eros felis, tincidunt in lectus ut, viverra interdum nisl.

Cras pretium pharetra facilisis. Curabitur consequat a mauris non lacinia. Integer molestie quis turpis quis viverra. Sed vehicula consequat finibus. Morbi bibendum vestibulum nisi, nec tincidunt sem molestie at. Curabitur auctor ligula ut lacus efficitur, et vehicula orci auctor. Sed semper lorem ac justo eleifend pellentesque. Pellentesque eu turpis cursus, tincidunt metus id, sodales erat.

Mauris quis felis sodales, maximus velit eu, maximus neque. Nulla sit amet euismod ante. Vestibulum lorem nunc, lobortis a viverra et, sollicitudin semper neque. Proin urna lectus, pellentesque et sapien eu, maximus accumsan tortor. Etiam tempor sed nunc ut gravida. Curabitur nisi purus, interdum vitae eros nec, condimentum molestie libero. Duis finibus vel ipsum non dapibus. Morbi euismod pharetra sollicitudin.

Vestibulum non risus diam. Aliquam consequat dapibus faucibus. Cras consectetur rutrum massa vitae gravida. Suspendisse porttitor nunc risus, nec tincidunt libero bibendum tincidunt. Maecenas enim tellus, scelerisque eu blandit id, egestas sed orci. Suspendisse rhoncus ligula ac ante bibendum, ut imperdiet ligula tincidunt. Morbi mattis orci consectetur dui placerat consectetur. Proin odio nunc, laoreet lobortis facilisis ac, scelerisque ut mauris. Integer justo tortor, dignissim vitae leo eu, pellentesque eleifend justo. Nulla faucibus lorem sed porta aliquam.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus ultricies dapibus mauris, scelerisque pretium metus hendrerit eu. Aenean tristique in risus eget rutrum. Proin porttitor dolor odio, quis ornare leo rutrum vel. Fusce risus orci, hendrerit ut lorem eget, viverra molestie elit. Phasellus suscipit a urna sed elementum. Nullam a ultricies purus.

Fusce tristique tristique lacus, quis luctus arcu viverra non. Integer nunc justo, rutrum in velit non, fermentum lobortis nibh. Morbi suscipit vehicula lectus, ut tempor ante. Etiam at placerat purus. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. In at semper enim. Pellentesque ac tortor vitae velit pulvinar elementum et eu turpis. Quisque fermentum, erat non laoreet blandit, eros turpis tempus justo, ut rhoncus mi lorem venenatis tellus. Suspendisse dictum, magna in convallis ornare, sapien nisi malesuada lacus, at gravida nisi velit quis orci. Suspendisse mi nisi, tempus ut dapibus ac, placerat vel dolor. Maecenas quis purus ac ante bibendum fermentum. Morbi mauris quam, bibendum sed gravida eget, rutrum id ligula. Praesent auctor auctor nunc, nec semper urna tempor at. Proin pretium velit efficitur pretium accumsan.

Integer mattis eget erat a viverra. Vivamus hendrerit commodo dui, in sagittis risus ornare in. Suspendisse metus dui, aliquam a vestibulum vel, hendrerit sed arcu. Praesent pellentesque luctus efficitur. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Cras dictum sit amet purus in consequat. In venenatis fringilla maximus. Etiam eget lectus massa. Maecenas quam velit, euismod sed tristique non, iaculis non eros. Duis enim turpis, interdum vel placerat non, viverra vel turpis. Mauris lacus arcu, hendrerit id lobortis quis, consectetur eget lacus. Suspendisse potenti. Nulla venenatis suscipit euismod. Sed venenatis, leo eu mollis imperdiet, felis nulla euismod lorem, eget lobortis erat nisi quis lorem.

Aenean tempus molestie placerat. Mauris non ante lectus. In hac habitasse platea dictumst. Pellentesque sem lorem, commodo sit amet tortor nec, bibendum pharetra tellus. Sed turpis elit, tempus facilisis porta vehicula, aliquet ac velit. Suspendisse erat nunc, imperdiet id ligula sed, cursus pulvinar elit. Donec id blandit arcu, porta blandit lacus. Nam sagittis scelerisque sodales. Praesent dictum, tellus id ultricies suscipit, urna arcu lobortis mauris, a interdum eros ex nec nisl. Suspendisse maximus vestibulum ornare. Mauris eu dignissim dui. Vivamus eget risus ligula. Etiam ac ipsum iaculis, placerat nisl ut, rutrum lectus.

Suspendisse id gravida nisi, sollicitudin pretium felis. Aenean justo est, malesuada id interdum id, elementum sit amet felis. Morbi placerat, erat quis fringilla faucibus, eros felis gravida libero, et rutrum dui diam vitae mi. Mauris commodo, erat vel pharetra bibendum, turpis mauris efficitur libero, aliquet condimentum arcu lacus eget risus. Nam malesuada sodales augue, at semper lacus suscipit ac. Curabitur velit est, ullamcorper ut consectetur vel, placerat eu orci. Donec ut sem vestibulum ipsum tincidunt sagittis.

Ut a gravida nisi. Ut lacinia bibendum eros a placerat. Duis facilisis tortor eget massa feugiat sodales. Mauris ligula nulla, porta in rhoncus et, auctor sed est. Pellentesque ullamcorper mattis nisl eu molestie. Aenean tortor sapien, luctus at ultricies eu, dictum id eros. Cras facilisis ante sit amet arcu suscipit mattis. Sed et purus vitae sem tincidunt tincidunt. Sed fermentum ligula sed elit cursus posuere. Quisque pharetra efficitur eros. Maecenas fringilla nisi dui, vestibulum volutpat felis laoreet in. Proin elementum tellus vitae tellus sodales, in volutpat nulla hendrerit.

Morbi eleifend quis est vitae tincidunt. Etiam varius rhoncus nunc at pretium. Proin luctus non velit non efficitur. Integer suscipit erat eget nibh mattis posuere. Duis dictum arcu ut odio ultricies varius. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Integer vel sem leo. Aliquam pulvinar dolor quis volutpat ultrices. Duis vitae volutpat justo, quis malesuada est.

Mauris ut dui diam. Morbi congue commodo lectus in eleifend. Integer neque risus, facilisis nec interdum nec, condimentum non purus. Proin ex purus, mollis ut sem non, gravida tristique metus. Vivamus a est sit amet ante dictum posuere. Morbi volutpat, lacus imperdiet aliquam lacinia, orci est tincidunt erat, nec consequat purus dolor et tortor. Maecenas suscipit rutrum leo a aliquam. Maecenas vel finibus lacus. Nunc dictum risus ex, vel consectetur nisi faucibus at. Proin nec commodo ante. Duis id blandit est.

Pellentesque tempus nunc nec suscipit sagittis. Maecenas efficitur nunc ultricies, tincidunt metus id, dictum augue. Pellentesque at convallis tellus. Quisque hendrerit eget quam vel imperdiet. Nam urna purus, dignissim id tortor eget, laoreet mollis augue. Ut dictum consectetur magna, in aliquam turpis laoreet eu. Cras eu pulvinar neque, at ullamcorper lectus. Vestibulum tristique pellentesque erat et tincidunt. Fusce ut hendrerit risus. Etiam vehicula augue ut varius suscipit. Nulla facilisi. Phasellus lobortis ultrices magna, vel eleifend diam laoreet ac. Suspendisse eu arcu nec mauris pellentesque commodo. Suspendisse hendrerit dui nulla. Duis id turpis faucibus, euismod dui eget, facilisis sapien. Praesent dictum erat in ante condimentum blandit.

Sed ex ipsum, condimentum vel metus a, vestibulum tincidunt nibh. Fusce vehicula hendrerit lectus, sodales gravida risus aliquet quis. Nullam nec malesuada ligula. Praesent pulvinar velit sed risus aliquet lobortis. Phasellus laoreet felis sem, ac mattis sem molestie in. Nam tempor, felis non interdum tempus, lorem purus gravida lacus, ac luctus quam enim sit amet felis. Integer vitae dolor vitae erat consectetur tristique sed vel mauris.

Phasellus lobortis urna non eros auctor finibus. Suspendisse lobortis ante sit amet dolor convallis venenatis. Suspendisse id metus pellentesque erat pretium vulputate id in sem. Mauris iaculis quam lacus, vel malesuada lorem accumsan nec. Etiam dictum porttitor aliquet. Cras ac ante viverra, venenatis enim a, aliquam nulla. Integer dolor augue, facilisis sit amet pulvinar tincidunt, fermentum sit amet neque. Aliquam pellentesque augue sed urna feugiat dapibus. Donec interdum ac orci non fringilla. Sed lorem sapien, viverra quis elit vitae, scelerisque pharetra mauris. Fusce ut ligula sed diam ornare mattis. Integer mollis eu elit ut vehicula. Praesent nec risus ut massa aliquam malesuada.

Nunc at facilisis ipsum. Vivamus auctor arcu nunc, at tempus metus rutrum non. Nulla volutpat ullamcorper erat ac consectetur. Donec vel semper massa, euismod feugiat est. Sed at finibus ipsum, ac accumsan quam. Donec scelerisque laoreet purus, ac dapibus arcu mollis in. Donec tempus feugiat odio ut pellentesque.

Maecenas tellus lacus, molestie a auctor eget, sollicitudin quis odio. Donec tempus quam id ipsum suscipit scelerisque ac a felis. Maecenas malesuada odio nec ante eleifend, in maximus risus pretium. Etiam et dui quis enim malesuada congue eu at purus. Mauris iaculis ornare facilisis. Aliquam id ipsum nulla. Donec hendrerit elit nibh, eu consectetur ex consectetur non. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Nunc imperdiet nunc fermentum, posuere ante sed, laoreet lacus. Donec non elit enim. Sed lobortis, tortor pellentesque venenatis mollis, nunc quam aliquam sem, ut blandit mi mi ut est. Sed rhoncus mauris ut tellus aliquam, nec bibendum sapien porta. Duis ornare dui felis, eu rhoncus nisi euismod eu. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Duis eget quam quam.

Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum vitae purus nec lorem elementum tincidunt. Nulla sodales ipsum lacus. Suspendisse tincidunt justo non lacus iaculis, eget rutrum sem iaculis. Fusce auctor blandit lectus, sit amet hendrerit justo ultrices at. Maecenas eget rutrum augue. Maecenas vel velit nisi. Sed blandit arcu at fringilla vehicula. Phasellus risus erat, porttitor sed rhoncus at, placerat non mauris. In ac aliquet mi. Aenean sem arcu, porttitor eget laoreet vel, ornare quis erat. Donec pulvinar venenatis tristique. Morbi varius nunc eget tortor suscipit mattis.

Nulla gravida eros at justo rutrum sagittis. Maecenas vel elit ultricies, vulputate orci ac, iaculis dui. Morbi nisl libero, blandit eget feugiat sit amet, egestas a sem. Donec tincidunt quis libero sed rhoncus. Nulla ut luctus ipsum, et tincidunt leo. Etiam cursus, sapien pretium bibendum pretium, metus sapien commodo orci, ac interdum turpis sem id dui. Integer fermentum lobortis sem eget tincidunt. Morbi non erat ultrices, lobortis tellus et, porttitor sem. Ut dictum sapien sed ex aliquet, id aliquam diam accumsan. Vivamus magna ipsum, cursus et cursus a, condimentum vel sapien. Pellentesque sed elementum ante. Fusce ornare metus in sapien rhoncus interdum. Praesent euismod, nibh in luctus interdum, lorem libero efficitur elit, eu euismod dui sem id risus. Quisque felis libero, viverra eu iaculis quis, tincidunt vitae magna. Sed feugiat enim sem, a mattis nisi maximus eget. Vivamus condimentum vel magna et venenatis.

Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Fusce ut nibh quis tellus pretium suscipit. Praesent porttitor auctor nulla, eu sagittis libero aliquet eu. Vestibulum sit amet fringilla odio, id aliquet nulla. Pellentesque nec neque in felis tempor blandit. Duis scelerisque cursus massa. Donec sed iaculis nulla, ac venenatis lectus. Donec fermentum nunc ac tristique tincidunt. Curabitur semper tempus nunc vitae laoreet. Suspendisse sollicitudin, dui vitae finibus placerat, elit sapien viverra purus, et mattis orci lorem et nisi. Quisque consequat felis ipsum, quis euismod lectus pellentesque ut. Aenean vel ante arcu.

Suspendisse convallis volutpat libero. Donec efficitur, leo sed rutrum tincidunt, dolor purus accumsan dolor, vitae sollicitudin orci ante quis lorem. Vivamus mi arcu, pulvinar vitae malesuada sed, vestibulum nec felis. Nam sed metus eget risus iaculis malesuada sit amet non ipsum. Nulla vitae faucibus nunc, in accumsan felis. Sed suscipit tellus vel libero vestibulum fringilla. Nulla interdum facilisis ligula a tempus.

Maecenas id libero volutpat, egestas quam in, efficitur velit. Integer dolor enim, accumsan id urna ut, tristique sagittis leo. Praesent sed mauris in eros lacinia finibus. Aliquam varius dapibus justo, non interdum arcu. Praesent aliquam risus vel ultrices commodo. Nunc consequat lacus viverra nibh blandit finibus. Maecenas vel venenatis libero, quis congue nisi. Phasellus velit mi, blandit sed sagittis sed, euismod et orci. Morbi non lectus dapibus sapien vestibulum mollis eu ut purus. In convallis, sapien sed ultrices ultricies, lacus nulla ullamcorper tortor, porttitor porta est nunc id mauris. Phasellus consequat arcu accumsan blandit feugiat.

Proin laoreet erat ac iaculis sagittis. Nulla finibus maximus libero. Pellentesque non ante id sem imperdiet sagittis. Vestibulum elementum ornare urna. Aenean justo velit, cursus eu pretium nec, scelerisque et neque. Nam laoreet nibh venenatis sapien consequat, pellentesque sollicitudin ex porttitor. Mauris faucibus laoreet ultrices. Integer dictum et felis eget condimentum. Etiam sed dolor ac eros aliquam pharetra. Nullam pretium elit sit amet urna condimentum bibendum. Sed pretium viverra magna, vitae tincidunt leo malesuada et. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis sagittis orci in tempor bibendum. Nunc augue velit, malesuada in lobortis vel, pretium quis tortor.

Duis a lorem ac dui tincidunt ornare in sit amet ante. Sed arcu erat, rhoncus sed eros vitae, pellentesque egestas felis. Mauris quis rhoncus metus. Phasellus pellentesque ipsum eu sem vehicula consequat. Praesent eu nibh aliquet, vestibulum leo at, ornare arcu. Etiam tincidunt metus sit amet lobortis scelerisque. Nunc fermentum justo augue, mattis finibus nulla interdum in. Sed volutpat rutrum nunc eget placerat.

Donec at ipsum sed turpis mattis viverra sed vitae eros. Vivamus gravida ligula ut justo laoreet sagittis. Integer ornare ante sit amet quam eleifend sollicitudin. Nullam urna magna, sagittis sit amet ultrices et, pulvinar vel ante. Cras tristique nibh eget nulla hendrerit, vel consectetur risus gravida. Vestibulum dictum ornare dictum. Sed quis felis ac nibh ornare auctor. Nunc mattis pulvinar hendrerit. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Vestibulum ac interdum nulla, nec pharetra libero. Quisque ut velit at elit convallis rutrum ut et quam. Proin auctor purus ac lacus faucibus dictum. Integer lacinia suscipit massa, vel varius elit imperdiet vel.

Morbi ac elit ultricies, blandit orci vitae, consectetur urna. Nam libero ipsum, volutpat non turpis sollicitudin, rutrum pretium orci. Aliquam congue sit amet neque ut accumsan. Donec vel lobortis felis. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Suspendisse id leo feugiat, tincidunt quam id, commodo nisl. Vestibulum eu nulla magna. Aliquam erat volutpat. Sed sit amet neque magna. Nam pretium magna nec mauris accumsan, quis feugiat turpis consequat.

` },
    { name: "한글 로렘압숨",data:`국군의 조직과 편성은
헌법재판소 재판관은 정당에 가입하거나 정치에 관여할 수 없다. 모든 국민은 법 앞에 평등하다. 누구든지 성별·종교 또는 사회적 신분에 의하여 정치적·경제적·사회적·문화적 생활의 모든 영역에 있어서 차별을 받지 아니한다. 행정각부의 장은 국무위원 중에서 국무총리의 제청으로 대통령이 임명한다. 모든 국민은 법률이 정하는 바에 의하여 국방의 의무를 진다. 이 헌법중 공무원의 임기 또는 중임제한에 관한 규정은 이 헌법에 의하여 그 공무원이 최초로 선출 또는 임명된 때로부터 적용한다. 대통령이 궐위되거나 사고로 인하여 직무를 수행할 수 없을 때에는 국무총리, 법률이 정한 국무위원의 순서로 그 권한을 대행한다.
재산권의 행사는 공공
헌법재판소는 법관의 자격을 가진 9인의 재판관으로 구성하며, 재판관은 대통령이 임명한다. 국회의원의 수는 법률로 정하되, 200인 이상으로 한다. 언론·출판에 대한 허가나 검열과 집회·결사에 대한 허가는 인정되지 아니한다. 대한민국의 경제질서는 개인과 기업의 경제상의 자유와 창의를 존중함을 기본으로 한다. 군인은 현역을 면한 후가 아니면 국무총리로 임명될 수 없다. 제안된 헌법개정안은 대통령이 20일 이상의 기간 이를 공고하여야 한다. 체포·구속·압수 또는 수색을 할 때에는 적법한 절차에 따라 검사의 신청에 의하여 법관이 발부한 영장을 제시하여야 한다. 다만, 현행범인인 경우와 장기 3년 이상의 형에 해당하는 죄를 범하고 도피 또는 증거인멸의 염려가 있을 때에는 사후에 영장을 청구할 수 있다.
일반사면을 명하려면
나는 헌법을 준수하고 국가를 보위하며 조국의 평화적 통일과 국민의 자유와 복리의 증진 및 민족문화의 창달에 노력하여 대통령으로서의 직책을 성실히 수행할 것을 국민 앞에 엄숙히 선서합니다. 법관은 헌법과 법률에 의하여 그 양심에 따라 독립하여 심판한다. 국가원로자문회의의 의장은 직전대통령이 된다. 다만, 직전대통령이 없을 때에는 대통령이 지명한다. 대통령은 법률에서 구체적으로 범위를 정하여 위임받은 사항과 법률을 집행하기 위하여 필요한 사항에 관하여 대통령령을 발할 수 있다. 국회에 제출된 법률안 기타의 의안은 회기중에 의결되지 못한 이유로 폐기되지 아니한다. 다만, 국회의원의 임기가 만료된 때에는 그러하지 아니하다.
재의의 요구가 있을
대통령은 전시·사변 또는 이에 준하는 국가비상사태에 있어서 병력으로써 군사상의 필요에 응하거나 공공의 안녕질서를 유지할 필요가 있을 때에는 법률이 정하는 바에 의하여 계엄을 선포할 수 있다. 국회의 회의는 공개한다. 다만, 출석의원 과반수의 찬성이 있거나 의장이 국가의 안전보장을 위하여 필요하다고 인정할 때에는 공개하지 아니할 수 있다. 국민경제자문회의의 조직·직무범위 기타 필요한 사항은 법률로 정한다. 모든 국민은 통신의 비밀을 침해받지 아니한다. 비상계엄이 선포된 때에는 법률이 정하는 바에 의하여 영장제도, 언론·출판·집회·결사의 자유, 정부나 법원의 권한에 관하여 특별한 조치를 할 수 있다.
누구든지 병역의무의
국가는 농·어민과 중소기업의 자조조직을 육성하여야 하며, 그 자율적 활동과 발전을 보장한다. 대한민국의 주권은 국민에게 있고, 모든 권력은 국민으로부터 나온다. 모든 국민은 그 보호하는 자녀에게 적어도 초등교육과 법률이 정하는 교육을 받게 할 의무를 진다. 국가는 국민 모두의 생산 및 생활의 기반이 되는 국토의 효율적이고 균형있는 이용·개발과 보전을 위하여 법률이 정하는 바에 의하여 그에 관한 필요한 제한과 의무를 과할 수 있다. 대통령은 제3항과 제4항의 사유를 지체없이 공포하여야 한다. 국가는 농업 및 어업을 보호·육성하기 위하여 농·어촌종합개발과 그 지원등 필요한 계획을 수립·시행하여야 한다.
모든 국민은 법률이
국회가 재적의원 과반수의 찬성으로 계엄의 해제를 요구한 때에는 대통령은 이를 해제하여야 한다. 헌법재판소 재판관의 임기는 6년으로 하며, 법률이 정하는 바에 의하여 연임할 수 있다. 모든 국민은 보건에 관하여 국가의 보호를 받는다. 사회적 특수계급의 제도는 인정되지 아니하며, 어떠한 형태로도 이를 창설할 수 없다. 누구든지 체포 또는 구속을 당한 때에는 적부의 심사를 법원에 청구할 권리를 가진다. 국가안전보장회의는 대통령이 주재한다. 대통령은 조약을 체결·비준하고, 외교사절을 신임·접수 또는 파견하며, 선전포고와 강화를 한다. 국토와 자원은 국가의 보호를 받으며, 국가는 그 균형있는 개발과 이용을 위하여 필요한 계획을 수립한다.
지방의회의 조직·권
국교는 인정되지 아니하며, 종교와 정치는 분리된다. 법관이 중대한 심신상의 장해로 직무를 수행할 수 없을 때에는 법률이 정하는 바에 의하여 퇴직하게 할 수 있다. 각급 선거관리위원회의 조직·직무범위 기타 필요한 사항은 법률로 정한다. 모든 국민은 신체의 자유를 가진다. 누구든지 법률에 의하지 아니하고는 체포·구속·압수·수색 또는 심문을 받지 아니하며, 법률과 적법한 절차에 의하지 아니하고는 처벌·보안처분 또는 강제노역을 받지 아니한다. 교육의 자주성·전문성·정치적 중립성 및 대학의 자율성은 법률이 정하는 바에 의하여 보장된다. 국회의원의 선거구와 비례대표제 기타 선거에 관한 사항은 법률로 정한다.
국정의 중요한 사항에
공공필요에 의한 재산권의 수용·사용 또는 제한 및 그에 대한 보상은 법률로써 하되, 정당한 보상을 지급하여야 한다. 대통령으로 선거될 수 있는 자는 국회의원의 피선거권이 있고 선거일 현재 40세에 달하여야 한다. 공무원의 직무상 불법행위로 손해를 받은 국민은 법률이 정하는 바에 의하여 국가 또는 공공단체에 정당한 배상을 청구할 수 있다. 이 경우 공무원 자신의 책임은 면제되지 아니한다. 각급 선거관리위원회는 선거인명부의 작성등 선거사무와 국민투표사무에 관하여 관계 행정기관에 필요한 지시를 할 수 있다. 위원은 탄핵 또는 금고 이상의 형의 선고에 의하지 아니하고는 파면되지 아니한다.
대통령은 국회에 출석
새로운 회계연도가 개시될 때까지 예산안이 의결되지 못한 때에는 정부는 국회에서 예산안이 의결될 때까지 다음의 목적을 위한 경비는 전년도 예산에 준하여 집행할 수 있다. 누구든지 체포 또는 구속의 이유와 변호인의 조력을 받을 권리가 있음을 고지받지 아니하고는 체포 또는 구속을 당하지 아니한다. 체포 또는 구속을 당한 자의 가족등 법률이 정하는 자에게는 그 이유와 일시·장소가 지체없이 통지되어야 한다. 전직대통령의 신분과 예우에 관하여는 법률로 정한다. 모든 국민은 고문을 받지 아니하며, 형사상 자기에게 불리한 진술을 강요당하지 아니한다. 군인은 현역을 면한 후가 아니면 국무위원으로 임명될 수 없다.
국무회의는 대통령·
국회는 헌법개정안이 공고된 날로부터 60일 이내에 의결하여야 하며, 국회의 의결은 재적의원 3분의 2 이상의 찬성을 얻어야 한다. 모든 국민은 소급입법에 의하여 참정권의 제한을 받거나 재산권을 박탈당하지 아니한다. 정당의 목적이나 활동이 민주적 기본질서에 위배될 때에는 정부는 헌법재판소에 그 해산을 제소할 수 있고, 정당은 헌법재판소의 심판에 의하여 해산된다. 공무원의 신분과 정치적 중립성은 법률이 정하는 바에 의하여 보장된다. 국회는 헌법 또는 법률에 특별한 규정이 없는 한 재적의원 과반수의 출석과 출석의원 과반수의 찬성으로 의결한다. 가부동수인 때에는 부결된 것으로 본다.
모든 국민은 인간으로
모든 국민은 건강하고 쾌적한 환경에서 생활할 권리를 가지며, 국가와 국민은 환경보전을 위하여 노력하여야 한다. 국회는 의원의 자격을 심사하며, 의원을 징계할 수 있다. 국가는 재해를 예방하고 그 위험으로부터 국민을 보호하기 위하여 노력하여야 한다. 헌법재판소의 장은 국회의 동의를 얻어 재판관중에서 대통령이 임명한다. 국무총리·국무위원 또는 정부위원은 국회나 그 위원회에 출석하여 국정처리상황을 보고하거나 의견을 진술하고 질문에 응답할 수 있다. 감사원의 조직·직무범위·감사위원의 자격·감사대상공무원의 범위 기타 필요한 사항은 법률로 정한다. 대통령의 선거에 관한 사항은 법률로 정한다.
대통령의 임기가 만료
국회는 선전포고, 국군의 외국에의 파견 또는 외국군대의 대한민국 영역안에서의 주류에 대한 동의권을 가진다. 대통령이 임시회의 집회를 요구할 때에는 기간과 집회요구의 이유를 명시하여야 한다. 선거에 관한 경비는 법률이 정하는 경우를 제외하고는 정당 또는 후보자에게 부담시킬 수 없다. 혼인과 가족생활은 개인의 존엄과 양성의 평등을 기초로 성립되고 유지되어야 하며, 국가는 이를 보장한다. 국정감사 및 조사에 관한 절차 기타 필요한 사항은 법률로 정한다. 신체장애자 및 질병·노령 기타의 사유로 생활능력이 없는 국민은 법률이 정하는 바에 의하여 국가의 보호를 받는다. 국가는 여자의 복지와 권익의 향상을 위하여 노력하여야 한다.
이 헌법시행 당시의
국무총리 또는 행정각부의 장은 소관사무에 관하여 법률이나 대통령령의 위임 또는 직권으로 총리령 또는 부령을 발할 수 있다. 정당의 설립은 자유이며, 복수정당제는 보장된다. 형사피의자 또는 형사피고인으로서 구금되었던 자가 법률이 정하는 불기소처분을 받거나 무죄판결을 받은 때에는 법률이 정하는 바에 의하여 국가에 정당한 보상을 청구할 수 있다. 국채를 모집하거나 예산외에 국가의 부담이 될 계약을 체결하려 할 때에는 정부는 미리 국회의 의결을 얻어야 한다. 국가유공자·상이군경 및 전몰군경의 유가족은 법률이 정하는 바에 의하여 우선적으로 근로의 기회를 부여받는다. 대통령은 국무총리·국무위원·행정각부의 장 기타 법률이 정하는 공사의 직을 겸할 수 없다.
제2항과 제3항의 처분
정부는 예산에 변경을 가할 필요가 있을 때에는 추가경정예산안을 편성하여 국회에 제출할 수 있다. 국방상 또는 국민경제상 긴절한 필요로 인하여 법률이 정하는 경우를 제외하고는, 사영기업을 국유 또는 공유로 이전하거나 그 경영을 통제 또는 관리할 수 없다. 한 회계연도를 넘어 계속하여 지출할 필요가 있을 때에는 정부는 연한을 정하여 계속비로서 국회의 의결을 얻어야 한다. 여자의 근로는 특별한 보호를 받으며, 고용·임금 및 근로조건에 있어서 부당한 차별을 받지 아니한다. 대통령은 헌법과 법률이 정하는 바에 의하여 공무원을 임면한다. 형사피해자는 법률이 정하는 바에 의하여 당해 사건의 재판절차에서 진술할 수 있다.
통신·방송의 시설기
재판의 전심절차로서 행정심판을 할 수 있다. 행정심판의 절차는 법률로 정하되, 사법절차가 준용되어야 한다. 국가는 주택개발정책등을 통하여 모든 국민이 쾌적한 주거생활을 할 수 있도록 노력하여야 한다. 탄핵결정은 공직으로부터 파면함에 그친다. 그러나, 이에 의하여 민사상이나 형사상의 책임이 면제되지는 아니한다. 국회의원은 현행범인인 경우를 제외하고는 회기중 국회의 동의없이 체포 또는 구금되지 아니한다. 대법관은 대법원장의 제청으로 국회의 동의를 얻어 대통령이 임명한다. 국회는 국정을 감사하거나 특정한 국정사안에 대하여 조사할 수 있으며, 이에 필요한 서류의 제출 또는 증인의 출석과 증언이나 의견의 진술을 요구할 수 있다.
대통령은 법률안의 일
국가는 지역간의 균형있는 발전을 위하여 지역경제를 육성할 의무를 진다. 제2항의 재판관중 3인은 국회에서 선출하는 자를, 3인은 대법원장이 지명하는 자를 임명한다. 대통령은 조국의 평화적 통일을 위한 성실한 의무를 진다. 국회는 국민의 보통·평등·직접·비밀선거에 의하여 선출된 국회의원으로 구성한다. 국회의원은 국가이익을 우선하여 양심에 따라 직무를 행한다. 모든 국민은 법률이 정하는 바에 의하여 납세의 의무를 진다. 대통령은 국민의 보통·평등·직접·비밀선거에 의하여 선출한다. 피고인의 자백이 고문·폭행·협박·구속의 부당한 장기화 또는 기망 기타의 방법에 의하여 자의로 진술된 것이 아니라고 인정될 때 또는 정식재판에 있어서 피고인의 자백이 그에게 불리한 유일한 증거일 때에는 이를 유죄의 증거로 삼거나 이를 이유로 처벌할 수 없다.
외국인은 국제법과 조
국가는 청원에 대하여 심사할 의무를 진다. 대법원장의 임기는 6년으로 하며, 중임할 수 없다. 법률안에 이의가 있을 때에는 대통령은 제1항의 기간내에 이의서를 붙여 국회로 환부하고, 그 재의를 요구할 수 있다. 국회의 폐회중에도 또한 같다. 군인 또는 군무원이 아닌 국민은 대한민국의 영역안에서는 중대한 군사상 기밀·초병·초소·유독음식물공급·포로·군용물에 관한 죄중 법률이 정한 경우와 비상계엄이 선포된 경우를 제외하고는 군사법원의 재판을 받지 아니한다. 국회는 법률에 저촉되지 아니하는 범위안에서 의사와 내부규율에 관한 규칙을 제정할 수 있다. 이 헌법시행 당시에 이 헌법에 의하여 새로 설치될 기관의 권한에 속하는 직무를 행하고 있는 기관은 이 헌법에 의하여 새로운 기관이 설치될 때까지 존속하며 그 직무를 행한다.
연소자의 근로는 특별
군인·군무원·경찰공무원 기타 법률이 정하는 자가 전투·훈련등 직무집행과 관련하여 받은 손해에 대하여는 법률이 정하는 보상외에 국가 또는 공공단체에 공무원의 직무상 불법행위로 인한 배상은 청구할 수 없다. 모든 국민은 사생활의 비밀과 자유를 침해받지 아니한다. 선거에 있어서 최고득표자가 2인 이상인 때에는 국회의 재적의원 과반수가 출석한 공개회의에서 다수표를 얻은 자를 당선자로 한다. 대한민국의 영토는 한반도와 그 부속도서로 한다. 학교교육 및 평생교육을 포함한 교육제도와 그 운영, 교육재정 및 교원의 지위에 관한 기본적인 사항은 법률로 정한다. 국가는 대외무역을 육성하며, 이를 규제·조정할 수 있다.
모든 국민은 직업선택
정당은 법률이 정하는 바에 의하여 국가의 보호를 받으며, 국가는 법률이 정하는 바에 의하여 정당운영에 필요한 자금을 보조할 수 있다. 농업생산성의 제고와 농지의 합리적인 이용을 위하거나 불가피한 사정으로 발생하는 농지의 임대차와 위탁경영은 법률이 정하는 바에 의하여 인정된다. 모든 국민은 주거의 자유를 침해받지 아니한다. 주거에 대한 압수나 수색을 할 때에는 검사의 신청에 의하여 법관이 발부한 영장을 제시하여야 한다. 국가는 모성의 보호를 위하여 노력하여야 한다. 대통령·국무총리·국무위원·행정각부의 장·헌법재판소 재판관·법관·중앙선거관리위원회 위원·감사원장·감사위원 기타 법률이 정한 공무원이 그 직무집행에 있어서 헌법이나 법률을 위배한 때에는 국회는 탄핵의 소추를 의결할 수 있다.
국회나 그 위원회의
모든 국민은 학문과 예술의 자유를 가진다. 사법권은 법관으로 구성된 법원에 속한다. 대통령의 임기연장 또는 중임변경을 위한 헌법개정은 그 헌법개정 제안 당시의 대통령에 대하여는 효력이 없다. 감사위원은 원장의 제청으로 대통령이 임명하고, 그 임기는 4년으로 하며, 1차에 한하여 중임할 수 있다. 의원을 제명하려면 국회재적의원 3분의 2 이상의 찬성이 있어야 한다. 이 헌법에 의한 최초의 대통령의 임기는 이 헌법시행일로부터 개시한다. 법률이 정하는 주요방위산업체에 종사하는 근로자의 단체행동권은 법률이 정하는 바에 의하여 이를 제한하거나 인정하지 아니할 수 있다. 헌법개정은 국회재적의원 과반수 또는 대통령의 발의로 제안된다.` },
  ];

  // 숫자 paddingChar + 압축 마커 조합 회귀 테스트
  try {
    const chars8 = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const encoderNumPad = new Ddu64(chars8, "1", { compress: true });
    const testData = "A".repeat(2000); // 압축이 유리하도록 반복 문자열
    const encoded = encoderNumPad.encode(testData);
    const decoded = encoderNumPad.decode(encoded);
    const passed = decoded === testData && encoded.includes("ELYSIA");
    reportTest("숫자 paddingChar + compress 마커", passed, passed ? undefined : `EncodedTail: ${encoded.slice(-30)}`);
  } catch (err: any) {
    reportTest("숫자 paddingChar + compress 마커", false, err.message);
  }

  let allPassed = true;
  
  for (const tc of testCases) {
    try {
      const original = tc.data;
      const normalEncoded = encoder.encode(original);
      const compressEncoded = encoder.encode(original, { compress: true });
      
      // 각각 디코딩 검증
      const normalDecoded = encoder.decode(normalEncoded);
      const compressDecoded = encoder.decode(compressEncoded);
      
      const normalOk = normalDecoded === original;
      const compressOk = compressDecoded === original;
      const bothOk = normalOk && compressOk;
      
      if (!bothOk) allPassed = false;

      const ratio = ((1 - compressEncoded.length / normalEncoded.length) * 100).toFixed(1);
      const ratioStr = compressEncoded.length < normalEncoded.length ? `${ratio}%↓` : `+${Math.abs(parseFloat(ratio))}%`;
      
      console.log(`│ ${tc.name.padEnd(17)} │ ${original.length.toString().padStart(8)} │ ${normalEncoded.length.toString().padStart(8)} │ ${compressEncoded.length.toString().padStart(8)} │ ${ratioStr.padStart(8)} │ ${bothOk ? "✓ 정상" : "✗ 실패"}     │`);
    } catch (err: any) {
      allPassed = false;
      console.log(`│ ${tc.name.padEnd(17)} │ 에러: ${err.message.substring(0, 50).padEnd(56)} │`);
    }
  }
  
  console.log("└───────────────────┴──────────┴──────────┴──────────┴──────────┴────────────┘\n");
  
  reportTest("원문/기존/압축 비교 테이블 검증", allPassed);

  // ─────────────────────────────────────────────────────────────────────────────
  // 압축 인코딩 → 압축 디코딩 상세 테스트
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n  [압축 인코딩 → 디코딩 상세 검증]");
  
  // 1) 기본 압축 테스트
  try {
    const testData = "Hello World! This is a test for compression.";
    const encoded = encoder.encode(testData, { compress: true });
    const decoded = encoder.decode(encoded);
    
    console.log(`    원문: "${testData.substring(0, 30)}..."`);
    console.log(`    압축: "${encoded.substring(0, 40)}..." (${encoded.length}자)`);
    console.log(`    복원: "${decoded.substring(0, 30)}..."`);
    
    reportTest("압축 인코딩 → 디코딩 일치", testData === decoded);
  } catch (err: any) {
    reportTest("압축 인코딩 → 디코딩 일치", false, err.message);
  }

  // 2) decodeToBuffer 테스트
  try {
    const testData = "Buffer 압축 테스트 데이터입니다.";
    const encoded = encoder.encode(testData, { compress: true });
    const decodedBuffer = encoder.decodeToBuffer(encoded);
    const decodedStr = decodedBuffer.toString('utf-8');
    
    reportTest("압축 decodeToBuffer 검증", testData === decodedStr);
  } catch (err: any) {
    reportTest("압축 decodeToBuffer 검증", false, err.message);
  }

  // 3) 한글 압축 테스트
  try {
    const koreanData = "안녕하세요! 반갑습니다. ".repeat(30);
    const compressEncoded = encoder.encode(koreanData, { compress: true });
    const decoded = encoder.decode(compressEncoded);
    reportTest("압축 (한글 데이터)", koreanData === decoded);
  } catch (err: any) {
    reportTest("압축 (한글 데이터)", false, err.message);
  }

  // 4) 빈 문자열 압축
  try {
    const emptyData = "";
    const encoded = encoder.encode(emptyData, { compress: true });
    const decoded = encoder.decode(encoded);
    reportTest("압축 (빈 문자열)", emptyData === decoded);
  } catch (err: any) {
    reportTest("압축 (빈 문자열)", false, err.message);
  }

  // 5) 비압축 데이터가 압축 디코드에서도 정상 작동
  try {
    const testData = "Normal encoding without compression";
    const encoded = encoder.encode(testData); // compress: false
    const decoded = encoder.decode(encoded);
    reportTest("비압축 데이터 디코딩 호환성", testData === decoded);
  } catch (err: any) {
    reportTest("비압축 데이터 디코딩 호환성", false, err.message);
  }

  // 6) 바이너리 데이터 압축
  try {
    const binaryEncoder = new Ddu64(BASE64_CHARS, "=", { encoding: 'latin1' });
    const buffer = Buffer.alloc(500, 0xAB);
    const compressEncoded = binaryEncoder.encode(buffer, { compress: true });
    const decodedBuffer = binaryEncoder.decodeToBuffer(compressEncoded);
    reportTest("압축 (바이너리 데이터)", buffer.equals(decodedBuffer));
  } catch (err: any) {
    reportTest("압축 (바이너리 데이터)", false, err.message);
  }

  // 7) 다양한 charset에서 압축 테스트
  try {
    const koreanEncoder = new Ddu64("우따야", "뭐", { usePowerOfTwo: false });
    const testData = "다른 charset에서도 압축이 잘 되는지 테스트합니다!";
    const encoded = koreanEncoder.encode(testData, { compress: true });
    const decoded = koreanEncoder.decode(encoded);
    reportTest("압축 (다른 charset)", testData === decoded);
  } catch (err: any) {
    reportTest("압축 (다른 charset)", false, err.message);
  }

  // 8) 대용량 데이터 압축/디코딩
  try {
    const largeData = "Lorem ipsum dolor sit amet. ".repeat(1000);
    const encoded = encoder.encode(largeData, { compress: true });
    const decoded = encoder.decode(encoded);
    
    console.log(`\n  [대용량 테스트] 원본: ${largeData.length}자 → 압축: ${encoded.length}자 (${((1 - encoded.length / largeData.length) * 100).toFixed(1)}% 감소)`);
    
    reportTest("압축 (대용량 28KB)", largeData === decoded);
  } catch (err: any) {
    reportTest("압축 (대용량 28KB)", false, err.message);
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
  console.log("💡 전체 테스트를 실행하려면:");
  console.log("   npx tsx ./src/test/test-all-integrated.ts");
  console.log("   또는");
  console.log("   npx tsx ./src/test/test-comprehensive.ts\n");
} else {
  console.log(`❌ ${failedTests}개 테스트 실패\n`);
  process.exit(1);
}

console.log("╔════════════════════════════════════════════════════════════════════════════╗");
console.log("║                       빠른 테스트 완료!                                    ║");
console.log("╚════════════════════════════════════════════════════════════════════════════╝");

{
  const encoder = new Ddu64(BASE64_CHARS, "=");
  const decoder = new Ddu64(BASE64_CHARS, "=");

  const testData = "Hello World! ";
  const encoded = encoder.encode(testData, { compress: true });
  const decoded = decoder.decode(encoded);

  console.log(encoded);
  console.log(decoded);
}