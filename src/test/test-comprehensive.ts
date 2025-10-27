import { Ddu64, Custom64, Ddu128, Ddu512, Ddu2048 } from "../index.js";

console.log("╔════════════════════════════════════════════════════════════════════════════╗");
console.log("║            DDU ENIGMA - 통합 종합 테스트 스위트                           ║");
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

// ═══════════════════════════════════════════════════════════════════════════════
console.log("═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 1. 기본 기능 테스트 - 모든 인코더 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

const testData = [
  { name: "빈 문자열", data: "" },
  { name: "단일 문자 (A)", data: "A" },
  { name: "짧은 텍스트", data: "Hello World!" },
  { name: "한글", data: "안녕하세요! 반갑습니다." },
  { name: "특수문자", data: "!@#$%^&*()_+-=[]{}|;':\"<>?,./\n\t\r" },
  { name: "이모지", data: "Hello 🌍 World 🎉 😀" },
  { name: "중간 길이", data: "Lorem ipsum dolor sit amet. ".repeat(10) },
  { name: "긴 텍스트 (1KB)", data: "Test ".repeat(250) },
  { name: "매우 긴 텍스트 (10KB)", data: "A".repeat(10000) },
];

const encoders = {
  "Ddu64": new Ddu64(),
  "Custom64": new Custom64(),
  "Ddu128": new Ddu128(),
  "Ddu512": new Ddu512(),
  "Ddu2048": new Ddu2048(),
};

Object.entries(encoders).forEach(([name, encoder]) => {
  console.log(`\n${name}:`);
  let encoderPassed = 0;
  
  testData.forEach(test => {
    try {
      const encoded = encoder.encode(test.data);
      const decoded = encoder.decode(encoded);
      const passed = decoded === test.data;
      reportTest(test.name, passed, passed ? undefined : "디코딩 불일치");
      if (passed) encoderPassed++;
    } catch (err: any) {
      reportTest(test.name, false, err.message);
    }
  });
  
  console.log(`  ${name} 총합: ${encoderPassed}/${testData.length} 통과`);
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 2. URL-Safe 검증 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

const urlSafeRegex = /^[A-Za-z0-9_-]*$/;
const urlTestString = "https://example.com?param=value&other=123";

console.log("참고: Ddu64는 한글 문자셋, Custom64는 모든 URL-safe 문자 사용으로 패딩 문자 제약이 있습니다.\n");

Object.entries(encoders).forEach(([name, encoder]) => {
  // Ddu64와 Custom64는 설계상 URL-safe가 아니거나 제약이 있으므로 스킵
  if (name === "Ddu64" || name === "Custom64") {
    console.log(`  ⊘ ${name} URL-Safe (설계상 제외)`);
    return;
  }
  
  try {
    const encoded = encoder.encode(urlTestString);
    const isUrlSafe = urlSafeRegex.test(encoded);
    reportTest(`${name} URL-Safe`, isUrlSafe, isUrlSafe ? undefined : `포함된 문자: ${encoded.match(/[^A-Za-z0-9_-]/g)?.join(", ")}`);
  } catch (err: any) {
    reportTest(`${name} URL-Safe`, false, err.message);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 3. 압축률 비교 (Base64 대비) ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

const comparisonTests = [
  { name: "짧은 텍스트 (12자)", data: "Hello World!" },
  { name: "중간 텍스트 (280자)", data: "Lorem ipsum dolor sit amet. ".repeat(10) },
  { name: "긴 텍스트 (1KB)", data: "Test ".repeat(250) },
  { name: "한글 (280자)", data: "안녕하세요! 반갑습니다. ".repeat(20) },
];

comparisonTests.forEach(test => {
  console.log(`\n${test.name} (원본: ${test.data.length}자, ${Buffer.from(test.data).length}바이트):`);
  
  const base64 = Buffer.from(test.data).toString("base64");
  console.log(`  Base64     : ${base64.length.toString().padStart(6)} 문자 (기준)`);
  
  Object.entries(encoders).forEach(([name, encoder]) => {
    try {
      const encoded = encoder.encode(test.data);
      const ratio = ((encoded.length / base64.length - 1) * 100).toFixed(1);
      const sign = encoded.length > base64.length ? "+" : encoded.length < base64.length ? "" : "±";
      console.log(`  ${name.padEnd(11)}: ${encoded.length.toString().padStart(6)} 문자 (${sign}${ratio}%)`);
    } catch (err) {
      console.log(`  ${name.padEnd(11)}: 에러`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 4. 성능 벤치마크 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

const perfTests = [
  { name: "1KB 데이터", data: "A".repeat(1000), iterations: 1000 },
  { name: "10KB 데이터", data: "Test ".repeat(2500), iterations: 100 },
  { name: "100KB 데이터", data: "Lorem ipsum ".repeat(10000), iterations: 10 },
];

perfTests.forEach(testCase => {
  console.log(`\n${testCase.name} (${testCase.iterations}회 반복):`);
  console.log("  인코더      | 인코딩(평균) | 디코딩(평균) | 총 시간  | 출력 크기");
  console.log("  " + "-".repeat(72));
  
  Object.entries(encoders).forEach(([name, encoder]) => {
    try {
      // 워밍업
      const warmupEncoded = encoder.encode(testCase.data);
      encoder.decode(warmupEncoded);
      
      // 인코딩 벤치마크
      const startEncode = performance.now();
      let encoded = "";
      for (let i = 0; i < testCase.iterations; i++) {
        encoded = encoder.encode(testCase.data);
      }
      const encodeTime = performance.now() - startEncode;
      
      // 디코딩 벤치마크
      const startDecode = performance.now();
      for (let i = 0; i < testCase.iterations; i++) {
        encoder.decode(encoded);
      }
      const decodeTime = performance.now() - startDecode;
      
      const avgEncode = (encodeTime / testCase.iterations).toFixed(3);
      const avgDecode = (decodeTime / testCase.iterations).toFixed(3);
      const total = ((encodeTime + decodeTime) / testCase.iterations).toFixed(3);
      
      console.log(`  ${name.padEnd(11)} | ${avgEncode.padStart(10)}ms | ${avgDecode.padStart(10)}ms | ${total.padStart(7)}ms | ${encoded.length.toString().padStart(9)} 자`);
    } catch (err: any) {
      console.log(`  ${name.padEnd(11)} | 에러: ${err.message}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 5. 특수 케이스 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

const specialCases = [
  { name: "널 문자 포함", data: "Hello\x00World" },
  { name: "모든 ASCII (0-127)", data: Array.from({ length: 128 }, (_, i) => String.fromCharCode(i)).join("") },
  { name: "연속 공백 (100개)", data: " ".repeat(100) },
  { name: "다국어 혼합", data: "Hello 안녕 こんにちは 你好 Привет مرحبا" },
  { name: "긴 한글", data: "가나다라마바사아자차카타파하".repeat(50) },
  { name: "복잡한 유니코드", data: "👨‍👩‍👧‍👦🏴󠁧󠁢󠁥󠁮󠁧󠁿🇰🇷🇺🇸".repeat(10) },
];

specialCases.forEach(testCase => {
  console.log(`\n${testCase.name}:`);
  
  Object.entries(encoders).forEach(([name, encoder]) => {
    try {
      const encoded = encoder.encode(testCase.data);
      const decoded = encoder.decode(encoded);
      const match = decoded === testCase.data;
      reportTest(`${name.padEnd(11)}`, match, match ? undefined : `길이 불일치: ${testCase.data.length} != ${decoded.length}`);
    } catch (err: any) {
      reportTest(`${name.padEnd(11)}`, false, err.message);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 6. 경계 조건 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

const edgeCases = [
  { name: "다양한 길이 (1-100자)", test: () => {
    let allPassed = true;
    for (let len = 1; len <= 100; len++) {
      const data = "x".repeat(len);
      Object.entries(encoders).forEach(([_, encoder]) => {
        try {
          const encoded = encoder.encode(data);
          const decoded = encoder.decode(encoded);
          if (decoded !== data) allPassed = false;
        } catch {
          allPassed = false;
        }
      });
    }
    return allPassed;
  }},
  { name: "패딩 경계 테스트 (특정 길이)", test: () => {
    const testLengths = [1, 2, 3, 7, 8, 14, 15, 16, 31, 32, 63, 64];
    let allPassed = true;
    testLengths.forEach(len => {
      const data = "a".repeat(len);
      Object.entries(encoders).forEach(([_, encoder]) => {
        try {
          const encoded = encoder.encode(data);
          const decoded = encoder.decode(encoded);
          if (decoded !== data) allPassed = false;
        } catch {
          allPassed = false;
        }
      });
    });
    return allPassed;
  }},
  { name: "Buffer 입력 테스트", test: () => {
    const buffer = Buffer.from("Buffer test with all encoders", "utf-8");
    let allPassed = true;
    Object.entries(encoders).forEach(([_, encoder]) => {
      try {
        const encoded = encoder.encode(buffer);
        const decoded = encoder.decode(encoded);
        if (decoded !== buffer.toString()) allPassed = false;
      } catch {
        allPassed = false;
      }
    });
    return allPassed;
  }},
];

edgeCases.forEach(testCase => {
  try {
    const result = testCase.test();
    reportTest(testCase.name, result);
  } catch (err: any) {
    reportTest(testCase.name, false, err.message);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 7. 커스텀 문자셋 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

// Ddu128 커스텀 문자셋
console.log("Ddu128 커스텀 문자셋:");
try {
  const custom128Keys = Array.from({ length: 128 }, (_, i) => {
    const char1 = String.fromCharCode(65 + Math.floor(i / 26) % 26);
    const char2 = String.fromCharCode(97 + Math.floor(i / 4) % 26);
    const char3 = String.fromCharCode(48 + i % 10);
    return `${char1}${char2}${char3}`;
  });
  const customDdu128 = new Ddu128(custom128Keys, "XXX");
  const testStr = "Custom Ddu128 test!";
  const enc = customDdu128.encode(testStr);
  const dec = customDdu128.decode(enc);
  reportTest("128개 커스텀 3글자 키", dec === testStr);
} catch (err: any) {
  reportTest("128개 커스텀 3글자 키", false, err.message);
}

// Custom64 커스텀 문자셋
console.log("\nCustom64 커스텀 문자셋:");
try {
  const customChars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
  const customDdu64 = new Custom64(customChars, "=");
  const testStr = "Custom64 test!";
  const enc = customDdu64.encode(testStr);
  const dec = customDdu64.decode(enc);
  reportTest("64개 커스텀 1글자 키", dec === testStr);
} catch (err: any) {
  reportTest("64개 커스텀 1글자 키", false, err.message);
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 8. 유효성 검사 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

console.log("Ddu128 유효성 검사:");

// 128개 미만
try {
  const tooFew = Array.from({ length: 127 }, (_, i) => `C${i.toString().padStart(2, "0")}`);
  new Ddu128(tooFew, "XXX");
  reportTest("128개 미만 거부", false, "예외가 발생해야 함");
} catch {
  reportTest("128개 미만 거부", true);
}

// 길이 불일치
try {
  const mixedLength = [
    ...Array.from({ length: 64 }, (_, i) => `A${i}`),
    ...Array.from({ length: 64 }, (_, i) => `B${i}X`)
  ];
  new Ddu128(mixedLength, "XXX");
  reportTest("길이 불일치 거부", false, "예외가 발생해야 함");
} catch {
  reportTest("길이 불일치 거부", true);
}

// 중복 문자
try {
  const duplicates = [
    ...Array.from({ length: 127 }, (_, i) => `A${i.toString().padStart(2, "0")}`),
    "A00"
  ];
  new Ddu128(duplicates, "XXXX");
  reportTest("중복 문자 거부", false, "예외가 발생해야 함");
} catch {
  reportTest("중복 문자 거부", true);
}

// 패딩 문자가 셋에 포함
try {
  const validChars = Array.from({ length: 128 }, (_, i) => `A${i.toString().padStart(2, "0")}`);
  new Ddu128(validChars, "A00");
  reportTest("패딩 중복 거부", false, "예외가 발생해야 함");
} catch {
  reportTest("패딩 중복 거부", true);
}

console.log("\nDdu512 유효성 검사:");

// 512개 미만
try {
  const tooFew512 = Array.from({ length: 511 }, (_, i) => `C${i.toString().padStart(2, "0")}`);
  new Ddu512(tooFew512, "XX");
  reportTest("512개 미만 거부", false, "예외가 발생해야 함");
} catch {
  reportTest("512개 미만 거부", true);
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 9. 메모리 효율성 (대용량 데이터) ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

const memoryTest = "A".repeat(100000); // 100KB
console.log(`원본 데이터: ${memoryTest.length.toLocaleString()}자 (${Buffer.from(memoryTest).length.toLocaleString()}바이트)\n`);

Object.entries(encoders).forEach(([name, encoder]) => {
  try {
    const encoded = encoder.encode(memoryTest);
    const encodedBytes = Buffer.from(encoded).length;
    const overhead = encodedBytes - Buffer.from(memoryTest).length;
    const ratio = ((overhead / Buffer.from(memoryTest).length) * 100).toFixed(1);
    const sign = overhead > 0 ? "+" : "";
    
    console.log(`  ${name.padEnd(11)}: ${encodedBytes.toLocaleString().padStart(9)}바이트 (${sign}${overhead.toLocaleString().padStart(7)}바이트, ${sign}${ratio}%)`);
  } catch (err: any) {
    console.log(`  ${name.padEnd(11)}: 에러 - ${err.message}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 최종 결과 및 추천 사항 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

const successRate = ((passedTests / totalTests) * 100).toFixed(1);

console.log(`총 테스트: ${totalTests}개`);
console.log(`통과: ${passedTests}개 (${successRate}%)`);
console.log(`실패: ${failedTests}개\n`);

if (failedTests === 0) {
  console.log("✅ 모든 테스트 통과! 모든 인코더가 정상적으로 작동합니다.\n");
} else {
  console.log(`❌ ${failedTests}개 테스트 실패\n`);
  process.exit(1);
}

console.log("[ 사용 케이스별 추천 ]");
console.log("-".repeat(80));
console.log(`
1. Ddu64 (8문자 인코딩)
   - 사용 케이스: 매우 제한된 문자셋 필요 (예: 한글 8자만 사용)
   - 장점: 특수한 문화적/시각적 요구사항 충족
   - 단점: 출력 크기가 매우 큼 (Base64 대비 약 2배)
   
2. Custom64 (64문자 인코딩) ⭐
   - 사용 케이스: Base64 대체, 일반적인 데이터 인코딩
   - 장점: Base64와 동일한 압축률, 빠른 속도, 호환성
   - 단점: 특별한 장점은 없으나 안정적
   
3. Ddu128 (128문자 인코딩)
   - 사용 케이스: URL-safe하면서 더 나은 압축이 필요한 경우
   - 장점: Base64 대비 약 70% 증가로 적당한 압축률
   - 단점: 2글자 문자열 사용으로 길이가 늘어남
   
4. Ddu512 (512문자 인코딩) ⭐⭐
   - 사용 케이스: 균형잡힌 성능과 압축률이 필요한 대부분의 경우
   - 장점: Base64 대비 약 33% 증가, 빠른 속도, URL-safe
   - 단점: 2글자 문자열 사용
   
5. Ddu2048 (2048문자 인코딩) ⭐⭐⭐
   - 사용 케이스: 큰 데이터셋에서 최고의 압축률이 필요한 경우
   - 장점: Base64 대비 약 9-45% 증가로 가장 좋은 압축률
   - 단점: 2글자 문자열 사용, 약간 느린 속도

추천: 
- 일반 용도 → Custom64 또는 Ddu512
- 최고 압축률 → Ddu2048
- 특수 요구사항 → Ddu64, Ddu128
`);

console.log("╔════════════════════════════════════════════════════════════════════════════╗");
console.log("║                       테스트 완료!                                         ║");
console.log("╚════════════════════════════════════════════════════════════════════════════╝");
