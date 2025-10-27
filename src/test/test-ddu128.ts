import { Ddu128 } from "../index.js";

console.log("=== Ddu128 테스트 시작 ===\n");

// 테스트 1: 기본 인코딩/디코딩
console.log("테스트 1: 기본 인코딩/디코딩");
const ddu128 = new Ddu128();
const testString1 = "Hello, Ddu128! 안녕하세요!";
const encoded1 = ddu128.encode(testString1);
console.log(`원본: ${testString1}`);
console.log(`인코딩: ${encoded1}`);
const decoded1 = ddu128.decode(encoded1);
console.log(`디코딩: ${decoded1}`);
console.log(`결과: ${testString1 === decoded1 ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 2: KR 문자 세트
console.log("테스트 2: KR 문자 세트 (3글자 키)");
const testString2 = "128가지 키로 인코딩";
const encoded2 = ddu128.encode(testString2, { dduSetSymbol: "KR" });
console.log(`원본: ${testString2}`);
console.log(`인코딩: ${encoded2}`);
const decoded2 = ddu128.decode(encoded2, { dduSetSymbol: "KR" });
console.log(`디코딩: ${decoded2}`);
console.log(`결과: ${testString2 === decoded2 ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 3: 커스텀 128개 키
console.log("테스트 3: 커스텀 128개 3글자 키");
const custom128Keys: string[] = [];
for (let i = 0; i < 128; i++) {
  const char1 = String.fromCharCode(65 + Math.floor(i / 26) % 26); // A-Z
  const char2 = String.fromCharCode(97 + Math.floor(i / 4) % 26); // a-z
  const char3 = String.fromCharCode(48 + i % 10); // 0-9
  custom128Keys.push(`${char1}${char2}${char3}`);
}
const customDdu128 = new Ddu128(custom128Keys, "XXX");
const testString3 = "Custom 128 keys test";
const encoded3 = customDdu128.encode(testString3);
console.log(`원본: ${testString3}`);
console.log(`인코딩 샘플: ${encoded3.substring(0, 30)}...`);
const decoded3 = customDdu128.decode(encoded3);
console.log(`디코딩: ${decoded3}`);
console.log(`결과: ${testString3 === decoded3 ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 4: URL 안전성 확인
console.log("테스트 4: URL 안전성");
const urlTestString = "https://example.com?param=value&other=123";
const encodedUrl = ddu128.encode(urlTestString, { dduSetSymbol: "KR" });
console.log(`원본: ${urlTestString}`);
console.log(`인코딩: ${encodedUrl}`);
// URL에 포함될 수 있는지 확인
const urlSafeChars = /^[A-Za-z0-9]+$/;
const isUrlSafe = urlSafeChars.test(encodedUrl);
console.log(`URL-safe 여부: ${isUrlSafe ? "✓ 안전" : "✗ 비안전"}`);
const decodedUrl = ddu128.decode(encodedUrl, { dduSetSymbol: "KR" });
console.log(`디코딩: ${decodedUrl}`);
console.log(`결과: ${urlTestString === decodedUrl ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 5: 긴 텍스트 (Base64와 비교)
console.log("테스트 5: 긴 텍스트 - Base64와 크기 비교");
const longText = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(20);
const encodedLong = ddu128.encode(longText);
const base64Encoded = Buffer.from(longText).toString("base64");
console.log(`원본 길이: ${longText.length} bytes`);
console.log(`Ddu128 인코딩 길이: ${encodedLong.length} bytes`);
console.log(`Base64 인코딩 길이: ${base64Encoded.length} bytes`);
console.log(`압축률: ${((1 - encodedLong.length / longText.length) * 100).toFixed(2)}%`);
const decodedLong = ddu128.decode(encodedLong);
console.log(`결과: ${longText === decodedLong ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 6: 특수 문자 및 이모지
console.log("테스트 6: 특수 문자 및 이모지");
const specialText = "Hello 🌍! Special chars: @#$%^&*() 한글: 가나다 😀🎉";
const encodedSpecial = ddu128.encode(specialText);
console.log(`원본: ${specialText}`);
console.log(`인코딩 샘플: ${encodedSpecial.substring(0, 30)}...`);
const decodedSpecial = ddu128.decode(encodedSpecial);
console.log(`디코딩: ${decodedSpecial}`);
console.log(`결과: ${specialText === decodedSpecial ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 7: 빈 문자열 및 짧은 문자열
console.log("테스트 7: 빈 문자열 및 짧은 문자열");
const emptyString = "";
const encodedEmpty = ddu128.encode(emptyString);
const decodedEmpty = ddu128.decode(encodedEmpty);
console.log(`빈 문자열: ${emptyString === decodedEmpty ? "✓ 성공" : "✗ 실패"}`);

const shortString = "A";
const encodedShort = ddu128.encode(shortString);
const decodedShort = ddu128.decode(encodedShort);
console.log(`1글자 ("A"): ${shortString === decodedShort ? "✓ 성공" : "✗ 실패"}`);

const twoChars = "AB";
const encodedTwo = ddu128.encode(twoChars);
const decodedTwo = ddu128.decode(encodedTwo);
console.log(`2글자 ("AB"): ${twoChars === decodedTwo ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 8: 성능 테스트
console.log("테스트 8: 성능 테스트 (10,000회 반복)");
const perfTestString = "Performance test string 123!@# 성능테스트";
const iterations = 10000;

const startEncode = performance.now();
for (let i = 0; i < iterations; i++) {
  ddu128.encode(perfTestString);
}
const endEncode = performance.now();

const encodedPerf = ddu128.encode(perfTestString);
const startDecode = performance.now();
for (let i = 0; i < iterations; i++) {
  ddu128.decode(encodedPerf);
}
const endDecode = performance.now();

console.log(`${iterations}회 인코딩 평균: ${((endEncode - startEncode) / iterations).toFixed(4)}ms`);
console.log(`${iterations}회 디코딩 평균: ${((endDecode - startDecode) / iterations).toFixed(4)}ms\n`);

// 테스트 9: Buffer 입력
console.log("테스트 9: Buffer 입력");
const bufferData = Buffer.from("Buffer test with Ddu128", "utf-8");
const encodedBuffer = ddu128.encode(bufferData);
console.log(`원본: ${bufferData.toString()}`);
console.log(`인코딩 샘플: ${encodedBuffer.substring(0, 30)}...`);
const decodedBuffer = ddu128.decode(encodedBuffer);
console.log(`디코딩: ${decodedBuffer}`);
console.log(`결과: ${bufferData.toString() === decodedBuffer ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 10: 7비트 경계 테스트
console.log("테스트 10: 7비트 경계 테스트");
// 각기 다른 길이의 문자열로 패딩 처리 확인
const testLengths = [1, 2, 3, 7, 8, 14, 15, 16];
let allPassed = true;
for (const len of testLengths) {
  const testStr = "a".repeat(len);
  const enc = ddu128.encode(testStr);
  const dec = ddu128.decode(enc);
  if (testStr !== dec) {
    console.log(`길이 ${len}: ✗ 실패`);
    allPassed = false;
  }
}
console.log(`다양한 길이 테스트: ${allPassed ? "✓ 모두 성공" : "✗ 일부 실패"}\n`);

console.log("테스트 11: 긴 문자열 테스트");
const longString2 = "안녕나안보고싶었어?스스로칭찬하려니까부담되는걸?하지만기록은완성해야하니까어쩔수없지~엘리시아는상냥하고,친근하고,귀엽고,똑똑하고아름다운소녀야.그녀의초대를거절하거나그녀를냉정하게대할수있는사람은없어.전설속의엘프처럼모든이의마음을사로잡고13명의영웅을이곳에모았으면서첫번째자리를양보하는겸손함까지...영웅들에게엘리시아는가장믿음직스럽고사랑받는동료야.너희도그렇게생각하지?1";
const startEncode2 = performance.now();
const encodedLong2 = ddu128.encode(longString2);
const endEncode2 = performance.now();
const startDecode2 = performance.now();
const decodedLong2 = ddu128.decode(encodedLong2);
const endDecode2 = performance.now();
console.log(`원본 길이: ${longString2.length}`);
console.log(`인코딩 길이: ${encodedLong2.length}`);
console.log(`인코딩 시간: ${(endEncode2 - startEncode2).toFixed(2)}ms`);
console.log(`디코딩 시간: ${(endDecode2 - startDecode2).toFixed(2)}ms`);
console.log(`결과: ${longString2 === decodedLong2 ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 12: 커스텀 한글 문자셋 (129개 사용, 앞 128개만 사용됨)
console.log("테스트 12: 커스텀 한글 문자셋 (129개 -> 128개 사용)");
const koreanCharSet = [
  // 기본 자음+모음 조합
  "가", "나", "다", "라", "마", "바", "사", "아", "자", "차", "카", "타", "파", "하",
  "개", "내", "대", "래", "매", "배", "새", "애", "재", "채", "캐", "태", "패", "해",
  "고", "노", "도", "로", "모", "보", "소", "오", "조", "초", "코", "토", "포", "호",
  "구", "누", "두", "루", "무", "부", "수", "우", "주", "추", "쿠", "투", "푸", "후",
  "그", "느", "드", "르", "므", "브", "스", "으", "즈", "츠", "크", "트", "프", "흐",
  "기", "니", "디", "리", "미", "비", "시", "이", "지", "치", "키", "티", "피", "히",
  "게", "네", "데", "레", "메", "베", "세", "에", "제", "체", "케", "테", "페", "헤",
  "겨", "녀", "더", "려", "며", "벼", "셔", "여", "져", "쳐", "켜", "텨", "펴", "혀",
  "교", "뇨", "됴", "료", "묘", "뵤", "쇼", "요", "죠", "쵸", "쿄", "툐", "표", "효",
  "규", "뉴", "듀", "류", "뮤", "뷰", "슈", "유", "쥬", "츄", "큐", "튜", "퓨", "휴",
  // 받침 있는 조합
  "각", "낙", "닥", "락", "막", "박", "삭", "악", "작", "착", "칵", "탁", "팍", "학",
  "갑", "납", "답", "랍", "맙", "밥", "삽", "압", "잡", "찹", "캅", "탑", "팝", "합",
  "곡", "녹", "독", "록", "목", "복", "속", "옥", "족", "촉", "콕", "톡", "폭", "혹",
  "국", "눅", "둑", "룩", "묵", "북", "숙", "욱", "죽", "축", "쿡", "툭", "푹", "훅",
  "극", "늑", "득", "륵", "믁", "븍", "슥", "윽", "즉", "츰", "큭", "특", "픅", "흑",
  "금", "늠", "듬", "름", "뭄", "붐", "숨", "음", "줌", "춤", "큼", "틈", "품", "흠",
  "갈", "날", "달", "랄", "말", "발", "살", "알", "잘", "찰", "칼", "탈", "팔", "할",
  "감", "남", "담", "람", "맘", "밤", "샘", "암", "잠", "참", "캄", "탐", "팜", "함",
  "건", "넌", "던", "런", "먼"
]; // 129개

const koreanPadding = "즁";

try {
  const koreanDdu128 = new Ddu128(koreanCharSet, koreanPadding);
  const testKorean = "안녕하세요! 커스텀 한글 문자셋 테스트입니다. 128개의 한글 문자를 사용합니다.";
  const encodedKorean = koreanDdu128.encode(testKorean);
  console.log(`원본: ${testKorean}`);
  console.log(`인코딩 샘플: ${encodedKorean.substring(0, 30)}...`);
  const decodedKorean = koreanDdu128.decode(encodedKorean);
  console.log(`디코딩: ${decodedKorean}`);
  console.log(`결과: ${testKorean === decodedKorean ? "✓ 성공" : "✗ 실패"} (인스턴스 생성 및 인코딩/디코딩 완료)`);
  console.log(`사용된 문자셋 크기: 128개 (원본 129개 중 앞 128개 사용)\n`);
} catch (error) {
  console.log(`결과: ✗ 실패 - ${error}\n`);
}

// 테스트 13: 유효성 검사 - 128개 미만
console.log("테스트 13: 유효성 검사 - 128개 미만");
try {
  const tooFewChars = Array.from({ length: 127 }, (_, i) => `C${i.toString().padStart(2, "0")}`);
  new Ddu128(tooFewChars, "XXX");
  console.log(`결과: ✗ 실패 - 예외가 발생해야 함\n`);
} catch (error) {
  console.log(`결과: ✓ 성공 - 올바르게 예외 발생: ${(error as Error).message}\n`);
}

// 테스트 14: 유효성 검사 - 길이 불일치
console.log("테스트 14: 유효성 검사 - 길이 불일치");
try {
  const mixedLengthChars = [
    ...Array.from({ length: 64 }, (_, i) => `A${i}`), // 2글자
    ...Array.from({ length: 64 }, (_, i) => `B${i}X`) // 3글자
  ];
  new Ddu128(mixedLengthChars, "XXX");
  console.log(`결과: ✗ 실패 - 예외가 발생해야 함\n`);
} catch (error) {
  console.log(`결과: ✓ 성공 - 올바르게 예외 발생: ${(error as Error).message}\n`);
}

// 테스트 15: 유효성 검사 - 패딩 길이 불일치
console.log("테스트 15: 유효성 검사 - 패딩 길이 불일치");
try {
  const validChars = Array.from({ length: 128 }, (_, i) => {
    const num = i.toString().padStart(3, "0");
    return `A${num}`;
  });
  new Ddu128(validChars, "X"); // 패딩이 1글자
  console.log(`결과: ✗ 실패 - 예외가 발생해야 함\n`);
} catch (error) {
  console.log(`결과: ✓ 성공 - 올바르게 예외 발생: ${(error as Error).message}\n`);
}

// 테스트 16: 유효성 검사 - 중복 문자
console.log("테스트 16: 유효성 검사 - 중복 문자");
try {
  const duplicateChars = [
    ...Array.from({ length: 127 }, (_, i) => {
      const num = i.toString().padStart(3, "0");
      return `A${num}`;
    }),
    "A000" // 중복
  ];
  new Ddu128(duplicateChars, "XXXX");
  console.log(`결과: ✗ 실패 - 예외가 발생해야 함\n`);
} catch (error) {
  console.log(`결과: ✓ 성공 - 올바르게 예외 발생: ${(error as Error).message}\n`);
}

// 테스트 17: 유효성 검사 - 패딩이 문자셋에 포함됨
console.log("테스트 17: 유효성 검사 - 패딩이 문자셋에 포함됨");
try {
  const validChars2 = Array.from({ length: 128 }, (_, i) => {
    const num = i.toString().padStart(3, "0");
    return `A${num}`;
  });
  new Ddu128(validChars2, "A000"); // 패딩이 문자셋에 이미 있음
  console.log(`결과: ✗ 실패 - 예외가 발생해야 함\n`);
} catch (error) {
  console.log(`결과: ✓ 성공 - 올바르게 예외 발생: ${(error as Error).message}\n`);
}

console.log("=== Ddu128 테스트 완료 ===");

