import {
  Ddu64,
  DduSetSymbol,
  CharsetBuilder,
  DduPipeline,
  createEncodeStream,
  createDecodeStream,
} from "../index.js";
import { Readable } from "stream";

console.log("╔════════════════════════════════════════════════════════════════════════════╗");
console.log("║            DDU ENIGMA - 종합 테스트 스위트                                ║");
console.log("║            (기능, 성능, 고급 기능 통합 테스트)                             ║");
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

// 공통 인코더 인스턴스
const encoders = {
  "Ddu64 (우따야)": new Ddu64("우따야", "뭐"),
  "Ddu64 (DEFAULT)": new Ddu64(undefined, undefined, { dduSetSymbol: DduSetSymbol.ONECHARSET }),
  "Ddu64 (DDU)": new Ddu64(undefined, undefined, { dduSetSymbol: DduSetSymbol.DDU }),
  "Ddu64 (1024)": new Ddu64(undefined, undefined, { dduSetSymbol: DduSetSymbol.TWOCHARSET }),
  "Ddu64 (32768)": new Ddu64(undefined, undefined, { dduSetSymbol: DduSetSymbol.THREECHARSET }),
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1: 기능 테스트
// ═══════════════════════════════════════════════════════════════════════════════

console.log("═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 1. 모든 인코더 기본 기능 테스트 ]");
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
  { name: "긴 한글 스토리", data: "안녕나안보고싶었어?스스로칭찬하려니까부담되는걸?하지만기록은완성해야하니까어쩔수없지~엘리시아는상냥하고,친근하고,귀엽고,똑똑하고아름다운소녀야.그녀의초대를거절하거나그녀를냉정하게대할수있는사람은없어.전설속의엘프처럼모든이의마음을사로잡고13명의영웅을이곳에모았으면서첫번째자리를양보하는겸손함까지...영웅들에게엘리시아는가장믿음직스럽고사랑받는동료야.너희도그렇게생각하지?1" },
];

Object.entries(encoders).forEach(([name, encoder]) => {
  console.log(`\n${name}:`);
  testData.forEach(test => {
    try {
      const encoded = encoder.encode(test.data);
      const decoded = encoder.decode(encoded);
      reportTest(test.name, decoded === test.data);
    } catch (err: any) {
      reportTest(test.name, false, err.message);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 2. 다양한 charset 크기 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  console.log("2의 제곱수 charset:");
  const powerOfTwoSizes = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
  powerOfTwoSizes.forEach(size => {
    try {
      const chars = Array.from({ length: size }, (_, i) => String.fromCharCode(0x4E00 + i));
      const ddu = new Ddu64(chars, "뭐");
      const td = `크기${size}테스트`;
      const encoded = ddu.encode(td);
      const decoded = ddu.decode(encoded);
      reportTest(`  2^${Math.log2(size)} (${size}개)`, td === decoded);
    } catch (err: any) {
      reportTest(`  2^${Math.log2(size)} (${size}개)`, false, err.message);
    }
  });

  console.log("\n비 2의 제곱수 charset:");
  const nonPowerOfTwoSizes = [3, 5, 7, 10, 15, 20, 50, 100, 200, 500];
  nonPowerOfTwoSizes.forEach(size => {
    try {
      const chars = Array.from({ length: size }, (_, i) => String.fromCharCode(0x5000 + i));
      const ddu = new Ddu64(chars, "뭐", { usePowerOfTwo: false });
      const td = `크기${size}테스트`;
      const encoded = ddu.encode(td);
      const decoded = ddu.decode(encoded);
      reportTest(`  ${size}개`, td === decoded);
    } catch (err: any) {
      reportTest(`  ${size}개`, false, err.message);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 3. 다양한 encoding 옵션 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encodingTests: { name: string; encoding: BufferEncoding; data: string }[] = [
    { name: "UTF-8 (기본)", encoding: "utf-8", data: "Hello 안녕하세요 こんにちは 你好 🎉" },
    { name: "UTF-16LE", encoding: "utf16le", data: "Hello World 안녕하세요" },
    { name: "ASCII", encoding: "ascii", data: "Hello World 123 !@#$%" },
    { name: "Latin1", encoding: "latin1", data: "Café résumé naïve" },
    { name: "Base64", encoding: "base64", data: "SGVsbG8gV29ybGQh" },
    { name: "Hex", encoding: "hex", data: "48656c6c6f20576f726c6421" },
  ];

  encodingTests.forEach(test => {
    try {
      const encoder = new Ddu64(BASE64_CHARS, "=", { encoding: test.encoding });
      const originalBuffer = Buffer.from(test.data, test.encoding);
      const encoded = encoder.encode(originalBuffer);
      const decodedBuffer = encoder.decodeToBuffer(encoded);
      reportTest(`  ${test.name}`, originalBuffer.equals(decodedBuffer));
    } catch (err: any) {
      reportTest(`  ${test.name}`, false, err.message);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 4. 특수 바이트 패턴 및 비트 패턴 테스트 (0x00~0xFF) ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const bitPatternTests: { name: string; data: Buffer }[] = [];

  // 단일 바이트 (0x00~0xFF)
  for (let i = 0; i <= 255; i++) {
    bitPatternTests.push({ name: `0x${i.toString(16).padStart(2, '0').toUpperCase()}`, data: Buffer.from([i]) });
  }

  // 패턴 테스트
  [0x00, 0xFF, 0xAA, 0x55, 0xCC, 0x33, 0xF0, 0x0F].forEach(p => {
    bitPatternTests.push({ name: `패턴 0x${p.toString(16).padStart(2, '0')} (64B)`, data: Buffer.alloc(64, p) });
  });

  // 순차 증가/감소
  bitPatternTests.push({ name: "순차 0x00~0xFF", data: Buffer.from(Array.from({ length: 256 }, (_, i) => i)) });
  bitPatternTests.push({ name: "순차 0xFF~0x00", data: Buffer.from(Array.from({ length: 256 }, (_, i) => 255 - i)) });

  // 경계 패턴
  bitPatternTests.push({ name: "0x00 (512B)", data: Buffer.alloc(512, 0x00) });
  bitPatternTests.push({ name: "0xFF (512B)", data: Buffer.alloc(512, 0xFF) });

  // 랜덤 패턴
  for (let i = 0; i < 20; i++) {
    const len = Math.floor(Math.random() * 200) + 1;
    const rd = Buffer.alloc(len);
    for (let j = 0; j < len; j++) rd[j] = Math.floor(Math.random() * 256);
    bitPatternTests.push({ name: `랜덤 ${i + 1} (${len}B)`, data: rd });
  }

  // UTF-8 멀티바이트
  bitPatternTests.push({ name: "UTF-8 2바이트", data: Buffer.from("áéíóú") });
  bitPatternTests.push({ name: "UTF-8 3바이트", data: Buffer.from("한글테스트") });
  bitPatternTests.push({ name: "UTF-8 4바이트", data: Buffer.from("🎉😀🌍") });
  bitPatternTests.push({ name: "혼합 멀티바이트", data: Buffer.from("Aáä한🎉") });

  const latin1Encoders = {
    "Ddu64 (DEFAULT)": new Ddu64(undefined, undefined, { dduSetSymbol: DduSetSymbol.ONECHARSET, encoding: 'latin1' }),
    "Ddu64 (DDU)": new Ddu64(undefined, undefined, { dduSetSymbol: DduSetSymbol.DDU, encoding: 'latin1' }),
    "Ddu64 (1024)": new Ddu64(undefined, undefined, { dduSetSymbol: DduSetSymbol.TWOCHARSET, encoding: 'latin1' }),
  };

  let totalBitTests = 0;
  let passedBitTests = 0;

  Object.entries(latin1Encoders).forEach(([name, encoder]) => {
    console.log(`\n${name}:`);
    let encoderPassed = 0;
    bitPatternTests.forEach(test => {
      const encoded = encoder.encode(test.data);
      const decoded = encoder.decode(encoded);
      const decodedBuffer = Buffer.from(decoded, 'latin1');
      totalBitTests++;
      totalTests++;
      if (decodedBuffer.equals(test.data)) {
        encoderPassed++;
        passedBitTests++;
        passedTests++;
      } else {
        failedTests++;
        console.log(`  ✗ ${test.name}: 디코딩 불일치`);
      }
    });
    console.log(`  ${name} 비트 패턴: ${encoderPassed}/${bitPatternTests.length} 통과`);
  });

  console.log(`\n전체 비트 패턴: ${passedBitTests}/${totalBitTests} 통과`);
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 5. 경계 조건 및 엣지 케이스 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  // 다양한 길이 (1-100자)
  {
    let allPassed = true;
    for (let len = 1; len <= 100; len++) {
      const data = "x".repeat(len);
      Object.values(encoders).forEach(encoder => {
        try {
          if (encoder.decode(encoder.encode(data)) !== data) allPassed = false;
        } catch { allPassed = false; }
      });
    }
    reportTest("다양한 길이 (1-100자) 모든 인코더", allPassed);
  }

  // 패딩 경계
  {
    const testLengths = [1, 2, 3, 7, 8, 14, 15, 16, 31, 32, 63, 64];
    let allPassed = true;
    testLengths.forEach(len => {
      const data = "a".repeat(len);
      Object.values(encoders).forEach(encoder => {
        try {
          if (encoder.decode(encoder.encode(data)) !== data) allPassed = false;
        } catch { allPassed = false; }
      });
    });
    reportTest("패딩 경계 테스트 (특정 길이)", allPassed);
  }

  // 특수 케이스
  const specialCases = [
    { name: "널 문자 포함", data: "Hello\x00World" },
    { name: "연속 공백 (100개)", data: " ".repeat(100) },
    { name: "다국어 혼합", data: "Hello 안녕 こんにちは 你好 Привет مرحبا" },
    { name: "긴 한글", data: "가나다라마바사아자차카타파하".repeat(50) },
    { name: "복잡한 유니코드", data: "👨‍👩‍👧‍👦🏴󠁧󠁢󠁥󠁮󠁧󠁿🇰🇷🇺🇸".repeat(10) },
  ];

  specialCases.forEach(tc => {
    Object.entries(encoders).forEach(([name, encoder]) => {
      try {
        const decoded = encoder.decode(encoder.encode(tc.data));
        reportTest(`${tc.name} (${name})`, decoded === tc.data);
      } catch (err: any) {
        reportTest(`${tc.name} (${name})`, false, err.message);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 6. 커스텀 Charset 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  // 한글 256개
  {
    const ddu = new Ddu64(koreanChars256, "뭐");
    const td = "안녕하세요12";
    reportTest("한글 256개 인코딩/디코딩", td === ddu.decode(ddu.encode(td)));
  }

  // 멀티바이트 charsets
  {
    try {
      const emoji8 = ["😀", "😁", "😂", "😃", "😄", "😅", "😆", "😇"];
      const ddu = new Ddu64(emoji8, "🎉");
      const td = "emoji test";
      reportTest("이모지 charset (8개)", td === ddu.decode(ddu.encode(td)));
    } catch (err: any) {
      reportTest("이모지 charset (8개)", false, err.message);
    }
  }

  // 특수 패딩 문자
  {
    const specialPaddings = ["=", "-", "_", "~", "!", "@", "#"];
    specialPaddings.forEach(pad => {
      try {
        const ddu = new Ddu64(BASE64_CHARS, pad);
        const td = "특수패딩테스트";
        reportTest(`  패딩 "${pad}"`, td === ddu.decode(ddu.encode(td)));
      } catch (err: any) {
        reportTest(`  패딩 "${pad}"`, false, err.message);
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 7. 압축(compress) 종합 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encoder = new Ddu64(BASE64_CHARS, "=");

  const compressTestCases = [
    { name: "짧은 영문", data: "Hello World!" },
    { name: "반복 패턴", data: "ABCD".repeat(250) },
    { name: "긴 영문", data: "The quick brown fox jumps over the lazy dog. ".repeat(25) },
    { name: "한글 텍스트", data: "안녕하세요! 반갑습니다. 오늘 날씨가 좋네요. ".repeat(20) },
    { name: "혼합 텍스트", data: "Hello안녕123!@#가나다ABC".repeat(40) },
    { name: "JSON 데이터", data: JSON.stringify({ users: Array(50).fill({ name: "Test", age: 25, email: "test@test.com" }) }) },
    { name: "대용량 (10KB)", data: "Lorem ipsum dolor sit amet. ".repeat(400) },
  ];

  console.log("┌───────────────────┬──────────┬──────────┬──────────┬──────────┬────────────┐");
  console.log("│ 데이터 타입       │ 원문(자) │ 기존(자) │ 압축(자) │ 압축률   │ 디코딩검증 │");
  console.log("├───────────────────┼──────────┼──────────┼──────────┼──────────┼────────────┤");

  let allCompressionPassed = true;
  for (const tc of compressTestCases) {
    try {
      const normalEncoded = encoder.encode(tc.data);
      const compressEncoded = encoder.encode(tc.data, { compress: true });
      const normalOk = encoder.decode(normalEncoded) === tc.data;
      const compressOk = encoder.decode(compressEncoded) === tc.data;
      const bothOk = normalOk && compressOk;
      if (!bothOk) allCompressionPassed = false;

      const ratio = ((1 - compressEncoded.length / normalEncoded.length) * 100).toFixed(1);
      const ratioStr = compressEncoded.length < normalEncoded.length ? `${ratio}%↓` : `+${Math.abs(parseFloat(ratio))}%`;
      console.log(`│ ${tc.name.padEnd(17)} │ ${tc.data.length.toString().padStart(8)} │ ${normalEncoded.length.toString().padStart(8)} │ ${compressEncoded.length.toString().padStart(8)} │ ${ratioStr.padStart(8)} │ ${bothOk ? "✓ 정상" : "✗ 실패"}     │`);
    } catch (err: any) {
      allCompressionPassed = false;
      console.log(`│ ${tc.name.padEnd(17)} │ 에러: ${err.message.substring(0, 50).padEnd(56)} │`);
    }
  }
  console.log("└───────────────────┴──────────┴──────────┴──────────┴──────────┴────────────┘");
  reportTest("압축 비교 테이블 검증", allCompressionPassed);

  // 다양한 인코더에서 압축
  console.log("\n  다양한 인코더에서 압축:");
  const compressData = "압축 테스트용 데이터입니다. 반복되는 패턴이 있으면 압축률이 높아집니다. ".repeat(30);
  Object.entries(encoders).forEach(([name, enc]) => {
    try {
      const compressEncoded = enc.encode(compressData, { compress: true });
      const decoded = enc.decode(compressEncoded);
      reportTest(`압축 (${name})`, decoded === compressData);
    } catch (err: any) {
      reportTest(`압축 (${name})`, false, err.message);
    }
  });

  // 압축 Fuzzing
  console.log("\n  압축 랜덤 Fuzzing (100회):");
  let fuzzPassed = 0;
  for (let i = 0; i < 100; i++) {
    try {
      const length = Math.floor(Math.random() * 5000) + 100;
      let rd = "";
      for (let j = 0; j < length; j++) rd += String.fromCharCode(Math.floor(Math.random() * 0xD800));
      const encoded = encoder.encode(rd, { compress: true });
      if (encoder.decode(encoded) === rd) fuzzPassed++;
    } catch { /* skip */ }
  }
  reportTest(`압축 Fuzzing (${fuzzPassed}/100)`, fuzzPassed === 100);
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 8. URL-Safe 모드 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=", { urlSafe: true });
    const td = "Hello World! 안녕하세요";
    const encoded = encoder.encode(td);
    const hasUnsafe = encoded.includes("+") || encoded.includes("/");
    reportTest("URL-Safe 변환 (unsafe 문자 없음)", !hasUnsafe);
    reportTest("URL-Safe 디코딩", td === encoder.decode(encoded));
  } catch (err: any) {
    reportTest("URL-Safe 모드", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 9. 체크섬 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const td = "Hello World with checksum!";
    const encoded = encoder.encode(td, { checksum: true });
    reportTest("체크섬 마커 포함", encoded.includes("CHK"));
    reportTest("체크섬 검증 성공", td === encoder.decode(encoded, { checksum: true }));
  } catch (err: any) {
    reportTest("체크섬 인코딩", false, err.message);
  }

  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const encoded = encoder.encode("Test data", { checksum: true });
    const tampered = encoded.replace(/CHK[0-9a-f]{8}$/i, "CHK00000000");
    encoder.decode(tampered, { checksum: true });
    reportTest("체크섬 불일치 감지", false, "에러가 발생해야 함");
  } catch (err: any) {
    reportTest("체크섬 불일치 감지", err.message.includes("mismatch"));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 10. 청크 분할 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const td = "A".repeat(100);
    const encoded = encoder.encode(td, { chunkSize: 20, chunkSeparator: "\n" });
    const lines = encoded.split("\n");
    const allChunksCorrect = lines.slice(0, -1).every(line => line.length === 20);
    reportTest("청크 분할 (20자)", allChunksCorrect);
    reportTest("청크 분할 디코딩", td === encoder.decode(encoded));
  } catch (err: any) {
    reportTest("청크 분할", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 11. 암호화 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=", { encryptionKey: "my-secret-key-123" });
    const td = "Secret message! 비밀 메시지!";
    const encoded = encoder.encode(td);
    reportTest("암호화 마커 포함", encoded.includes("ENC"));
    reportTest("암호화/복호화 성공", td === encoder.decode(encoded));
  } catch (err: any) {
    reportTest("암호화 테스트", false, err.message);
  }

  try {
    const enc1 = new Ddu64(BASE64_CHARS, "=", { encryptionKey: "key1" });
    const enc2 = new Ddu64(BASE64_CHARS, "=", { encryptionKey: "key2" });
    const encoded = enc1.encode("Secret");
    enc2.decode(encoded);
    reportTest("다른 키로 복호화 실패", false, "에러가 발생해야 함");
  } catch (err: any) {
    reportTest("다른 키로 복호화 실패", true);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 12. 진행률 콜백 / 비동기 / 통계 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  // 진행률 콜백
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const progressUpdates: number[] = [];
    encoder.encode("A".repeat(1000), { onProgress: (info) => progressUpdates.push(info.percent) });
    reportTest("진행률 콜백 호출", progressUpdates.length >= 2);
    reportTest("진행률 100% 도달", progressUpdates.includes(100));
  } catch (err: any) {
    reportTest("진행률 콜백", false, err.message);
  }

  // 통계
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const stats = encoder.getStats("Test data for statistics!");
    reportTest("통계: originalSize", stats.originalSize === "Test data for statistics!".length);
    reportTest("통계: encodedSize", stats.encodedSize > 0);
    reportTest("통계: charsetSize", stats.charsetSize === 64);

    const statsComp = encoder.getStats("Test data for statistics!", { compress: true });
    reportTest("통계: compressionRatio 존재", statsComp.compressionRatio !== undefined);
  } catch (err: any) {
    reportTest("통계/분석", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 13. CharsetBuilder 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    const chars1 = CharsetBuilder.fromUnicodeRange(0x4e00, 0x4e3f).build();
    reportTest("CharsetBuilder: 유니코드 범위", chars1.length === 64);

    const chars2 = CharsetBuilder.base64().build();
    reportTest("CharsetBuilder: Base64", chars2.length === 64);

    const chars3 = CharsetBuilder.fromString("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")
      .excludeConfusing().build();
    reportTest("CharsetBuilder: 혼동 문자 제외", !chars3.includes("0") && !chars3.includes("O"));

    const chars4 = CharsetBuilder.fromString("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
      .limitToPowerOfTwo().build();
    reportTest("CharsetBuilder: 2의 제곱수 제한", chars4.length === 32);

    const { charset, padding } = CharsetBuilder.base64().buildWithPadding();
    reportTest("CharsetBuilder: 패딩 생성", charset.length === 64 && padding === "=");

    const chars5 = CharsetBuilder.base64().shuffle(12345).build();
    const chars6 = CharsetBuilder.base64().shuffle(12345).build();
    reportTest("CharsetBuilder: 시드 셔플 일관성", chars5.join("") === chars6.join(""));
  } catch (err: any) {
    reportTest("CharsetBuilder", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 14. DduPipeline 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");

    // 압축 → 인코딩
    const p1 = new DduPipeline().compress().encode(encoder);
    const td1 = "A".repeat(1000);
    const r1 = p1.processToString(td1);
    reportTest("DduPipeline: 압축 → 인코딩 → 역순", td1 === p1.reverse().processToString(r1));

    // 암호화 → 인코딩
    const p2 = new DduPipeline().encrypt("secret-key").encode(encoder);
    const td2 = "Secret message";
    const r2 = p2.processToString(td2);
    reportTest("DduPipeline: 암호화 → 인코딩 → 역순", td2 === p2.reverse().processToString(r2));

    // 압축 → 암호화 → 인코딩
    const p3 = new DduPipeline().compress().encrypt("my-key").encode(encoder);
    const td3 = "B".repeat(500);
    const r3 = p3.processToString(td3);
    reportTest("DduPipeline: 압축 → 암호화 → 인코딩 → 역순", td3 === p3.reverse().processToString(r3));

    // 복제
    const cloned = p3.clone();
    reportTest("DduPipeline: 복제", cloned.stepCount === p3.stepCount);
  } catch (err: any) {
    reportTest("DduPipeline", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 15. 랜덤 데이터 Fuzzing ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encoder = new Ddu64(BASE64_CHARS, "=");
  let allPassed = true;
  let failedDetails = "";

  for (let i = 0; i < 50; i++) {
    const length = Math.floor(Math.random() * 100) + 1;
    let randomStr = "";
    for (let j = 0; j < length; j++) {
      randomStr += String.fromCharCode(Math.floor(Math.random() * (0xD7A3 - 0x0020)) + 0x0020);
    }
    try {
      if (encoder.decode(encoder.encode(randomStr)) !== randomStr) {
        allPassed = false;
        failedDetails = `Failed at iter ${i}`;
        break;
      }
    } catch (e: any) {
      allPassed = false;
      failedDetails = `Error at iter ${i}: ${e.message}`;
      break;
    }
  }
  reportTest("랜덤 문자열 50회 Fuzzing", allPassed, failedDetails);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2: 성능 벤치마크
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 16. 성능 벤치마크 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const perfTests = [
    { name: "1KB", data: "A".repeat(1000), iterations: 1000 },
    { name: "10KB", data: "Test ".repeat(2500), iterations: 100 },
    { name: "100KB", data: "Lorem ipsum ".repeat(10000), iterations: 10 },
  ];

  perfTests.forEach(tc => {
    console.log(`\n${tc.name} (${tc.iterations}회):`);
    console.log("  인코더          | 인코딩(평균) | 디코딩(평균) | 출력 크기");
    console.log("  " + "-".repeat(65));

    Object.entries(encoders).forEach(([name, encoder]) => {
      try {
        const warmup = encoder.encode(tc.data);
        encoder.decode(warmup);

        const startEnc = performance.now();
        let encoded = "";
        for (let i = 0; i < tc.iterations; i++) encoded = encoder.encode(tc.data);
        const encTime = performance.now() - startEnc;

        const startDec = performance.now();
        for (let i = 0; i < tc.iterations; i++) encoder.decode(encoded);
        const decTime = performance.now() - startDec;

        console.log(`  ${name.padEnd(17)} | ${(encTime / tc.iterations).toFixed(3).padStart(10)}ms | ${(decTime / tc.iterations).toFixed(3).padStart(10)}ms | ${encoded.length.toString().padStart(9)} 자`);
      } catch (err: any) {
        console.log(`  ${name.padEnd(17)} | 에러: ${err.message}`);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 17. 메모리 누수 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  console.log("  인코더          | 시작메모리 | 종료메모리 | GC후 | 누수여부");
  console.log("  " + "-".repeat(70));

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  Object.entries(encoders).forEach(([name, encoder]) => {
    try {
      if (global.gc) global.gc();
      const startMem = process.memoryUsage().heapUsed;

      for (let i = 0; i < 5000; i++) {
        const encoded = encoder.encode("메모리 누수 테스트 데이터");
        encoder.decode(encoded);
      }

      const endMem = process.memoryUsage().heapUsed;
      if (global.gc) global.gc();
      const afterGC = process.memoryUsage().heapUsed;

      const leak = (afterGC - startMem) > 1024 * 1024;
      console.log(`  ${name.padEnd(17)} | ${formatBytes(startMem).padStart(10)} | ${formatBytes(endMem).padStart(10)} | ${formatBytes(afterGC).padStart(4)} | ${leak ? "⚠️ 의심" : "✅ 없음"}`);
    } catch (err: any) {
      console.log(`  ${name.padEnd(17)} | 에러: ${err.message}`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 18. 장시간 안정성 테스트 (5초) ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  console.log("  인코더          | 총 처리수 | 평균속도(op/s) | 오류수 | 안정성");
  console.log("  " + "-".repeat(70));

  Object.entries(encoders).forEach(([name, encoder]) => {
    try {
      const startTime = performance.now();
      const duration = 5000;
      let iterations = 0;
      let errors = 0;
      const td = "Stability Test Data";

      while (performance.now() - startTime < duration) {
        try {
          if (encoder.decode(encoder.encode(td)) !== td) errors++;
          iterations++;
        } catch { errors++; }
      }

      const elapsed = (performance.now() - startTime) / 1000;
      const opsPerSec = iterations / elapsed;
      const stability = errors === 0 ? "✅ 안정" : "⚠️ 주의";

      console.log(`  ${name.padEnd(17)} | ${iterations.toString().padStart(9)} | ${opsPerSec.toFixed(0).padStart(14)} | ${errors.toString().padStart(6)} | ${stability}`);
    } catch (err: any) {
      console.log(`  ${name.padEnd(17)} | 에러: ${err.message}`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3: 스트림 & 비동기 테스트 (최종)
// ═══════════════════════════════════════════════════════════════════════════════

async function runAsyncTests() {
  console.log("\n═══════════════════════════════════════════════════════════════════════════════");
  console.log("[ 19. 스트림 테스트 ]");
  console.log("═══════════════════════════════════════════════════════════════════════════════\n");

  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const td = "Stream test data! ".repeat(100);

    // 인코드 스트림
    const encodeStream = createEncodeStream(encoder);
    const chunks: string[] = [];
    await new Promise<void>((resolve, reject) => {
      Readable.from([Buffer.from(td)])
        .pipe(encodeStream)
        .on("data", (chunk: Buffer) => chunks.push(chunk.toString()))
        .on("end", resolve)
        .on("error", reject);
    });
    const encoded = chunks.join("");
    reportTest("스트림 인코딩", encoded.length > 0);

    // 디코드 스트림
    const decodeStream = createDecodeStream(encoder);
    const decodedChunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      Readable.from([Buffer.from(encoded)])
        .pipe(decodeStream)
        .on("data", (chunk: Buffer) => decodedChunks.push(chunk))
        .on("end", resolve)
        .on("error", reject);
    });
    const decoded = Buffer.concat(decodedChunks).toString();
    reportTest("스트림 디코딩", decoded === td);
  } catch (err: any) {
    reportTest("스트림 테스트", false, err.message);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════════════════════════════════════");
  console.log("[ 20. 비동기 인코딩/디코딩 테스트 ]");
  console.log("═══════════════════════════════════════════════════════════════════════════════\n");

  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const td = "Async test data!";
    const encoded = await encoder.encodeAsync(td);
    reportTest("비동기 인코딩", encoded.length > 0);
    const decoded = await encoder.decodeAsync(encoded);
    reportTest("비동기 디코딩", td === decoded);
    const decodedBuffer = await encoder.decodeToBufferAsync(encoded);
    reportTest("비동기 Buffer 디코딩", decodedBuffer.toString() === td);
  } catch (err: any) {
    reportTest("비동기 인코딩/디코딩", false, err.message);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════════════════════════════════════");
  console.log("[ 21. 비동기 동시성 Fuzzing ]");
  console.log("═══════════════════════════════════════════════════════════════════════════════\n");

  {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const ITERATIONS = 1000;
    const tasks: Promise<boolean>[] = [];

    for (let i = 0; i < ITERATIONS; i++) {
      tasks.push(new Promise<boolean>((resolve) => {
        setImmediate(() => {
          try {
            const len = Math.floor(Math.random() * 1000) + 1;
            const buffer = Buffer.allocUnsafe(len);
            for (let j = 0; j < len; j++) buffer[j] = Math.floor(Math.random() * 256);
            resolve(buffer.equals(encoder.decodeToBuffer(encoder.encode(buffer))));
          } catch { resolve(false); }
        });
      }));
    }

    const results = await Promise.all(tasks);
    const failures = results.filter(r => !r).length;
    reportTest(`비동기 Fuzzing ${ITERATIONS}회`, failures === 0);
  }

  // 최종 결과
  console.log("\n═══════════════════════════════════════════════════════════════════════════════");
  console.log("[ 최종 결과 ]");
  console.log("═══════════════════════════════════════════════════════════════════════════════\n");

  const successRate = ((passedTests / totalTests) * 100).toFixed(1);
  console.log(`총 테스트: ${totalTests}개`);
  console.log(`통과: ${passedTests}개 (${successRate}%)`);
  console.log(`실패: ${failedTests}개\n`);

  if (failedTests === 0) {
    console.log("✅ 모든 종합 테스트 통과!\n");
  } else {
    console.log(`❌ ${failedTests}개 테스트 실패\n`);
    process.exit(1);
  }

  console.log("╔════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                       종합 테스트 완료!                                    ║");
  console.log("╚════════════════════════════════════════════════════════════════════════════╝");
}

runAsyncTests();
