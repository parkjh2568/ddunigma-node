import { Ddu64, DduSetSymbol } from "../index.js";

console.log("╔════════════════════════════════════════════════════════════════════════════╗");
console.log("║            DDU ENIGMA - 전체 통합 테스트 스위트                          ║");
console.log("║            (모든 테스트 케이스 통합)                                      ║");
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

// Base64 호환 charset
const BASE64_CHARS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P",
  "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "a", "b", "c", "d", "e", "f",
  "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v",
  "w", "x", "y", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "/",
];

// 한글 charset (256개)
const koreanCharsRaw = [
  "뜌", "뜍", "뜎", "뜏", "뜐", "뜑", "뜒", "뜓", "뜔", "뜕", "뜖", "뜗", "뜘", "뜙", "뜚", "뜛",
  "뜜", "뜝", "뜞", "뜟", "뜠", "뜡", "뜢", "뜣", "뜤", "뜥", "뜦", "뜧", "뜨", "뜩", "뜪", "뜫",
  "뜬", "뜭", "뜮", "뜯", "뜰", "뜱", "뜲", "뜳", "뜴", "뜵", "뜶", "뜷", "뜸", "뜹", "뜺", "뜻",
  "뜼", "뜽", "뜾", "뜿", "땨", "땩", "땪", "땫", "땬", "땭", "땮", "땯", "땰", "땱", "땲", "땳",
  "땴", "땵", "땶", "땷", "땸", "땹", "땺", "땻", "땼", "땽", "땾", "땿", "떀", "떁", "떂", "떃",
  "떄", "떅", "떆", "떇", "떈", "떉", "떊", "떋", "떌", "떍", "떎", "떏", "떐", "떑", "떒", "떓",
  "떔", "떕", "떖", "떗", "떘", "떙", "떚", "떛", "우", "욱", "욲", "욳", "운", "울", "욶", "욷",
  "움", "웁", "웂", "웃", "웄", "웅", "웆", "웇", "워", "웍", "웎", "웏", "원", "월", "웒", "웓",
  "웕", "웖", "웗", "웘", "웙", "웚", "웛", "위", "윅", "윆", "윇", "윈", "윉", "윊", "윋", "윌",
  "윍", "윎", "윏", "윐", "윑", "윒", "윓", "윔", "윕", "윖", "따", "딱", "딲", "딳", "딴", "딵",
  "딶", "딷", "딸", "딹", "딺", "딻", "딼", "딽", "딾", "딿", "땀", "땁", "땂", "땃", "땄", "땅",
  "땆", "땇", "땈", "땉", "땊", "땋", "때", "땍", "땎", "땏", "땑", "땒", "땓", "땔", "땕", "땖",
  "땗", "땘", "땙", "땚", "땛", "땜", "땝", "땞", "땟", "땠", "땡", "땢", "야", "약", "얂", "얃",
  "얄", "얅", "얆", "얇", "얈", "얉", "얊", "얋", "얌", "얍", "얎", "얏", "양", "얒", "얓", "얔",
  "얕", "얖", "얗", "얘", "얙", "얚", "얛", "얜", "얝", "얞", "얟", "얠", "얡", "얢", "얣", "얤",
  "얥", "얦", "얧", "얨", "얩", "얪", "얫", "얬", "얭", "얮", "얯", "얰", "얱",
];

const uniqueKorean = [...new Set(koreanCharsRaw)];
const koreanChars256 = [...uniqueKorean];
if (koreanChars256.length < 256) {
  const additionalStart = 0xC560;
  for (let i = 0; koreanChars256.length < 256; i++) {
    const char = String.fromCharCode(additionalStart + i);
    if (!koreanChars256.includes(char)) {
      koreanChars256.push(char);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 1. 기본 기능 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const testCases = [
    { name: "빈 문자열", data: "" },
    { name: "단일 문자", data: "A" },
    { name: "짧은 텍스트", data: "Hello World!" },
    { name: "한글", data: "안녕하세요" },
    { name: "특수문자", data: "!@#$%^&*()" },
    { name: "이모지", data: "😀🎉🌍" },
    { name: "혼합", data: "Hello안녕123!😀" },
  ];

  const encoder = new Ddu64(BASE64_CHARS, "=");
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
console.log("[ 2. 멀티바이트 비 2의 제곱수 charset 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  console.log("한글 3개 charset (비 2의 제곱수):");
  try {
    const encoder = new Ddu64("우따야", "뭐", { usePowerOfTwo: false });
    const testData = "안녕하세요 Hello World!";
    const encoded = encoder.encode(testData);
    const decoded = encoder.decode(encoded);
    reportTest("한글 3개 charset", testData === decoded);
  } catch (err: any) {
    reportTest("한글 3개 charset", false, err.message);
  }

  console.log("\n한글 5개 charset:");
  try {
    const encoder = new Ddu64("우따야어오", "뭐", { usePowerOfTwo: false });
    const testData = "테스트 데이터 123";
    const encoded = encoder.encode(testData);
    const decoded = encoder.decode(encoded);
    reportTest("한글 5개 charset", testData === decoded);
  } catch (err: any) {
    reportTest("한글 5개 charset", false, err.message);
  }

  console.log("\n이모지 3개 charset:");
  try {
    const emojiChars = ["😀", "😁", "😂"];
    const encoder = new Ddu64(emojiChars, "🎉", { usePowerOfTwo: false });
    const testData = "emoji test data";
    const encoded = encoder.encode(testData);
    const decoded = encoder.decode(encoded);
    reportTest("이모지 3개 charset", testData === decoded);
  } catch (err: any) {
    reportTest("이모지 3개 charset", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 3. 중복 문자 검증 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  console.log("명시적 중복 문자 (에러 발생 예상):");
  try {
    new Ddu64("우따야야", "뭐", { useBuildErrorReturn: true });
    reportTest("중복 문자 감지 실패", false, "에러가 발생해야 함");
  } catch (err: any) {
    const passed = err.message.includes("duplicate");
    reportTest("중복 문자 감지", passed);
  }

  console.log("\n배열 중복 감지:");
  try {
    const chars = ["A", "B", "C", "D", "A", "E"];
    new Ddu64(chars, "=", { useBuildErrorReturn: true });
    reportTest("배열 중복 감지 실패", false, "에러가 발생해야 함");
  } catch (err: any) {
    const passed = err.message.includes("duplicate") && err.message.includes("A");
    reportTest("배열 중복 감지", passed);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 4. 패딩 형식 검증 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  console.log("잘못된 패딩 형식 - 문자 포함:");
  try {
    const encoder = new Ddu64("우따야어", "뭐");
    const malformed = "우따뭐abc";
    encoder.decode(malformed);
    reportTest("잘못된 패딩 감지 실패", false, "에러가 발생해야 함");
  } catch (err: any) {
    const passed = err.message.includes("Invalid padding");
    reportTest("잘못된 패딩 감지", passed);
  }

  console.log("\n잘못된 패딩 형식 - 음수:");
  try {
    const encoder = new Ddu64("우따야어", "뭐");
    const malformed = "우따뭐-5";
    encoder.decode(malformed);
    reportTest("음수 패딩 감지 실패", false, "에러가 발생해야 함");
  } catch (err: any) {
    const passed = err.message.includes("Invalid padding");
    reportTest("음수 패딩 감지", passed);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 5. 다양한 charset 크기 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  console.log("2의 제곱수 charset:");
  const powerOfTwoSizes = [2, 4, 8, 16, 32, 64, 128, 256];
  
  powerOfTwoSizes.forEach(size => {
    try {
      const chars = Array.from({ length: size }, (_, i) => 
        String.fromCharCode(0x4E00 + i)
      );
      const encoder = new Ddu64(chars, "뭐");
      const testData = `크기${size}테스트`;
      const encoded = encoder.encode(testData);
      const decoded = encoder.decode(encoded);
      reportTest(`  2^${Math.log2(size)} (${size}개)`, testData === decoded);
    } catch (err: any) {
      reportTest(`  2^${Math.log2(size)} (${size}개)`, false, err.message);
    }
  });

  console.log("\n비 2의 제곱수 charset:");
  const nonPowerOfTwoSizes = [3, 5, 7, 10, 50, 100];
  
  nonPowerOfTwoSizes.forEach(size => {
    try {
      const chars = Array.from({ length: size }, (_, i) => 
        String.fromCharCode(0x5000 + i)
      );
      const encoder = new Ddu64(chars, "뭐", { usePowerOfTwo: false });
      const testData = `크기${size}테스트`;
      const encoded = encoder.encode(testData);
      const decoded = encoder.decode(encoded);
      reportTest(`  ${size}개`, testData === decoded);
    } catch (err: any) {
      reportTest(`  ${size}개`, false, err.message);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 6. 다양한 encoding 옵션 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encodings: BufferEncoding[] = ["utf-8", "utf16le", "latin1", "ascii"];
  
  encodings.forEach(enc => {
    try {
      const encoder = new Ddu64(BASE64_CHARS, "=", { encoding: enc });
      const testData = enc === "ascii" ? "Hello123" : "테스트";
      const originalBuffer = Buffer.from(testData, enc);
      const encoded = encoder.encode(originalBuffer);
      const decodedBuffer = encoder.decodeToBuffer(encoded);
      reportTest(`  ${enc}`, originalBuffer.equals(decodedBuffer));
    } catch (err: any) {
      reportTest(`  ${enc}`, false, err.message);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 7. 특수 바이트 패턴 테스트 (decodeToBuffer) ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encoder = new Ddu64(BASE64_CHARS, "=", { encoding: 'latin1' });
  
  console.log("모든 0x00 바이트:");
  try {
    const buffer = Buffer.alloc(100, 0);
    const encoded = encoder.encode(buffer);
    const decodedBuffer = encoder.decodeToBuffer(encoded);
    reportTest("모든 0x00", buffer.equals(decodedBuffer));
  } catch (err: any) {
    reportTest("모든 0x00", false, err.message);
  }

  console.log("\n모든 0xFF 바이트:");
  try {
    const buffer = Buffer.alloc(100, 0xFF);
    const encoded = encoder.encode(buffer);
    const decodedBuffer = encoder.decodeToBuffer(encoded);
    reportTest("모든 0xFF", buffer.equals(decodedBuffer));
  } catch (err: any) {
    reportTest("모든 0xFF", false, err.message);
  }

  console.log("\n반복 패턴 (0xAA, 0x55):");
  try {
    const buffer = Buffer.from([0xAA, 0x55].flatMap(b => Array(50).fill(b)));
    const encoded = encoder.encode(buffer);
    const decodedBuffer = encoder.decodeToBuffer(encoded);
    reportTest("반복 패턴", buffer.equals(decodedBuffer));
  } catch (err: any) {
    reportTest("반복 패턴", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 8. 에러 메시지 표준화 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  console.log("Constructor 에러 메시지:");
  try {
    new Ddu64("ABC", undefined as any, { useBuildErrorReturn: true });
    reportTest("에러 메시지 접두사", false, "에러가 발생해야 함");
  } catch (err: any) {
    const hasPrefix = err.message.includes("[Ddu64 Constructor]");
    reportTest("Constructor 에러 접두사", hasPrefix);
  }

  console.log("\ndecode 에러 메시지:");
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    encoder.decode("잘못된문자열");
  } catch (err: any) {
    const hasPrefix = err.message.includes("[Ddu64 decode]");
    reportTest("decode 에러 접두사", hasPrefix);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 9. getCharSetInfo 메서드 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  console.log("charset 정보 조회:");
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const info = encoder.getCharSetInfo();
    
    const passed = 
      info.charSet.length === 64 &&
      info.paddingChar === "=" &&
      info.charLength === 1 &&
      info.bitLength === 6 &&
      info.usePowerOfTwo === true &&
      info.encoding === "utf-8";
    
    reportTest("getCharSetInfo 정보 정확성", passed);
  } catch (err: any) {
    reportTest("getCharSetInfo 정보 정확성", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 10. 성능 및 안정성 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  console.log("대용량 데이터 (100KB):");
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const testData = "A".repeat(100000);
    const encoded = encoder.encode(testData);
    const decoded = encoder.decode(encoded);
    reportTest("100KB 데이터", testData === decoded);
  } catch (err: any) {
    reportTest("100KB 데이터", false, err.message);
  }

  console.log("\n반복 인코딩/디코딩 (1000회):");
  try {
    const encoder = new Ddu64("우따야", "뭐", { usePowerOfTwo: false });
    const testData = "반복 테스트";
    let allPassed = true;
    
    for (let i = 0; i < 1000; i++) {
      const encoded = encoder.encode(testData);
      const decoded = encoder.decode(encoded);
      if (decoded !== testData) {
        allPassed = false;
        break;
      }
    }
    
    reportTest("1000회 반복", allPassed);
  } catch (err: any) {
    reportTest("1000회 반복", false, err.message);
  }

  console.log("\n다중 인스턴스 동시 사용:");
  try {
    const encoder1 = new Ddu64(BASE64_CHARS, "=");
    const encoder2 = new Ddu64(koreanChars256.slice(0, 64), "뭐");
    const encoder3 = new Ddu64(koreanChars256.slice(0, 100), "뭐", { usePowerOfTwo: false });
    
    const testData = "다중인스턴스테스트";
    
    const decoded1 = encoder1.decode(encoder1.encode(testData));
    const decoded2 = encoder2.decode(encoder2.encode(testData));
    const decoded3 = encoder3.decode(encoder3.encode(testData));
    
    const allPassed = 
      testData === decoded1 && 
      testData === decoded2 && 
      testData === decoded3;
    
    reportTest("3개 인스턴스 동시 사용", allPassed);
  } catch (err: any) {
    reportTest("3개 인스턴스 동시 사용", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 11. 엣지 케이스 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encoder = new Ddu64(BASE64_CHARS, "=");
  
  const edgeCases = [
    { name: "빈 문자열", data: "" },
    { name: "1바이트", data: "A" },
    { name: "8바이트 (경계값)", data: "A".repeat(8) },
    { name: "9바이트 (8+1)", data: "A".repeat(9) },
    { name: "7바이트 (8-1)", data: "A".repeat(7) },
    { name: "널 문자 포함", data: "Hello\x00World" },
    { name: "연속 공백", data: " ".repeat(100) },
  ];
  
  edgeCases.forEach(test => {
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
console.log("[ 최종 결과 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

const successRate = ((passedTests / totalTests) * 100).toFixed(1);

console.log(`총 테스트: ${totalTests}개`);
console.log(`통과: ${passedTests}개 (${successRate}%)`);
console.log(`실패: ${failedTests}개\n`);

if (failedTests === 0) {
  console.log("✅ 모든 테스트 통과! DDU ENIGMA가 정상적으로 작동합니다.\n");
} else {
  console.log(`❌ ${failedTests}개 테스트 실패\n`);
  process.exit(1);
}

console.log("╔════════════════════════════════════════════════════════════════════════════╗");
console.log("║                       전체 통합 테스트 완료!                              ║");
console.log("╚════════════════════════════════════════════════════════════════════════════╝");

