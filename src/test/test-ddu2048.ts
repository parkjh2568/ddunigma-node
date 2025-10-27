import { Ddu2048 } from "../index.js";

console.log("=== Ddu2048 종합 테스트 시작 ===\n");

const ddu2048 = new Ddu2048();
let passCount = 0;
let failCount = 0;

// 테스트 헬퍼 함수
function test(name: string, testFn: () => boolean) {
  try {
    const result = testFn();
    if (result) {
      console.log(`✓ ${name}`);
      passCount++;
    } else {
      console.log(`✗ ${name} - 실패`);
      failCount++;
    }
  } catch (err: any) {
    console.log(`✗ ${name} - 에러: ${err.message}`);
    failCount++;
  }
}

// 1. 정확도 테스트
console.log("[ 1. 정확도 테스트 ]");

test("빈 문자열", () => {
  const encoded = ddu2048.encode("");
  const decoded = ddu2048.decode(encoded);
  return decoded === "";
});

test("단일 문자 (A)", () => {
  const input = "A";
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

test("짧은 문자열 (Hello)", () => {
  const input = "Hello";
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

test("중간 길이 문자열", () => {
  const input = "Hello World! This is a test.";
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

test("긴 문자열 (1000자)", () => {
  const input = "A".repeat(1000);
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

test("매우 긴 문자열 (10000자)", () => {
  const input = "Test".repeat(2500);
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

// 2. 특수 문자 테스트
console.log("\n[ 2. 특수 문자 테스트 ]");

test("기본 특수 문자", () => {
  const input = "!@#$%^&*()_+-=[]{}|;':\"<>?,./";
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

test("이스케이프 문자", () => {
  const input = "Line1\nLine2\tTab\rReturn\\Backslash";
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

test("유니코드 문자 (이모지)", () => {
  const input = "Hello 🌍 World 🎉 Test 😊";
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

test("한글", () => {
  const input = "안녕하세요! 반갑습니다. 테스트입니다.";
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

test("일본어", () => {
  const input = "こんにちは世界！テストです。";
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

test("중국어", () => {
  const input = "你好世界！这是测试。";
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

test("다양한 언어 혼합", () => {
  const input = "Hello 안녕 こんにちは 你好 مرحبا Привет";
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

// 3. 공백 테스트
console.log("\n[ 3. 공백 테스트 ]");

test("단일 공백", () => {
  const input = " ";
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

test("다중 공백", () => {
  const input = "     ";
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

test("앞뒤 공백", () => {
  const input = "  Hello World  ";
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

test("중간 다중 공백", () => {
  const input = "Hello     World";
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

// 4. 패딩 테스트
console.log("\n[ 4. 패딩 테스트 ]");

// 11비트 청크이므로 다양한 바이트 길이 테스트
for (let i = 1; i <= 20; i++) {
  test(`${i}바이트 문자열 패딩`, () => {
    const input = "x".repeat(i);
    const encoded = ddu2048.encode(input);
    const decoded = ddu2048.decode(encoded);
    return decoded === input;
  });
}

// 5. 에지 케이스 테스트
console.log("\n[ 5. 에지 케이스 테스트 ]");

test("널 문자 포함", () => {
  const input = "Hello\x00World";
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

test("모든 ASCII 문자", () => {
  let input = "";
  for (let i = 0; i < 128; i++) {
    input += String.fromCharCode(i);
  }
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

test("반복 패턴 (AAABBBCCC)", () => {
  const input = "AAA".repeat(100) + "BBB".repeat(100) + "CCC".repeat(100);
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

test("랜덤 문자열", () => {
  let input = "";
  for (let i = 0; i < 500; i++) {
    input += String.fromCharCode(Math.floor(Math.random() * 128));
  }
  const encoded = ddu2048.encode(input);
  const decoded = ddu2048.decode(encoded);
  return decoded === input;
});

// 6. 성능 테스트
console.log("\n[ 6. 성능 테스트 ]");

function performanceTest(name: string, input: string) {
  const startEncode = Date.now();
  const encoded = ddu2048.encode(input);
  const encodeTime = Date.now() - startEncode;

  const startDecode = Date.now();
  const decoded = ddu2048.decode(encoded);
  const decodeTime = Date.now() - startDecode;

  const originalSize = Buffer.from(input).length;
  const encodedSize = Buffer.from(encoded).length;
  const ratio = ((encodedSize / originalSize - 1) * 100).toFixed(1);

  console.log(`\n${name}:`);
  console.log(`  원본: ${originalSize.toLocaleString()} 바이트`);
  console.log(`  인코딩: ${encodedSize.toLocaleString()} 바이트 (${ratio}%)`);
  console.log(`  인코딩 시간: ${encodeTime}ms`);
  console.log(`  디코딩 시간: ${decodeTime}ms`);
  console.log(`  정확도: ${decoded === input ? "✓" : "✗"}`);
}

performanceTest("작은 텍스트 (100자)", "Hello World! ".repeat(10));
performanceTest("중간 텍스트 (1KB)", "Test ".repeat(250));
performanceTest("큰 텍스트 (10KB)", "Lorem ipsum ".repeat(1000));
performanceTest("매우 큰 텍스트 (100KB)", "A".repeat(100000));

const longKorean = "안녕하세요! 반갑습니다. 한글 테스트입니다. ".repeat(500);
performanceTest("한글 텍스트 (약 10KB)", longKorean);

// 7. 커스텀 문자셋 검증 테스트
console.log("\n[ 7. 커스텀 문자셋 검증 테스트 ]");

test("2047개 문자셋 (부족) - 에러 발생", () => {
  try {
    const chars = Array.from({ length: 2047 }, (_, i) => String(i).padStart(4, "0"));
    new Ddu2048(chars, "XXXX");
    return false;
  } catch (err: any) {
    return err.message.includes("at least 2048 characters");
  }
});

test("문자 길이 불일치 - 에러 발생", () => {
  try {
    const chars = Array.from({ length: 2048 }, (_, i) => 
      i < 1024 ? "A" + i : "B" + i.toString().padStart(2, "0")
    );
    new Ddu2048(chars, "XX");
    return false;
  } catch (err: any) {
    return err.message.includes("same length");
  }
});

test("패딩 길이 불일치 - 에러 발생", () => {
  try {
    const chars = Array.from({ length: 2048 }, (_, i) => String(i).padStart(4, "0"));
    new Ddu2048(chars, "XXX");
    return false;
  } catch (err: any) {
    return err.message.includes("must match");
  }
});

test("중복 문자 - 에러 발생", () => {
  try {
    const chars = Array.from({ length: 2048 }, (_, i) => 
      String(i % 1024).padStart(4, "0")
    );
    new Ddu2048(chars, "XXXX");
    return false;
  } catch (err: any) {
    return err.message.includes("duplicate");
  }
});

test("패딩이 문자셋에 포함 - 에러 발생", () => {
  try {
    const chars = Array.from({ length: 2048 }, (_, i) => String(i).padStart(4, "0"));
    new Ddu2048(chars, "0000");
    return false;
  } catch (err: any) {
    return err.message.includes("cannot be in the character set");
  }
});

// 8. Base64 비교 테스트
console.log("\n[ 8. Base64 비교 테스트 ]");

function compareWithBase64(name: string, input: string) {
  const base64 = Buffer.from(input).toString("base64");
  const ddu2048Encoded = ddu2048.encode(input);
  
  const base64Size = base64.length;
  const ddu2048Size = ddu2048Encoded.length;
  const diff = ((ddu2048Size / base64Size - 1) * 100).toFixed(1);
  
  console.log(`${name}:`);
  console.log(`  Base64: ${base64Size} 문자`);
  console.log(`  Ddu2048: ${ddu2048Size} 문자 (${diff}%)`);
}

console.log();
compareWithBase64("짧은 텍스트", "Hello World!");
compareWithBase64("중간 텍스트", "Hello World! ".repeat(50));
compareWithBase64("긴 텍스트", "Test ".repeat(500));
compareWithBase64("한글 텍스트", "안녕하세요! ".repeat(50));

// 최종 결과
console.log("\n=== 테스트 결과 ===");
console.log(`총 테스트: ${passCount + failCount}개`);
console.log(`통과: ${passCount}개`);
console.log(`실패: ${failCount}개`);
console.log(`성공률: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);

if (failCount === 0) {
  console.log("\n✅ 모든 테스트 통과!");
} else {
  console.log(`\n❌ ${failCount}개 테스트 실패`);
  process.exit(1);
}

