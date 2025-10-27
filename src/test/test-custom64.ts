import { Custom64 } from "../index.js";

console.log("=== Custom64 테스트 시작 ===\n");

// 테스트 1: 기본 인코딩/디코딩
console.log("테스트 1: 기본 인코딩/디코딩");
const custom64 = new Custom64();
const testString1 = "Hello, Custom64!";
const encoded1 = custom64.encode(testString1);
console.log(`원본: ${testString1}`);
console.log(`인코딩: ${encoded1}`);
const decoded1 = custom64.decode(encoded1);
console.log(`디코딩: ${decoded1}`);
console.log(`결과: ${testString1 === decoded1 ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 2: KR 문자 세트 사용
console.log("테스트 2: KR 문자 세트");
const testString2 = "안녕하세요 Custom64 테스트입니다";
const encoded2 = custom64.encode(testString2, { dduSetSymbol: "KR" });
console.log(`원본: ${testString2}`);
console.log(`인코딩: ${encoded2}`);
const decoded2 = custom64.decode(encoded2, { dduSetSymbol: "KR" });
console.log(`디코딩: ${decoded2}`);
console.log(`결과: ${testString2 === decoded2 ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 3: 커스텀 문자 세트
console.log("테스트 3: 커스텀 문자 세트");
const customChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const customInstance = new Custom64(customChars.split(""), "=");
const testString3 = "Custom character set";
const encoded3 = customInstance.encode(testString3);
console.log(`원본: ${testString3}`);
console.log(`인코딩: ${encoded3}`);
const decoded3 = customInstance.decode(encoded3);
console.log(`디코딩: ${decoded3}`);
console.log(`결과: ${testString3 === decoded3 ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 4: usePowerOfTwo = false
console.log("테스트 4: usePowerOfTwo = false");
const testString4 = "Testing without power of two";
const encoded4 = custom64.encode(testString4, { usePowerOfTwo: false });
console.log(`원본: ${testString4}`);
console.log(`인코딩: ${encoded4}`);
const decoded4 = custom64.decode(encoded4, { usePowerOfTwo: false });
console.log(`디코딩: ${decoded4}`);
console.log(`결과: ${testString4 === decoded4 ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 5: 이모지 포함
console.log("테스트 5: 이모지 포함");
const emojiString = "Hello 😀🎉🚀 World!";
const encodedEmoji = custom64.encode(emojiString);
const decodedEmoji = custom64.decode(encodedEmoji);
console.log(`원본: ${emojiString}`);
console.log(`인코딩: ${encodedEmoji}`);
console.log(`디코딩: ${decodedEmoji}`);
console.log(`결과: ${emojiString === decodedEmoji ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 6: 긴 문자열 성능 테스트
console.log("테스트 6: 긴 문자열 (1000자)");
const longString = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(20);
const startEncode = performance.now();
const encodedLong = custom64.encode(longString);
const endEncode = performance.now();
const startDecode = performance.now();
const decodedLong = custom64.decode(encodedLong);
const endDecode = performance.now();
console.log(`원본 길이: ${longString.length}`);
console.log(`인코딩 길이: ${encodedLong.length}`);
console.log(`인코딩 시간: ${(endEncode - startEncode).toFixed(2)}ms`);
console.log(`디코딩 시간: ${(endDecode - startDecode).toFixed(2)}ms`);
console.log(`결과: ${longString === decodedLong ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 7: 숫자 문자열
console.log("테스트 7: 숫자 문자열");
const numbers = "0123456789".repeat(10);
const encodedNumbers = custom64.encode(numbers);
const decodedNumbers = custom64.decode(encodedNumbers);
console.log(`원본 길이: ${numbers.length}`);
console.log(`인코딩 길이: ${encodedNumbers.length}`);
console.log(`결과: ${numbers === decodedNumbers ? "✓ 성공" : "✗ 실패"}\n`);

// 테스트 8: 다양한 인코딩
console.log("테스트 8: UTF-16 인코딩");
const testString8 = "UTF-16 테스트";
const encoded8 = custom64.encode(testString8, { encoding: "utf16le" });
console.log(`원본: ${testString8}`);
console.log(`인코딩: ${encoded8}`);
const decoded8 = custom64.decode(encoded8, { encoding: "utf16le" });
console.log(`디코딩: ${decoded8}`);
console.log(`결과: ${testString8 === decoded8 ? "✓ 성공" : "✗ 실패"}\n`);


console.log("테스트 9: 긴 문자열 테스트");
const longString2 = "안녕나안보고싶었어?스스로칭찬하려니까부담되는걸?하지만기록은완성해야하니까어쩔수없지~엘리시아는상냥하고,친근하고,귀엽고,똑똑하고아름다운소녀야.그녀의초대를거절하거나그녀를냉정하게대할수있는사람은없어.전설속의엘프처럼모든이의마음을사로잡고13명의영웅을이곳에모았으면서첫번째자리를양보하는겸손함까지...영웅들에게엘리시아는가장믿음직스럽고사랑받는동료야.너희도그렇게생각하지?1";
const startEncode2 = performance.now();
const encodedLong2 = custom64.encode(longString2);
const endEncode2 = performance.now();
const startDecode2 = performance.now();
const decodedLong2 = custom64.decode(encodedLong2);
const endDecode2 = performance.now();
console.log(`원본 길이: ${longString2.length}`);
console.log(`인코딩 길이: ${encodedLong2.length}`);
console.log(`인코딩 시간: ${(endEncode2 - startEncode2).toFixed(2)}ms`);
console.log(`디코딩 시간: ${(endDecode2 - startDecode2).toFixed(2)}ms`);
console.log(`결과: ${longString2 === decodedLong2 ? "✓ 성공" : "✗ 실패"}\n`);

console.log("=== Custom64 테스트 완료 ===");

