import { Ddu64 } from "../index.js";

console.log("=== Ddu64 테스트 시작 ===\n");

// 테스트 1: 기본 인코딩/디코딩
console.log("테스트 1: 기본 인코딩/디코딩");
const ddu64 = new Ddu64();
const testString1 = "Hello, World! 안녕하세요!";
const encoded1 = ddu64.encode(testString1);
console.log(`원본: ${testString1}`);
console.log(`인코딩: ${encoded1}`);
const decoded1 = ddu64.decode(encoded1);
console.log(`디코딩: ${decoded1}`);
console.log(`결과: ${testString1 === decoded1 ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 2: 커스텀 문자 세트 사용
console.log("테스트 2: 커스텀 문자 세트");
const customDdu64 = new Ddu64(["A", "B", "C", "D", "E", "F", "G", "H"], "X");
const testString2 = "Custom character set test";
const encoded2 = customDdu64.encode(testString2, { usePowerOfTwo: true });
console.log(`원본: ${testString2}`);
console.log(`인코딩: ${encoded2}`);
const decoded2 = customDdu64.decode(encoded2, { usePowerOfTwo: true });
console.log(`디코딩: ${decoded2}`);
console.log(`결과: ${testString2 === decoded2 ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 3: KR 문자 세트 사용
console.log("테스트 3: KR 문자 세트");
const testString3 = "한글 테스트 123 ABC";
const encoded3 = ddu64.encode(testString3, { dduSetSymbol: "KR" });
console.log(`원본: ${testString3}`);
console.log(`인코딩: ${encoded3}`);
const decoded3 = ddu64.decode(encoded3, { dduSetSymbol: "KR" });
console.log(`디코딩: ${decoded3}`);
console.log(`결과: ${testString3 === decoded3 ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 4: 긴 문자열 테스트
console.log("테스트 4: 긴 문자열");
const longString = "안녕나안보고싶었어?스스로칭찬하려니까부담되는걸?하지만기록은완성해야하니까어쩔수없지~엘리시아는상냥하고,친근하고,귀엽고,똑똑하고아름다운소녀야.그녀의초대를거절하거나그녀를냉정하게대할수있는사람은없어.전설속의엘프처럼모든이의마음을사로잡고13명의영웅을이곳에모았으면서첫번째자리를양보하는겸손함까지...영웅들에게엘리시아는가장믿음직스럽고사랑받는동료야.너희도그렇게생각하지?1";
const encodedLong = ddu64.encode(longString);
const decodedLong = ddu64.decode(encodedLong);
console.log(`원본 길이: ${longString.length}`);
console.log(`인코딩 길이: ${encodedLong.length}`);
console.log(`결과: ${longString === decodedLong ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 5: 빈 문자열
console.log("테스트 5: 빈 문자열");
const emptyString = "";
const encodedEmpty = ddu64.encode(emptyString);
const decodedEmpty = ddu64.decode(encodedEmpty);
console.log(`원본: "${emptyString}"`);
console.log(`인코딩: "${encodedEmpty}"`);
console.log(`디코딩: "${decodedEmpty}"`);
console.log(`결과: ${emptyString === decodedEmpty ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 6: 특수 문자
console.log("테스트 6: 특수 문자");
const specialChars = "!@#$%^&*()_+-=[]{}|;':\"<>,.?/~`";
const encodedSpecial = ddu64.encode(specialChars);
const decodedSpecial = ddu64.decode(encodedSpecial);
console.log(`원본: ${specialChars}`);
console.log(`인코딩: ${encodedSpecial}`);
console.log(`디코딩: ${decodedSpecial}`);
console.log(`결과: ${specialChars === decodedSpecial ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 7: usePowerOfTwo false 옵션
console.log("테스트 7: usePowerOfTwo = false");
const testString7 = "Power of two test";
const encoded7 = ddu64.encode(testString7, { usePowerOfTwo: false });
console.log(`원본: ${testString7}`);
console.log(`인코딩: ${encoded7}`);
const decoded7 = ddu64.decode(encoded7, { usePowerOfTwo: false });
console.log(`디코딩: ${decoded7}`);
console.log(`결과: ${testString7 === decoded7 ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 8: Buffer 입력
console.log("테스트 8: Buffer 입력");
const testBuffer = Buffer.from("Buffer test", "utf-8");
const encodedBuffer = ddu64.encode(testBuffer);
const decodedBuffer = ddu64.decode(encodedBuffer);
console.log(`원본: ${testBuffer.toString()}`);
console.log(`인코딩: ${encodedBuffer}`);
console.log(`디코딩: ${decodedBuffer}`);
console.log(`결과: ${testBuffer.toString() === decodedBuffer ? "✓ 성공" : "✗ 실패"}\n`);

console.log("테스트 9: 긴 문자열 테스트");
const longString2 = "안녕나안보고싶었어?스스로칭찬하려니까부담되는걸?하지만기록은완성해야하니까어쩔수없지~엘리시아는상냥하고,친근하고,귀엽고,똑똑하고아름다운소녀야.그녀의초대를거절하거나그녀를냉정하게대할수있는사람은없어.전설속의엘프처럼모든이의마음을사로잡고13명의영웅을이곳에모았으면서첫번째자리를양보하는겸손함까지...영웅들에게엘리시아는가장믿음직스럽고사랑받는동료야.너희도그렇게생각하지?1";
const startEncode2 = performance.now();
const encodedLong2 = ddu64.encode(longString2);
const endEncode2 = performance.now();
const startDecode2 = performance.now();
const decodedLong2 = ddu64.decode(encodedLong2);
const endDecode2 = performance.now();
console.log(`원본 길이: ${longString2.length}`);
console.log(`인코딩 길이: ${encodedLong2.length}`);
console.log(`인코딩 시간: ${(endEncode2 - startEncode2).toFixed(2)}ms`);
console.log(`디코딩 시간: ${(endDecode2 - startDecode2).toFixed(2)}ms`);
console.log(`결과: ${longString2 === decodedLong2 ? "✓ 성공" : "✗ 실패"}\n`);

console.log("=== Ddu64 테스트 완료 ===");

