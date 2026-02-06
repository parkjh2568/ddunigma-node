import {
  Ddu64,
  Ddu32,
  CharsetBuilder,
  DduPipeline,
  DduEncodeStream,
  DduDecodeStream,
  createEncodeStream,
  createDecodeStream,
} from "../index.js";
import { Readable, Writable } from "stream";

console.log("╔════════════════════════════════════════════════════════════════════════════╗");
console.log("║            DDU ENIGMA - 새로운 기능 테스트                                 ║");
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
console.log("[ 1. URL-Safe 모드 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=", { urlSafe: true });
    const testData = "Hello World! 안녕하세요";
    const encoded = encoder.encode(testData);
    
    // URL-Safe 변환 확인 (+, /, = 이 없어야 함)
    const hasUnsafe = encoded.includes("+") || encoded.includes("/");
    reportTest("URL-Safe 변환 (unsafe 문자 없음)", !hasUnsafe, `Encoded: ${encoded}`);
    
    const decoded = encoder.decode(encoded);
    reportTest("URL-Safe 디코딩", testData === decoded);
  } catch (err: any) {
    reportTest("URL-Safe 모드", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 2. 체크섬 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const testData = "Hello World with checksum!";
    const encoded = encoder.encode(testData, { checksum: true });
    
    // 체크섬 마커가 포함되어 있는지 확인
    reportTest("체크섬 마커 포함", encoded.includes("CHK"));
    
    const decoded = encoder.decode(encoded, { checksum: true });
    reportTest("체크섬 검증 성공", testData === decoded);
  } catch (err: any) {
    reportTest("체크섬 인코딩", false, err.message);
  }

  // 체크섬 불일치 테스트
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const testData = "Test data";
    const encoded = encoder.encode(testData, { checksum: true });
    
    // 체크섬을 변조
    const tamperedEncoded = encoded.replace(/CHK[0-9a-f]{8}$/i, "CHK00000000");
    encoder.decode(tamperedEncoded, { checksum: true });
    reportTest("체크섬 불일치 감지", false, "에러가 발생해야 함");
  } catch (err: any) {
    reportTest("체크섬 불일치 감지", err.message.includes("mismatch"));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 3. 청크 분할 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const testData = "A".repeat(100);
    const encoded = encoder.encode(testData, { chunkSize: 20, chunkSeparator: "\n" });
    
    const lines = encoded.split("\n");
    // 마지막 줄을 제외하고 모든 줄이 20자인지 확인
    const allChunksCorrect = lines.slice(0, -1).every(line => line.length === 20);
    reportTest("청크 분할 (20자)", allChunksCorrect, `Lines: ${lines.length}`);
    
    const decoded = encoder.decode(encoded);
    reportTest("청크 분할 디코딩", testData === decoded);
  } catch (err: any) {
    reportTest("청크 분할", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 4. 암호화 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=", { encryptionKey: "my-secret-key-123" });
    const testData = "Secret message! 비밀 메시지!";
    const encoded = encoder.encode(testData);
    
    // 암호화 마커가 포함되어 있는지 확인
    reportTest("암호화 마커 포함", encoded.includes("ENC"));
    
    const decoded = encoder.decode(encoded);
    reportTest("암호화/복호화 성공", testData === decoded);
  } catch (err: any) {
    reportTest("암호화 테스트", false, err.message);
  }

  // 다른 키로 복호화 시도
  try {
    const encoder1 = new Ddu64(BASE64_CHARS, "=", { encryptionKey: "key1" });
    const encoder2 = new Ddu64(BASE64_CHARS, "=", { encryptionKey: "key2" });
    
    const testData = "Secret";
    const encoded = encoder1.encode(testData);
    encoder2.decode(encoded);
    reportTest("다른 키로 복호화 실패", false, "에러가 발생해야 함");
  } catch (err: any) {
    reportTest("다른 키로 복호화 실패", true);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 5. 진행률 콜백 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const testData = "A".repeat(1000);
    const progressUpdates: number[] = [];
    
    encoder.encode(testData, {
      onProgress: (info) => {
        progressUpdates.push(info.percent);
      }
    });
    
    reportTest("진행률 콜백 호출", progressUpdates.length >= 2);
    reportTest("진행률 100% 도달", progressUpdates.includes(100));
  } catch (err: any) {
    reportTest("진행률 콜백", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 6. 비동기 인코딩/디코딩 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  (async () => {
    try {
      const encoder = new Ddu64(BASE64_CHARS, "=");
      const testData = "Async test data!";
      
      const encoded = await encoder.encodeAsync(testData);
      reportTest("비동기 인코딩", encoded.length > 0);
      
      const decoded = await encoder.decodeAsync(encoded);
      reportTest("비동기 디코딩", testData === decoded);
      
      const decodedBuffer = await encoder.decodeToBufferAsync(encoded);
      reportTest("비동기 Buffer 디코딩", decodedBuffer.toString() === testData);
    } catch (err: any) {
      reportTest("비동기 인코딩/디코딩", false, err.message);
    }
  })();
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 7. 통계/분석 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    const testData = "Test data for statistics!";
    
    const stats = encoder.getStats(testData);
    
    reportTest("통계: originalSize", stats.originalSize === testData.length);
    reportTest("통계: encodedSize", stats.encodedSize > 0);
    reportTest("통계: expansionRatio", stats.expansionRatio > 0);
    reportTest("통계: charsetSize", stats.charsetSize === 64);
    reportTest("통계: bitLength", stats.bitLength === 6);
    
    // 압축 통계
    const statsCompressed = encoder.getStats(testData, { compress: true });
    reportTest("통계: 압축 시 compressionRatio 존재", statsCompressed.compressionRatio !== undefined);
  } catch (err: any) {
    reportTest("통계/분석", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 8. Ddu32 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    // RFC 4648 Base32
    const encoder1 = Ddu32.rfc4648();
    const testData = "Hello World!";
    const encoded1 = encoder1.encode(testData);
    const decoded1 = encoder1.decode(encoded1);
    reportTest("Ddu32 RFC 4648", testData === decoded1, `Encoded: ${encoded1}`);
    
    // Crockford's Base32
    const encoder2 = Ddu32.crockford();
    const encoded2 = encoder2.encode(testData);
    const decoded2 = encoder2.decode(encoded2);
    reportTest("Ddu32 Crockford", testData === decoded2);
    
    // z-base-32
    const encoder3 = Ddu32.zbase32();
    const encoded3 = encoder3.encode(testData);
    const decoded3 = encoder3.decode(encoded3);
    reportTest("Ddu32 z-base-32", testData === decoded3);
    
    // 한글 Base32
    const encoder4 = Ddu32.hangul();
    const encoded4 = encoder4.encode(testData);
    const decoded4 = encoder4.decode(encoded4);
    reportTest("Ddu32 한글", testData === decoded4, `Encoded: ${encoded4}`);
  } catch (err: any) {
    reportTest("Ddu32 테스트", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 9. CharsetBuilder 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    // 유니코드 범위에서 생성
    const chars1 = CharsetBuilder
      .fromUnicodeRange(0x4E00, 0x4E3F)
      .build();
    reportTest("CharsetBuilder: 유니코드 범위", chars1.length === 64);
    
    // Base64 생성
    const chars2 = CharsetBuilder.base64().build();
    reportTest("CharsetBuilder: Base64", chars2.length === 64);
    
    // 혼동 문자 제외
    const chars3 = CharsetBuilder
      .fromString("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")
      .excludeConfusing()
      .build();
    reportTest("CharsetBuilder: 혼동 문자 제외", !chars3.includes("0") && !chars3.includes("O"));
    
    // 2의 제곱수로 제한
    const chars4 = CharsetBuilder
      .fromString("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
      .limitToPowerOfTwo()
      .build();
    reportTest("CharsetBuilder: 2의 제곱수 제한", chars4.length === 32);
    
    // 패딩과 함께 빌드
    const { charset, padding } = CharsetBuilder
      .base64()
      .buildWithPadding();
    reportTest("CharsetBuilder: 패딩 생성", charset.length === 64 && padding === "=");
    
    // 셔플
    const chars5 = CharsetBuilder.base64().shuffle(12345).build();
    const chars6 = CharsetBuilder.base64().shuffle(12345).build();
    reportTest("CharsetBuilder: 시드 셔플 일관성", chars5.join("") === chars6.join(""));
  } catch (err: any) {
    reportTest("CharsetBuilder", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 10. DduPipeline 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  try {
    const encoder = new Ddu64(BASE64_CHARS, "=");
    
    // 압축 → 인코딩 파이프라인
    const pipeline1 = new DduPipeline()
      .compress()
      .encode(encoder);
    
    const testData = "A".repeat(1000);
    const result1 = pipeline1.processToString(testData);
    
    // 역순 파이프라인으로 복원
    const pipeline1Reverse = pipeline1.reverse();
    const restored1 = pipeline1Reverse.processToString(result1);
    reportTest("DduPipeline: 압축 → 인코딩 → 역순", testData === restored1);
    
    // 암호화 → 인코딩 파이프라인
    const pipeline2 = new DduPipeline()
      .encrypt("secret-key")
      .encode(encoder);
    
    const testData2 = "Secret message";
    const result2 = pipeline2.processToString(testData2);
    
    const pipeline2Reverse = pipeline2.reverse();
    const restored2 = pipeline2Reverse.processToString(result2);
    reportTest("DduPipeline: 암호화 → 인코딩 → 역순", testData2 === restored2);
    
    // 압축 → 암호화 → 인코딩 파이프라인
    const pipeline3 = new DduPipeline()
      .compress()
      .encrypt("my-key")
      .encode(encoder);
    
    const testData3 = "B".repeat(500);
    const result3 = pipeline3.processToString(testData3);
    
    const pipeline3Reverse = pipeline3.reverse();
    const restored3 = pipeline3Reverse.processToString(result3);
    reportTest("DduPipeline: 압축 → 암호화 → 인코딩 → 역순", testData3 === restored3);
    
    // 파이프라인 복제
    const cloned = pipeline3.clone();
    reportTest("DduPipeline: 복제", cloned.stepCount === pipeline3.stepCount);
  } catch (err: any) {
    reportTest("DduPipeline", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 11. 스트림 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  (async () => {
    try {
      const encoder = new Ddu64(BASE64_CHARS, "=");
      const testData = "Stream test data! ".repeat(100);
      
      // 인코드 스트림 테스트
      const encodeStream = createEncodeStream(encoder);
      const chunks: string[] = [];
      
      await new Promise<void>((resolve, reject) => {
        const readable = Readable.from([Buffer.from(testData)]);
        readable
          .pipe(encodeStream)
          .on("data", (chunk: Buffer) => chunks.push(chunk.toString()))
          .on("end", resolve)
          .on("error", reject);
      });
      
      const encoded = chunks.join("");
      reportTest("스트림 인코딩", encoded.length > 0);
      
      // 디코드 스트림 테스트
      const decodeStream = createDecodeStream(encoder);
      const decodedChunks: Buffer[] = [];
      
      await new Promise<void>((resolve, reject) => {
        const readable = Readable.from([Buffer.from(encoded)]);
        readable
          .pipe(decodeStream)
          .on("data", (chunk: Buffer) => decodedChunks.push(chunk))
          .on("end", resolve)
          .on("error", reject);
      });
      
      const decoded = Buffer.concat(decodedChunks).toString();
      reportTest("스트림 디코딩", decoded === testData);
    } catch (err: any) {
      reportTest("스트림 테스트", false, err.message);
    }
    
    // 최종 결과 출력
    setTimeout(() => {
      console.log("\n═══════════════════════════════════════════════════════════════════════════════");
      console.log("[ 최종 결과 ]");
      console.log("═══════════════════════════════════════════════════════════════════════════════\n");
      
      const successRate = ((passedTests / totalTests) * 100).toFixed(1);
      
      console.log(`총 테스트: ${totalTests}개`);
      console.log(`통과: ${passedTests}개 (${successRate}%)`);
      console.log(`실패: ${failedTests}개\n`);
      
      if (failedTests === 0) {
        console.log("✅ 모든 새로운 기능 정상 작동!\n");
      } else {
        console.log(`❌ ${failedTests}개 테스트 실패\n`);
        process.exit(1);
      }
      
      console.log("╔════════════════════════════════════════════════════════════════════════════╗");
      console.log("║                     새로운 기능 테스트 완료!                               ║");
      console.log("╚════════════════════════════════════════════════════════════════════════════╝");
    }, 100);
  })();
}

