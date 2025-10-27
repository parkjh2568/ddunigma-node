import { Ddu512 } from "../index.js";

console.log("=== Ddu512 테스트 시작 ===\n");

// 테스트 1: 기본 인코딩/디코딩
console.log("테스트 1: 기본 인코딩/디코딩");
const ddu512 = new Ddu512();
const testString1 = "Hello, Ddu512! 안녕하세요!";
const encoded1 = ddu512.encode(testString1);
console.log(`원본: ${testString1}`);
console.log(`인코딩 샘플: ${encoded1.substring(0, 30)}...`);
const decoded1 = ddu512.decode(encoded1);
console.log(`디코딩: ${decoded1}`);
console.log(`결과: ${testString1 === decoded1 ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 2: KR 문자 세트 사용
console.log("테스트 2: KR 문자 세트 (3글자 키)");
const testString2 = "512가지 키로 인코딩 테스트";
const encoded2 = ddu512.encode(testString2, { dduSetSymbol: "KR" });
console.log(`원본: ${testString2}`);
console.log(`인코딩 샘플: ${encoded2.substring(0, 40)}...`);
const decoded2 = ddu512.decode(encoded2, { dduSetSymbol: "KR" });
console.log(`디코딩: ${decoded2}`);
console.log(`결과: ${testString2 === decoded2 ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 3: URL 안전성 확인
console.log("테스트 3: URL 안전성");
const urlTestString = "https://example.com?param=value&other=123456";
const encodedUrl = ddu512.encode(urlTestString, { dduSetSymbol: "KR" });
console.log(`원본: ${urlTestString}`);
console.log(`인코딩 샘플: ${encodedUrl.substring(0, 50)}...`);
const urlSafeChars = /^[A-Za-z0-9]+$/;
const isUrlSafe = urlSafeChars.test(encodedUrl);
console.log(`URL-safe 여부: ${isUrlSafe ? "✓ 안전" : "✗ 비안전"}`);
const decodedUrl = ddu512.decode(encodedUrl, { dduSetSymbol: "KR" });
console.log(`디코딩: ${decodedUrl}`);
console.log(`결과: ${urlTestString === decodedUrl ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 4: 긴 텍스트 - Base64 및 Ddu128과 크기 비교
console.log("테스트 4: 긴 텍스트 - 크기 비교");
const longText = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(20);
const encodedLong = ddu512.encode(longText);
const base64Encoded = Buffer.from(longText).toString("base64");
console.log(`원본 길이: ${longText.length} bytes`);
console.log(`Ddu512 인코딩 길이: ${encodedLong.length} bytes`);
console.log(`Base64 인코딩 길이: ${base64Encoded.length} bytes`);
console.log(`Ddu512 압축률: ${((1 - encodedLong.length / longText.length) * 100).toFixed(2)}%`);
const decodedLong = ddu512.decode(encodedLong);
console.log(`결과: ${longText === decodedLong ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 5: 빈 문자열 및 짧은 문자열
console.log("테스트 5: 빈 문자열 및 짧은 문자열");
const emptyString = "";
const encodedEmpty = ddu512.encode(emptyString);
const decodedEmpty = ddu512.decode(encodedEmpty);
console.log(`빈 문자열: ${emptyString === decodedEmpty ? "✓ 성공" : "✗ 실패"}`);

const shortString = "A";
const encodedShort = ddu512.encode(shortString);
const decodedShort = ddu512.decode(encodedShort);
console.log(`1글자 ("A"): ${shortString === decodedShort ? "✓ 성공" : "✗ 실패"}`);

const twoChars = "AB";
const encodedTwo = ddu512.encode(twoChars);
const decodedTwo = ddu512.decode(encodedTwo);
console.log(`2글자 ("AB"): ${twoChars === decodedTwo ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 6: 특수 문자 및 이모지
console.log("테스트 6: 특수 문자 및 이모지");
const specialText = "Hello 🌍! Special chars: @#$%^&*() 한글: 가나다 😀🎉";
const encodedSpecial = ddu512.encode(specialText);
console.log(`원본: ${specialText}`);
console.log(`인코딩 샘플: ${encodedSpecial.substring(0, 40)}...`);
const decodedSpecial = ddu512.decode(encodedSpecial);
console.log(`디코딩: ${decodedSpecial}`);
console.log(`결과: ${specialText === decodedSpecial ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 7: 성능 테스트
console.log("테스트 7: 성능 테스트 (10,000회 반복)");
const perfTestString = "Performance test string 123!@# 성능테스트";
const iterations = 10000;

const startEncode = performance.now();
for (let i = 0; i < iterations; i++) {
  ddu512.encode(perfTestString);
}
const endEncode = performance.now();

const encodedPerf = ddu512.encode(perfTestString);
const startDecode = performance.now();
for (let i = 0; i < iterations; i++) {
  ddu512.decode(encodedPerf);
}
const endDecode = performance.now();

console.log(`${iterations}회 인코딩 평균: ${((endEncode - startEncode) / iterations).toFixed(4)}ms`);
console.log(`${iterations}회 디코딩 평균: ${((endDecode - startDecode) / iterations).toFixed(4)}ms\n`);

// 테스트 8: 9비트 경계 테스트
console.log("테스트 8: 9비트 경계 테스트");
const testLengths = [1, 2, 3, 8, 9, 16, 17, 18];
let allPassed = true;
for (const len of testLengths) {
  const testStr = "a".repeat(len);
  const enc = ddu512.encode(testStr);
  const dec = ddu512.decode(enc);
  if (testStr !== dec) {
    console.log(`길이 ${len}: ✗ 실패`);
    allPassed = false;
  }
}
console.log(`다양한 길이 테스트: ${allPassed ? "✓ 모두 성공" : "✗ 일부 실패"}\n`);

// 테스트 9: 긴 문자열 테스트
console.log("테스트 9: 긴 문자열 테스트");
const longString2 = "안녕나안보고싶었어?스스로칭찬하려니까부담되는걸?하지만기록은완성해야하니까어쩔수없지~엘리시아는상냥하고,친근하고,귀엽고,똑똑하고아름다운소녀야.그녀의초대를거절하거나그녀를냉정하게대할수있는사람은없어.전설속의엘프처럼모든이의마음을사로잡고13명의영웅을이곳에모았으면서첫번째자리를양보하는겸손함까지...영웅들에게엘리시아는가장믿음직스럽고사랑받는동료야.너희도그렇게생각하지?1";
const startEncode2 = performance.now();
const encodedLong2 = ddu512.encode(longString2);
const endEncode2 = performance.now();
const startDecode2 = performance.now();
const decodedLong2 = ddu512.decode(encodedLong2);
const endDecode2 = performance.now();
console.log(`원본 길이: ${longString2.length}`);
console.log(`인코딩 길이: ${encodedLong2.length}`);
console.log(`인코딩 시간: ${(endEncode2 - startEncode2).toFixed(2)}ms`);
console.log(`디코딩 시간: ${(endDecode2 - startDecode2).toFixed(2)}ms`);
console.log(`결과: ${longString2 === decodedLong2 ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 10: Buffer 입력
console.log("테스트 10: Buffer 입력");
const bufferData = Buffer.from("Buffer test with Ddu512", "utf-8");
const encodedBuffer = ddu512.encode(bufferData);
console.log(`원본: ${bufferData.toString()}`);
console.log(`인코딩 샘플: ${encodedBuffer.substring(0, 30)}...`);
const decodedBuffer = ddu512.decode(encodedBuffer);
console.log(`디코딩: ${decodedBuffer}`);
console.log(`결과: ${bufferData.toString() === decodedBuffer ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 11: 유효성 검사 - 512개 미만
console.log("테스트 11: 유효성 검사 - 512개 미만");
try {
  const tooFewChars = Array.from({ length: 511 }, (_, i) => `C${i.toString().padStart(2, "0")}`);
  new Ddu512(tooFewChars, "XXX");
  console.log(`결과: ✗ 실패 - 예외가 발생해야 함\n`);
} catch (error) {
  console.log(`결과: ✓ 성공 - 올바르게 예외 발생: ${(error as Error).message}\n`);
}

console.log("=== Ddu512 테스트 완료 ===");

