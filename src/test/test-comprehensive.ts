import { Ddu64, DduSetSymbol } from "../index.js";

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
  { name: "긴 한글 스토리", data: "안녕나안보고싶었어?스스로칭찬하려니까부담되는걸?하지만기록은완성해야하니까어쩔수없지~엘리시아는상냥하고,친근하고,귀엽고,똑똑하고아름다운소녀야.그녀의초대를거절하거나그녀를냉정하게대할수있는사람은없어.전설속의엘프처럼모든이의마음을사로잡고13명의영웅을이곳에모았으면서첫번째자리를양보하는겸손함까지...영웅들에게엘리시아는가장믿음직스럽고사랑받는동료야.너희도그렇게생각하지?1" },
];

const encoders = {

  "Ddu64 (우따야)": new Ddu64("우따야","뭐"),

  "Ddu64 (DEFAULT)": new Ddu64(undefined, undefined, {
    dduSetSymbol: DduSetSymbol.ONECHARSET,
  }),
  "Ddu64 (DDU)": new Ddu64(undefined, undefined, {
    dduSetSymbol: DduSetSymbol.DDU,
  }),
  "Ddu64 (1024)": new Ddu64(undefined,undefined,{
    dduSetSymbol: DduSetSymbol.TWOCHARSET,
  }),
  "Ddu64 (32768)": new Ddu64(undefined,undefined,{
    dduSetSymbol: DduSetSymbol.THREECHARSET,
  }),
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
console.log("[ 4-1. 메모리 사용량 벤치마크 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

const memoryPerfTests = [
  { name: "1KB 데이터", data: "A".repeat(1000), iterations: 100 },
  { name: "10KB 데이터", data: "Test ".repeat(2500), iterations: 50 },
  { name: "100KB 데이터", data: "Lorem ipsum ".repeat(10000), iterations: 10 },
];

memoryPerfTests.forEach(testCase => {
  console.log(`\n${testCase.name} (${testCase.iterations}회 반복):`);
  console.log("  인코더      | 시작메모리 | 인코딩후 | 디코딩후 | 최대증가 | GC후메모리");
  console.log("  " + "-".repeat(80));
  
  Object.entries(encoders).forEach(([name, encoder]) => {
    try {
      // 강제 GC (가능한 경우)
      if (global.gc) {
        global.gc();
      }
      
      // 시작 메모리
      const startMem = process.memoryUsage();
      const startHeap = startMem.heapUsed;
      
      // 인코딩 반복
      let encoded = "";
      let maxHeap = startHeap;
      for (let i = 0; i < testCase.iterations; i++) {
        encoded = encoder.encode(testCase.data);
        const currentHeap = process.memoryUsage().heapUsed;
        maxHeap = Math.max(maxHeap, currentHeap);
      }
      
      const afterEncodeMem = process.memoryUsage().heapUsed;
      
      // 디코딩 반복
      for (let i = 0; i < testCase.iterations; i++) {
        encoder.decode(encoded);
        const currentHeap = process.memoryUsage().heapUsed;
        maxHeap = Math.max(maxHeap, currentHeap);
      }
      
      const afterDecodeMem = process.memoryUsage().heapUsed;
      
      // GC 후 메모리
      if (global.gc) {
        global.gc();
      }
      const afterGCMem = process.memoryUsage().heapUsed;
      
      const formatBytes = (bytes: number) => {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
      };
      
      const startStr = formatBytes(startHeap).padStart(10);
      const encodeStr = formatBytes(afterEncodeMem).padStart(8);
      const decodeStr = formatBytes(afterDecodeMem).padStart(8);
      const maxIncStr = formatBytes(maxHeap - startHeap).padStart(8);
      const gcStr = formatBytes(afterGCMem).padStart(10);
      
      console.log(`  ${name.padEnd(11)} | ${startStr} | ${encodeStr} | ${decodeStr} | ${maxIncStr} | ${gcStr}`);
    } catch (err: any) {
      console.log(`  ${name.padEnd(11)} | 에러: ${err.message}`);
    }
  });
});

// 인코더 인스턴스 메모리 사용량
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("인코더 인스턴스 메모리 사용량:");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

if (global.gc) {
  global.gc();
}

const baselineMem = process.memoryUsage().heapUsed;

console.log("  인코더      | 인스턴스 메모리 | 룩업테이블 | 총 오버헤드");
console.log("  " + "-".repeat(60));

Object.entries({
  "Ddu64 (DEFAULT)": DduSetSymbol.ONECHARSET,
  "Ddu64 (DDU)": DduSetSymbol.DDU,
  "Ddu64 (1024)": DduSetSymbol.TWOCHARSET,
  "Ddu64 (32768)": DduSetSymbol.THREECHARSET,
}).forEach(([name, symbol]) => {
  if (global.gc) {
    global.gc();
  }
  
  const beforeMem = process.memoryUsage().heapUsed;
  
  // 인스턴스 생성
  const testEncoder = new Ddu64(undefined, undefined, { dduSetSymbol: symbol });
  
  const afterMem = process.memoryUsage().heapUsed;
  const instanceMem = afterMem - beforeMem;
  
  // 대략적인 룩업 테이블 크기 추정
  // Map 오버헤드 + 엔트리당 약 50-100바이트
  const charSetSize = testEncoder['dduChar'].length;
  const estimatedLookupSize = charSetSize * 80; // 대략적인 추정
  
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };
  
  console.log(`  ${name.padEnd(11)} | ${formatBytes(instanceMem).padStart(15)} | ${formatBytes(estimatedLookupSize).padStart(10)} | ${formatBytes(instanceMem).padStart(12)}`);
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 4-2. CPU 사용량 및 처리량 (Throughput) 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

const cpuTests = [
  { name: "1KB 데이터", data: "A".repeat(1000), duration: 1000 }, // 1초 동안
  { name: "10KB 데이터", data: "Test ".repeat(2500), duration: 1000 },
  { name: "100KB 데이터", data: "Lorem ipsum ".repeat(10000), duration: 500 }, // 0.5초로 단축
];

cpuTests.forEach(testCase => {
  console.log(`\n${testCase.name} (${testCase.duration}ms 동안 최대 처리):`);
  console.log("  인코더      | 인코딩횟수 | 처리량(MB/s) | CPU시간(ms) | CPU효율(%)");
  console.log("  " + "-".repeat(75));
  
  Object.entries(encoders).forEach(([name, encoder]) => {
    try {
      const dataSize = Buffer.from(testCase.data).length;
      
      // CPU 시간 측정
      const startCPU = process.cpuUsage();
      const startTime = performance.now();
      
      let iterations = 0;
      let encoded = "";
      
      // 지정된 시간 동안 반복
      while (performance.now() - startTime < testCase.duration) {
        encoded = encoder.encode(testCase.data);
        encoder.decode(encoded);
        iterations++;
      }
      
      const endTime = performance.now();
      const endCPU = process.cpuUsage(startCPU);
      
      const elapsedTime = endTime - startTime;
      const totalCPUTime = (endCPU.user + endCPU.system) / 1000; // 마이크로초 → 밀리초
      const totalBytesProcessed = dataSize * iterations * 2; // 인코딩 + 디코딩
      const throughputMBps = (totalBytesProcessed / (1024 * 1024)) / (elapsedTime / 1000);
      const cpuEfficiency = (totalCPUTime / elapsedTime) * 100;
      
      console.log(`  ${name.padEnd(11)} | ${iterations.toString().padStart(10)} | ${throughputMBps.toFixed(2).padStart(12)} | ${totalCPUTime.toFixed(1).padStart(11)} | ${cpuEfficiency.toFixed(1).padStart(10)}`);
    } catch (err: any) {
      console.log(`  ${name.padEnd(11)} | 에러: ${err.message}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 4-3. 메모리 누수 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

console.log("참고: 10,000회 반복 후 메모리가 증가하지 않으면 메모리 누수 없음\n");

const leakTests = [
  { name: "작은 데이터", data: "Test", iterations: 10000 },
  { name: "중간 데이터", data: "A".repeat(100), iterations: 5000 },
  { name: "큰 데이터", data: "Lorem ".repeat(1000), iterations: 1000 },
];

leakTests.forEach(testCase => {
  console.log(`\n${testCase.name} (${testCase.iterations}회 반복):`);
  console.log("  인코더      | 시작메모리 | 중간(50%) | 종료메모리 | GC후 | 누수여부");
  console.log("  " + "-".repeat(75));
  
  Object.entries(encoders).forEach(([name, encoder]) => {
    try {
      if (global.gc) {
        global.gc();
      }
      
      const startMem = process.memoryUsage().heapUsed;
      
      // 전반부 실행
      for (let i = 0; i < testCase.iterations / 2; i++) {
        const encoded = encoder.encode(testCase.data);
        encoder.decode(encoded);
      }
      
      const midMem = process.memoryUsage().heapUsed;
      
      // 후반부 실행
      for (let i = 0; i < testCase.iterations / 2; i++) {
        const encoded = encoder.encode(testCase.data);
        encoder.decode(encoded);
      }
      
      const endMem = process.memoryUsage().heapUsed;
      
      // GC 실행
      if (global.gc) {
        global.gc();
      }
      
      const afterGC = process.memoryUsage().heapUsed;
      
      const formatBytes = (bytes: number) => {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
      };
      
      // 메모리 누수 판단: GC 후 메모리가 시작보다 1MB 이상 크면 의심
      const leak = (afterGC - startMem) > 1024 * 1024;
      const leakStatus = leak ? "⚠️ 의심" : "✅ 없음";
      
      console.log(`  ${name.padEnd(11)} | ${formatBytes(startMem).padStart(10)} | ${formatBytes(midMem).padStart(9)} | ${formatBytes(endMem).padStart(10)} | ${formatBytes(afterGC).padStart(4)} | ${leakStatus}`);
    } catch (err: any) {
      console.log(`  ${name.padEnd(11)} | 에러: ${err.message}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 4-4. 동시성 및 부하 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

console.log("동시 다중 요청 시뮬레이션 (서비스 환경):\n");

const concurrencyTests = [
  { name: "낮은 부하 (10 동시)", concurrent: 10, data: "Hello World", iterations: 100 },
  { name: "중간 부하 (50 동시)", concurrent: 50, data: "Test Data", iterations: 100 },
  { name: "높은 부하 (100 동시)", concurrent: 100, data: "A".repeat(100), iterations: 50 },
];

concurrencyTests.forEach(testCase => {
  console.log(`\n${testCase.name}:`);
  console.log("  인코더      | 총 처리시간 | 평균 응답 | 최대 응답 | 성공률(%)");
  console.log("  " + "-".repeat(70));
  
  Object.entries(encoders).forEach(([name, encoder]) => {
    try {
      const results: number[] = [];
      let maxTime = 0;
      let successCount = 0;
      
      const startTime = performance.now();
      
      // 동시 요청 시뮬레이션 (실제로는 순차적이지만 빠르게 실행)
      for (let concurrent = 0; concurrent < testCase.concurrent; concurrent++) {
        for (let i = 0; i < testCase.iterations; i++) {
          const reqStart = performance.now();
          try {
            const encoded = encoder.encode(testCase.data);
            const decoded = encoder.decode(encoded);
            
            if (decoded === testCase.data) {
              successCount++;
            }
            
            const reqTime = performance.now() - reqStart;
            results.push(reqTime);
            maxTime = Math.max(maxTime, reqTime);
          } catch {
            // 실패
          }
        }
      }
      
      const totalTime = performance.now() - startTime;
      const avgResponse = results.reduce((a, b) => a + b, 0) / results.length;
      const successRate = (successCount / (testCase.concurrent * testCase.iterations)) * 100;
      
      console.log(`  ${name.padEnd(11)} | ${totalTime.toFixed(1).padStart(11)}ms | ${avgResponse.toFixed(3).padStart(9)}ms | ${maxTime.toFixed(3).padStart(9)}ms | ${successRate.toFixed(1).padStart(9)}`);
    } catch (err: any) {
      console.log(`  ${name.padEnd(11)} | 에러: ${err.message}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 4-5. 장시간 실행 안정성 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

console.log("5초 연속 실행 테스트 (서비스 장시간 운영 시뮬레이션):\n");

console.log("  인코더      | 총 처리수 | 평균속도(op/s) | 메모리변화 | 오류수 | 안정성");
console.log("  " + "-".repeat(75));

Object.entries(encoders).forEach(([name, encoder]) => {
  try {
    if (global.gc) {
      global.gc();
    }
    
    const startMem = process.memoryUsage().heapUsed;
    const startTime = performance.now();
    const duration = 5000; // 5초
    
    let iterations = 0;
    let errors = 0;
    const testData = "Stability Test Data";
    
    while (performance.now() - startTime < duration) {
      try {
        const encoded = encoder.encode(testData);
        const decoded = encoder.decode(encoded);
        
        if (decoded !== testData) {
          errors++;
        }
        
        iterations++;
      } catch {
        errors++;
      }
    }
    
    const endTime = performance.now();
    const endMem = process.memoryUsage().heapUsed;
    
    const elapsedSec = (endTime - startTime) / 1000;
    const opsPerSec = iterations / elapsedSec;
    const memChange = endMem - startMem;
    
    const formatBytes = (bytes: number) => {
      const sign = bytes >= 0 ? "+" : "";
      if (Math.abs(bytes) < 1024) return `${sign}${bytes}B`;
      if (Math.abs(bytes) < 1024 * 1024) return `${sign}${(bytes / 1024).toFixed(1)}KB`;
      return `${sign}${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    };
    
    const stability = errors === 0 && memChange < 10 * 1024 * 1024 ? "✅ 안정" : "⚠️ 주의";
    
    console.log(`  ${name.padEnd(11)} | ${iterations.toString().padStart(9)} | ${opsPerSec.toFixed(0).padStart(14)} | ${formatBytes(memChange).padStart(10)} | ${errors.toString().padStart(6)} | ${stability}`);
  } catch (err: any) {
    console.log(`  ${name.padEnd(11)} | 에러: ${err.message}`);
  }
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
console.log("[ 9. 비트 패턴 테스트 (전체 바이트 범위 0x00~0xFF) ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");
console.log("참고: 이 테스트는 모든 바이트 값(0x00~0xFF)을 테스트합니다.");
console.log("      바이너리 데이터를 직접 인코딩/디코딩하여 완전한 데이터 무결성을 검증합니다.\n");

// 다양한 비트 패턴 생성 함수
function generateBitPatternTests() {
  const tests: { name: string; data: Buffer }[] = [];
  
  // 1. 단일 바이트 패턴 (0x00 ~ 0xFF) - 전체 범위
  for (let i = 0; i <= 255; i++) {
    tests.push({
      name: `단일 바이트 0x${i.toString(16).padStart(2, '0').toUpperCase()}`,
      data: Buffer.from([i])
    });
  }
  
  // 2. 모든 0 패턴 (다양한 길이)
  [1, 2, 4, 8, 16, 32, 64, 128, 256, 512].forEach(len => {
    tests.push({
      name: `모든 0x00 (${len}바이트)`,
      data: Buffer.alloc(len, 0x00)
    });
  });
  
  // 3. 모든 FF 패턴 (다양한 길이)
  [1, 2, 4, 8, 16, 32, 64, 128, 256, 512].forEach(len => {
    tests.push({
      name: `모든 0xFF (${len}바이트)`,
      data: Buffer.alloc(len, 0xFF)
    });
  });
  
  // 4. 교차 패턴 (전체 범위)
  tests.push({
    name: "교차 패턴 0xAA (10101010)",
    data: Buffer.alloc(64, 0xAA)
  });
  tests.push({
    name: "교차 패턴 0x55 (01010101)",
    data: Buffer.alloc(64, 0x55)
  });
  tests.push({
    name: "교차 패턴 0xCC (11001100)",
    data: Buffer.alloc(64, 0xCC)
  });
  tests.push({
    name: "교차 패턴 0x33 (00110011)",
    data: Buffer.alloc(64, 0x33)
  });
  tests.push({
    name: "교차 패턴 0xF0 (11110000)",
    data: Buffer.alloc(64, 0xF0)
  });
  tests.push({
    name: "교차 패턴 0x0F (00001111)",
    data: Buffer.alloc(64, 0x0F)
  });
  
  // 5. 순차 증가/감소 패턴 (전체 범위)
  tests.push({
    name: "순차 증가 0x00~0xFF",
    data: Buffer.from(Array.from({ length: 256 }, (_, i) => i))
  });
  tests.push({
    name: "순차 감소 0xFF~0x00",
    data: Buffer.from(Array.from({ length: 256 }, (_, i) => 255 - i))
  });
  tests.push({
    name: "순차 증가 반복 (0x00~0xFF x 4)",
    data: Buffer.from(Array.from({ length: 1024 }, (_, i) => i % 256))
  });
  
  // 6. 2바이트 경계 테스트 (전체 범위)
  tests.push({
    name: "2바이트 경계 0x0000",
    data: Buffer.from([0x00, 0x00])
  });
  tests.push({
    name: "2바이트 경계 0xFFFF",
    data: Buffer.from([0xFF, 0xFF])
  });
  tests.push({
    name: "2바이트 경계 0x0001",
    data: Buffer.from([0x00, 0x01])
  });
  tests.push({
    name: "2바이트 경계 0x0100",
    data: Buffer.from([0x01, 0x00])
  });
  tests.push({
    name: "2바이트 경계 0x8000",
    data: Buffer.from([0x80, 0x00])
  });
  tests.push({
    name: "2바이트 경계 0x0080",
    data: Buffer.from([0x00, 0x80])
  });
  tests.push({
    name: "2바이트 경계 0xFF00",
    data: Buffer.from([0xFF, 0x00])
  });
  tests.push({
    name: "2바이트 경계 0x00FF",
    data: Buffer.from([0x00, 0xFF])
  });
  
  // 7. 4바이트 경계 테스트 (전체 범위)
  tests.push({
    name: "4바이트 경계 0x00000000",
    data: Buffer.from([0x00, 0x00, 0x00, 0x00])
  });
  tests.push({
    name: "4바이트 경계 0xFFFFFFFF",
    data: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF])
  });
  tests.push({
    name: "4바이트 경계 0x80000000",
    data: Buffer.from([0x80, 0x00, 0x00, 0x00])
  });
  tests.push({
    name: "4바이트 경계 0x00000080",
    data: Buffer.from([0x00, 0x00, 0x00, 0x80])
  });
  tests.push({
    name: "4바이트 경계 0xFF000000",
    data: Buffer.from([0xFF, 0x00, 0x00, 0x00])
  });
  tests.push({
    name: "4바이트 경계 0x000000FF",
    data: Buffer.from([0x00, 0x00, 0x00, 0xFF])
  });
  
  // 8. 랜덤 패턴 (전체 범위)
  for (let i = 0; i < 20; i++) {
    const len = Math.floor(Math.random() * 200) + 1;
    const randomData = Buffer.alloc(len);
    for (let j = 0; j < len; j++) {
      randomData[j] = Math.floor(Math.random() * 256); // 0x00~0xFF
    }
    tests.push({
      name: `랜덤 패턴 ${i + 1} (${len}바이트)`,
      data: randomData
    });
  }
  
  // 9. 비트 시프트 패턴 (전체 범위)
  for (let shift = 0; shift < 8; shift++) {
    const pattern = 1 << shift;
    tests.push({
      name: `비트 시프트 ${shift} (0x${pattern.toString(16).padStart(2, '0').toUpperCase()})`,
      data: Buffer.alloc(32, pattern)
    });
  }
  
  // 10. 프라임 넘버 패턴 (전체 범위)
  const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239, 241, 251];
  tests.push({
    name: `프라임 넘버 패턴 (${primes.length}바이트)`,
    data: Buffer.from(primes)
  });
  
  // 11. 피보나치 패턴 (mod 256 - 전체 범위)
  const fib = [0, 1];
  for (let i = 2; i < 200; i++) {
    fib.push((fib[i - 1] + fib[i - 2]) % 256);
  }
  tests.push({
    name: `피보나치 패턴 (${fib.length}바이트)`,
    data: Buffer.from(fib)
  });
  
  // 12. 반복 바이트 패턴 (전체 범위에서 샘플링)
  [0x00, 0x01, 0x7F, 0x80, 0xFE, 0xFF].forEach(byte => {
    [1, 10, 100, 500].forEach(len => {
      tests.push({
        name: `반복 0x${byte.toString(16).padStart(2, '0').toUpperCase()} (${len}바이트)`,
        data: Buffer.alloc(len, byte)
      });
    });
  });
  
  // 13. 교차 바이트 패턴
  tests.push({
    name: "교차 0x00/0xFF (100바이트)",
    data: Buffer.from(Array.from({ length: 100 }, (_, i) => i % 2 === 0 ? 0x00 : 0xFF))
  });
  tests.push({
    name: "교차 0x55/0xAA (100바이트)",
    data: Buffer.from(Array.from({ length: 100 }, (_, i) => i % 2 === 0 ? 0x55 : 0xAA))
  });
  
  // 14. UTF-8 멀티바이트 경계 테스트
  tests.push({
    name: "UTF-8 2바이트 문자 경계",
    data: Buffer.from("áéíóú") // 각각 2바이트 UTF-8
  });
  tests.push({
    name: "UTF-8 3바이트 문자 경계",
    data: Buffer.from("한글테스트") // 각각 3바이트 UTF-8
  });
  tests.push({
    name: "UTF-8 4바이트 문자 경계",
    data: Buffer.from("🎉😀🌍") // 각각 4바이트 UTF-8
  });
  
  // 15. 혼합 멀티바이트
  tests.push({
    name: "혼합 멀티바이트 (1+2+3+4바이트)",
    data: Buffer.from("Aáä한🎉")
  });
  
  return tests;
}

console.log("다양한 비트 패턴 생성 중...\n");
const bitPatternTests = generateBitPatternTests();
console.log(`총 ${bitPatternTests.length}개의 비트 패턴 테스트 케이스 생성 완료\n`);

let bitTestPassed = 0;
let bitTestFailed = 0;

// latin1 encoding을 사용하는 별도의 encoder 생성
const latin1Encoders = {
  "Ddu64 (DEFAULT)": new Ddu64(undefined, undefined, {
    dduSetSymbol: DduSetSymbol.ONECHARSET,
    encoding: 'latin1',
  }),
  "Ddu64 (DDU)": new Ddu64(undefined, undefined, {
    dduSetSymbol: DduSetSymbol.DDU,
    encoding: 'latin1',
  }),
  "Ddu64": new Ddu64(undefined, undefined, {
    dduSetSymbol: DduSetSymbol.TWOCHARSET,
    encoding: 'latin1',
  }),
};

Object.entries(latin1Encoders).forEach(([name, encoder]) => {
  console.log(`\n${name}:`);
  let encoderBitPassed = 0;
  let encoderBitFailed = 0;
  
  bitPatternTests.forEach((test, idx) => {
    // Buffer를 인코딩
    const encoded = encoder.encode(test.data);
    // 디코딩
    const decoded = encoder.decode(encoded);
    const decodedBuffer = Buffer.from(decoded, 'latin1');
    
    if (decodedBuffer.equals(test.data)) {
      encoderBitPassed++;
      bitTestPassed++;
      totalTests++;
      passedTests++;
    } else {
      encoderBitFailed++;
      bitTestFailed++;
      totalTests++;
      failedTests++;
      console.log(`  ✗ ${test.name}: 디코딩 불일치`);
      console.log(`    원본: ${test.data.toString('hex').substring(0, 40)}...`);
      console.log(`    결과: ${decodedBuffer.toString('hex').substring(0, 40)}...`);
    }
  });
  
  const successRate = ((encoderBitPassed / bitPatternTests.length) * 100).toFixed(1);
  console.log(`  ${name} 비트 패턴 테스트: ${encoderBitPassed}/${bitPatternTests.length} 통과 (${successRate}%)`);
});

console.log(`\n전체 비트 패턴 테스트 결과: ${bitTestPassed}/${bitPatternTests.length * Object.keys(encoders).length} 통과`);

if (bitTestFailed === 0) {
  console.log("✅ 모든 비트 패턴 테스트 통과!");
} else {
  console.log(`❌ ${bitTestFailed}개 비트 패턴 테스트 실패`);
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 10. 다양한 인코딩 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

const encodingTests: { name: string; encoding: BufferEncoding; data: string }[] = [
  { name: "UTF-8 (기본)", encoding: "utf-8", data: "Hello 안녕하세요 こんにちは 你好 🎉" },
  { name: "UTF-16LE", encoding: "utf16le", data: "Hello World 안녕하세요" },
  { name: "ASCII", encoding: "ascii", data: "Hello World 123 !@#$%" },
  { name: "Latin1 (ISO-8859-1)", encoding: "latin1", data: "Café résumé naïve" },
  { name: "Base64", encoding: "base64", data: "SGVsbG8gV29ybGQh" }, // "Hello World!" in base64
  { name: "Hex", encoding: "hex", data: "48656c6c6f20576f726c6421" }, // "Hello World!" in hex
  { name: "Binary (deprecated)", encoding: "binary", data: "Hello\x00World\xFF" },
];

encodingTests.forEach(test => {
  console.log(`\n${test.name} (encoding: ${test.encoding}):`);
  
  // 각 encoding마다 새로운 encoder 생성
  const encodingEncoders = {
    "Ddu64 (DEFAULT)": new Ddu64(undefined, undefined, {
      dduSetSymbol: DduSetSymbol.ONECHARSET,
      encoding: test.encoding,
    }),
    "Ddu64 (DDU)": new Ddu64(undefined, undefined, {
      dduSetSymbol: DduSetSymbol.DDU,
      encoding: test.encoding,
    }),
    "Ddu64": new Ddu64(undefined, undefined, {
      dduSetSymbol: DduSetSymbol.TWOCHARSET,
      encoding: test.encoding,
    }),
  };
  
  Object.entries(encodingEncoders).forEach(([name, encoder]) => {
    try {
      // 원본 데이터를 Buffer로 변환
      const originalBuffer = Buffer.from(test.data, test.encoding);
      
      // 인코딩
      const encoded = encoder.encode(originalBuffer);
      
      // decodeToBuffer를 사용하여 직접 Buffer로 디코딩
      const decodedBuffer = encoder.decodeToBuffer(encoded);
      
      const passed = decodedBuffer.equals(originalBuffer);
      reportTest(`${name.padEnd(11)}`, passed, passed ? undefined : `버퍼 불일치`);
    } catch (err: any) {
      reportTest(`${name.padEnd(11)}`, false, err.message);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 11. 메모리 효율성 (대용량 데이터) ]");
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
console.log("[ 12. 커스텀 Charset 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

// Base64 호환 charset
const BASE64_CHARS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P",
  "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "a", "b", "c", "d", "e", "f",
  "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v",
  "w", "x", "y", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "/",
];

// 한글 charset (256개, 2^8)
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

console.log("커스텀 Charset 테스트:\n");

// 테스트 1: 한글 256개
{
  console.log("1. 한글 charset (256개 = 2^8):");
  const ddu = new Ddu64(koreanChars256, "뭐");
  const testData = "안녕하세요12";
  const encoded = ddu.encode(testData);
  const decoded = ddu.decode(encoded);
  const passed = testData === decoded;
  reportTest("한글 256개 인코딩/디코딩", passed);
  
  // 옵션 무시 확인
  const encoded2 = ddu.encode(testData, {} as any);
  const optionIgnored = encoded === encoded2;
  reportTest("옵션 무시 확인", optionIgnored);
}

// 테스트 2: Base64 charset
{
  console.log("\n2. Base64 charset (64개 = 2^6):");
  const ddu = new Ddu64(BASE64_CHARS, "=");
  const testData = "Hello World! 안녕하세요!";
  const encoded = ddu.encode(testData);
  const decoded = ddu.decode(encoded);
  const passed = testData === decoded;
  reportTest("Base64 charset 인코딩/디코딩", passed);
}

// 테스트 3: 한글 128개
{
  console.log("\n3. 한글 charset 일부 (128개 = 2^7):");
  const korean128 = koreanChars256.slice(0, 128);
  const ddu = new Ddu64(korean128, "뭐");
  const testData = "테스트 데이터 123";
  const encoded = ddu.encode(testData);
  const decoded = ddu.decode(encoded);
  const passed = testData === decoded;
  reportTest("한글 128개 인코딩/디코딩", passed);
}

// 테스트 4: 비 2의 제곱수
{
  console.log("\n4. 비 2의 제곱수 charset (100개):");
  const chars100 = koreanChars256.slice(0, 100);
  const ddu = new Ddu64(chars100, "뭐", { usePowerOfTwo: false });
  const testData = "비 2의 제곱수 테스트";
  const encoded = ddu.encode(testData);
  const decoded = ddu.decode(encoded);
  const passed = testData === decoded;
  reportTest("비 2의 제곱수 인코딩/디코딩", passed);
}

// 테스트 5: 2의 제곱수 강제 확인
{
  console.log("\n5. 2의 제곱수 자동 강제:");
  const dduFalse = new Ddu64(BASE64_CHARS, "=", { usePowerOfTwo: false });
  const dduTrue = new Ddu64(BASE64_CHARS, "=", { usePowerOfTwo: true });
  const testData = "강제 설정 테스트";
  const encoded1 = dduFalse.encode(testData);
  const encoded2 = dduTrue.encode(testData);
  const forced = encoded1 === encoded2;
  reportTest("2의 제곱수 자동 강제 (false→true)", forced);
}

// 테스트 6: 다양한 데이터 타입
{
  console.log("\n6. 다양한 데이터 타입:");
  const ddu = new Ddu64(koreanChars256, "뭐");
  const testCases = [
    { name: "빈 문자열", data: "" },
    { name: "단일 문자", data: "A" },
    { name: "숫자", data: "1234567890" },
    { name: "영문", data: "Hello World" },
    { name: "한글", data: "안녕하세요" },
    { name: "특수문자", data: "!@#$%^&*()" },
    { name: "이모지", data: "😀🎉🌍" },
    { name: "혼합", data: "Hello안녕123!😀" },
  ];
  
  testCases.forEach(test => {
    const encoded = ddu.encode(test.data);
    const decoded = ddu.decode(encoded);
    const passed = test.data === decoded;
    reportTest(`  ${test.name}`, passed);
  });
}

// 테스트 7: Buffer 입력
{
  console.log("\n7. Buffer 입력:");
  const ddu = new Ddu64(koreanChars256, "뭐");
  const testData = "Buffer 테스트 데이터";
  const buffer = Buffer.from(testData, "utf-8");
  const encoded = ddu.encode(buffer);
  const decoded = ddu.decode(encoded);
  const passed = testData === decoded;
  reportTest("Buffer 입력 인코딩/디코딩", passed);
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 13. 엣지 케이스 및 특수 상황 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

console.log("엣지 케이스 테스트:\n");

// 테스트 1: 다양한 2의 제곱수 charset 크기
{
  console.log("1. 다양한 2의 제곱수 charset 크기:");
  const powerOfTwoSizes = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
  
  powerOfTwoSizes.forEach(size => {
    try {
      // 충분한 문자 생성
      const chars = Array.from({ length: size }, (_, i) => 
        String.fromCharCode(0x4E00 + i) // 한자 영역 사용
      );
      const ddu = new Ddu64(chars, "뭐");
      const testData = `크기${size}테스트`;
      const encoded = ddu.encode(testData);
      const decoded = ddu.decode(encoded);
      const passed = testData === decoded;
      reportTest(`  2^${Math.log2(size)} (${size}개) charset`, passed);
    } catch (err: any) {
      reportTest(`  2^${Math.log2(size)} (${size}개) charset`, false, err.message);
    }
  });
}

// 테스트 2: 비 2의 제곱수 charset 크기
{
  console.log("\n2. 비 2의 제곱수 charset 크기:");
  const nonPowerOfTwoSizes = [3, 5, 7, 10, 15, 20, 50, 100, 200, 500];
  
  nonPowerOfTwoSizes.forEach(size => {
    try {
      const chars = Array.from({ length: size }, (_, i) => 
        String.fromCharCode(0x5000 + i)
      );
      const ddu = new Ddu64(chars, "뭐", { usePowerOfTwo: false });
      const testData = `크기${size}테스트`;
      const encoded = ddu.encode(testData);
      const decoded = ddu.decode(encoded);
      const passed = testData === decoded;
      reportTest(`  ${size}개 charset (가변길이)`, passed);
    } catch (err: any) {
      reportTest(`  ${size}개 charset (가변길이)`, false, err.message);
    }
  });
}

// 테스트 3: 최소/최대 크기 charset
{
  console.log("\n3. 최소/최대 크기 charset:");
  
  // 최소 크기 (2개)
  try {
    const ddu = new Ddu64(["0", "1"], "=", { usePowerOfTwo: false });
    const testData = "최소크기";
    const encoded = ddu.encode(testData);
    const decoded = ddu.decode(encoded);
    reportTest("최소 크기 (2개)", testData === decoded);
  } catch (err: any) {
    reportTest("최소 크기 (2개)", false, err.message);
  }
  
  // 최대 크기 (1024개)
  try {
    const chars1024 = Array.from({ length: 1024 }, (_, i) => 
      String.fromCharCode(0x4E00 + i)
    );
    const ddu = new Ddu64(chars1024, "뭐");
    const testData = "최대크기테스트";
    const encoded = ddu.encode(testData);
    const decoded = ddu.decode(encoded);
    reportTest("최대 크기 (1024개)", testData === decoded);
  } catch (err: any) {
    reportTest("최대 크기 (1024개)", false, err.message);
  }
}

// 테스트 4: 다양한 encoding 옵션
{
  console.log("\n4. 다양한 encoding 옵션:");
  const encodings: BufferEncoding[] = ["utf-8", "utf16le", "latin1", "ascii", "base64", "hex"];
  
  encodings.forEach(enc => {
    try {
      const ddu = new Ddu64(BASE64_CHARS, "=", { encoding: enc });
      const testData = enc === "ascii" ? "Hello123" : "테스트";
      const originalBuffer = Buffer.from(testData, enc);
      const encoded = ddu.encode(originalBuffer);
      const decodedBuffer = ddu.decodeToBuffer(encoded);
      reportTest(`  ${enc} encoding`, originalBuffer.equals(decodedBuffer));
    } catch (err: any) {
      reportTest(`  ${enc} encoding`, false, err.message);
    }
  });
}

// 테스트 5: 특수 문자 패딩
{
  console.log("\n5. 특수 문자 패딩:");
  const specialPaddings = ["=", "-", "_", "~", "!", "@", "#", "$", "%"];
  
  specialPaddings.forEach(pad => {
    try {
      const ddu = new Ddu64(BASE64_CHARS, pad);
      const testData = "특수패딩테스트";
      const encoded = ddu.encode(testData);
      const decoded = ddu.decode(encoded);
      reportTest(`  패딩 "${pad}"`, testData === decoded);
    } catch (err: any) {
      reportTest(`  패딩 "${pad}"`, false, err.message);
    }
  });
}

// 테스트 6: 멀티바이트 문자 charset
{
  console.log("\n6. 멀티바이트 문자 charset:");
  
  // 2바이트 한글
  try {
    const korean64 = koreanChars256.slice(0, 64);
    const ddu = new Ddu64(korean64, "뭐");
    const testData = "한글charset테스트";
    const encoded = ddu.encode(testData);
    const decoded = ddu.decode(encoded);
    reportTest("2바이트 한글 charset", testData === decoded);
  } catch (err: any) {
    reportTest("2바이트 한글 charset", false, err.message);
  }
  
  // 3바이트 한자
  try {
    const chinese64 = Array.from({ length: 64 }, (_, i) => 
      String.fromCharCode(0x4E00 + i)
    );
    const ddu = new Ddu64(chinese64, "的");
    const testData = "漢字charset測試";
    const encoded = ddu.encode(testData);
    const decoded = ddu.decode(encoded);
    reportTest("3바이트 한자 charset", testData === decoded);
  } catch (err: any) {
    reportTest("3바이트 한자 charset", false, err.message);
  }
  
  // 4바이트 이모지
  try {
    const emoji8 = ["😀", "😁", "😂", "😃", "😄", "😅", "😆", "😇"];
    const ddu = new Ddu64(emoji8, "🎉");
    const testData = "emoji test";
    const encoded = ddu.encode(testData);
    const decoded = ddu.decode(encoded);
    reportTest("4바이트 이모지 charset", testData === decoded);
  } catch (err: any) {
    reportTest("4바이트 이모지 charset", false, err.message);
  }
}

// 테스트 7: 극단적인 데이터 크기
{
  console.log("\n7. 극단적인 데이터 크기:");
  const ddu = new Ddu64(BASE64_CHARS, "=");
  
  // 빈 데이터
  try {
    const encoded = ddu.encode("");
    const decoded = ddu.decode(encoded);
    reportTest("빈 문자열", decoded === "");
  } catch (err: any) {
    reportTest("빈 문자열", false, err.message);
  }
  
  // 1바이트
  try {
    const testData = "A";
    const encoded = ddu.encode(testData);
    const decoded = ddu.decode(encoded);
    reportTest("1바이트 데이터", testData === decoded);
  } catch (err: any) {
    reportTest("1바이트 데이터", false, err.message);
  }
  
  // 매우 긴 데이터 (1MB)
  try {
    const testData = "A".repeat(1024 * 1024);
    const encoded = ddu.encode(testData);
    const decoded = ddu.decode(encoded);
    reportTest("1MB 데이터", testData === decoded);
  } catch (err: any) {
    reportTest("1MB 데이터", false, err.message);
  }
}

// 테스트 8: usePowerOfTwo 옵션 조합
{
  console.log("\n8. usePowerOfTwo 옵션 조합:");
  
  // 2의 제곱수 + usePowerOfTwo: true
  try {
    const ddu = new Ddu64(BASE64_CHARS, "=", { usePowerOfTwo: true });
    const testData = "옵션true";
    const encoded = ddu.encode(testData);
    const decoded = ddu.decode(encoded);
    reportTest("2^6 + usePowerOfTwo:true", testData === decoded);
  } catch (err: any) {
    reportTest("2^6 + usePowerOfTwo:true", false, err.message);
  }
  
  // 2의 제곱수 + usePowerOfTwo: false (강제 true)
  try {
    const ddu = new Ddu64(BASE64_CHARS, "=", { usePowerOfTwo: false });
    const testData = "옵션false";
    const encoded = ddu.encode(testData);
    const decoded = ddu.decode(encoded);
    reportTest("2^6 + usePowerOfTwo:false (강제)", testData === decoded);
  } catch (err: any) {
    reportTest("2^6 + usePowerOfTwo:false (강제)", false, err.message);
  }
  
  // 비 2의 제곱수 + usePowerOfTwo: true
  try {
    const chars100 = koreanChars256.slice(0, 100);
    const ddu = new Ddu64(chars100, "뭐", { usePowerOfTwo: true });
    const testData = "비제곱true";
    const encoded = ddu.encode(testData);
    const decoded = ddu.decode(encoded);
    reportTest("100개 + usePowerOfTwo:true", testData === decoded);
  } catch (err: any) {
    reportTest("100개 + usePowerOfTwo:true", false, err.message);
  }
  
  // 비 2의 제곱수 + usePowerOfTwo: false
  try {
    const chars100 = koreanChars256.slice(0, 100);
    const ddu = new Ddu64(chars100, "뭐", { usePowerOfTwo: false });
    const testData = "비제곱false";
    const encoded = ddu.encode(testData);
    const decoded = ddu.decode(encoded);
    reportTest("100개 + usePowerOfTwo:false", testData === decoded);
  } catch (err: any) {
    reportTest("100개 + usePowerOfTwo:false", false, err.message);
  }
}

// 테스트 9: 특수 바이트 패턴
{
  console.log("\n9. 특수 바이트 패턴:");
  // latin1 encoding 사용으로 바이너리 데이터 안전하게 처리
  const ddu = new Ddu64(BASE64_CHARS, "=", { encoding: 'latin1' });
  
  // 모든 0
  try {
    const buffer = Buffer.alloc(100, 0);
    const encoded = ddu.encode(buffer);
    const decodedBuffer = ddu.decodeToBuffer(encoded);
    reportTest("모든 0x00 바이트", buffer.equals(decodedBuffer));
  } catch (err: any) {
    reportTest("모든 0x00 바이트", false, err.message);
  }
  
  // 모든 0xFF (이전 실패 케이스 - 이제 해결!)
  try {
    const buffer = Buffer.alloc(100, 0xFF);
    const encoded = ddu.encode(buffer);
    const decodedBuffer = ddu.decodeToBuffer(encoded);
    reportTest("모든 0xFF 바이트", buffer.equals(decodedBuffer));
  } catch (err: any) {
    reportTest("모든 0xFF 바이트", false, err.message);
  }
  
  // 반복 패턴 (이전 실패 케이스 - 이제 해결!)
  try {
    const buffer = Buffer.from([0xAA, 0x55].flatMap(b => Array(50).fill(b)));
    const encoded = ddu.encode(buffer);
    const decodedBuffer = ddu.decodeToBuffer(encoded);
    reportTest("반복 패턴 (0xAA, 0x55)", buffer.equals(decodedBuffer));
  } catch (err: any) {
    reportTest("반복 패턴 (0xAA, 0x55)", false, err.message);
  }
}

// 테스트 10: 연속 인코딩/디코딩
{
  console.log("\n10. 연속 인코딩/디코딩:");
  const ddu = new Ddu64(BASE64_CHARS, "=");
  
  try {
    let data = "초기데이터";
    let allPassed = true;
    
    // 10번 연속 인코딩/디코딩
    for (let i = 0; i < 10; i++) {
      const encoded = ddu.encode(data);
      const decoded = ddu.decode(encoded);
      if (data !== decoded) {
        allPassed = false;
        break;
      }
      data = decoded + i; // 데이터 변형
    }
    
    reportTest("10회 연속 인코딩/디코딩", allPassed);
  } catch (err: any) {
    reportTest("10회 연속 인코딩/디코딩", false, err.message);
  }
}

// 테스트 11: 동시 다중 인스턴스
{
  console.log("\n11. 동시 다중 인스턴스:");
  
  try {
    const ddu1 = new Ddu64(BASE64_CHARS, "=");
    const ddu2 = new Ddu64(koreanChars256.slice(0, 64), "뭐");
    const ddu3 = new Ddu64(koreanChars256.slice(0, 100), "뭐", { usePowerOfTwo: false });
    
    const testData = "다중인스턴스테스트";
    
    const encoded1 = ddu1.encode(testData);
    const encoded2 = ddu2.encode(testData);
    const encoded3 = ddu3.encode(testData);
    
    const decoded1 = ddu1.decode(encoded1);
    const decoded2 = ddu2.decode(encoded2);
    const decoded3 = ddu3.decode(encoded3);
    
    const allPassed = 
      testData === decoded1 && 
      testData === decoded2 && 
      testData === decoded3;
    
    reportTest("3개 인스턴스 동시 사용", allPassed);
  } catch (err: any) {
    reportTest("3개 인스턴스 동시 사용", false, err.message);
  }
}

// 테스트 12: 경계값 테스트
{
  console.log("\n12. 경계값 테스트:");
  
  // 정확히 8의 배수 바이트
  try {
    const ddu = new Ddu64(BASE64_CHARS, "=");
    const testData = "A".repeat(8); // 8바이트
    const encoded = ddu.encode(testData);
    const decoded = ddu.decode(encoded);
    reportTest("8바이트 (경계값)", testData === decoded);
  } catch (err: any) {
    reportTest("8바이트 (경계값)", false, err.message);
  }
  
  // 8의 배수 + 1
  try {
    const ddu = new Ddu64(BASE64_CHARS, "=");
    const testData = "A".repeat(9); // 9바이트
    const encoded = ddu.encode(testData);
    const decoded = ddu.decode(encoded);
    reportTest("9바이트 (8+1)", testData === decoded);
  } catch (err: any) {
    reportTest("9바이트 (8+1)", false, err.message);
  }
  
  // 8의 배수 - 1
  try {
    const ddu = new Ddu64(BASE64_CHARS, "=");
    const testData = "A".repeat(7); // 7바이트
    const encoded = ddu.encode(testData);
    const decoded = ddu.decode(encoded);
    reportTest("7바이트 (8-1)", testData === decoded);
  } catch (err: any) {
    reportTest("7바이트 (8-1)", false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 13. 압축(compress) 옵션 테스트 ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

{
  const encoder = new Ddu64(BASE64_CHARS, "=");
  
  // ─────────────────────────────────────────────────────────────────────────────
  // 1) 원문 vs 기존인코딩 vs 압축인코딩 상세 비교
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("┌─────────────────────────────────────────────────────────────────────────────┐");
  console.log("│                    원문 vs 기존인코딩 vs 압축인코딩 비교                    │");
  console.log("├───────────────────┬──────────┬──────────┬──────────┬──────────┬────────────┤");
  console.log("│ 데이터 타입       │ 원문(자) │ 기존(자) │ 압축(자) │ 압축률   │ 디코딩검증 │");
  console.log("├───────────────────┼──────────┼──────────┼──────────┼──────────┼────────────┤");

  const compressTestCases = [
    { name: "짧은 영문", data: "Hello World!" },
    { name: "반복 패턴", data: "ABCD".repeat(250) },
    { name: "긴 영문", data: "The quick brown fox jumps over the lazy dog. ".repeat(25) },
    { name: "한글 텍스트", data: "안녕하세요! 반갑습니다. 오늘 날씨가 좋네요. ".repeat(20) },
    { name: "혼합 텍스트", data: "Hello안녕123!@#가나다ABC".repeat(40) },
    { name: "숫자 반복", data: "0123456789".repeat(100) },
    { name: "특수문자", data: "!@#$%^&*()_+-=[]{}|;':\",./<>?".repeat(30) },
    { name: "공백 반복", data: "    ".repeat(250) },
    { name: "JSON 데이터", data: JSON.stringify({ users: Array(50).fill({ name: "Test", age: 25, email: "test@test.com" }) }) },
    { name: "대용량 (10KB)", data: "Lorem ipsum dolor sit amet. ".repeat(400) },
  ];

  let allCompressionPassed = true;
  
  for (const tc of compressTestCases) {
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
      
      if (!bothOk) allCompressionPassed = false;

      const ratio = ((1 - compressEncoded.length / normalEncoded.length) * 100).toFixed(1);
      const ratioStr = compressEncoded.length < normalEncoded.length ? `${ratio}%↓` : `+${Math.abs(parseFloat(ratio))}%`;
      
      console.log(`│ ${tc.name.padEnd(17)} │ ${original.length.toString().padStart(8)} │ ${normalEncoded.length.toString().padStart(8)} │ ${compressEncoded.length.toString().padStart(8)} │ ${ratioStr.padStart(8)} │ ${bothOk ? "✓ 정상" : "✗ 실패"}     │`);
    } catch (err: any) {
      allCompressionPassed = false;
      console.log(`│ ${tc.name.padEnd(17)} │ 에러: ${err.message.substring(0, 50).padEnd(56)} │`);
    }
  }
  
  console.log("└───────────────────┴──────────┴──────────┴──────────┴──────────┴────────────┘\n");
  
  reportTest("원문/기존/압축 비교 테이블 검증", allCompressionPassed);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2) 압축 인코딩 → 디코딩 상세 테스트
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n  [압축 인코딩 → 디코딩 상세 검증]");
  
  // 기본 압축 테스트
  try {
    const testData = "Hello World! This is a test for compression. Repeated text works well.";
    const encoded = encoder.encode(testData, { compress: true });
    const decoded = encoder.decode(encoded);
    
    console.log(`    원문: "${testData.substring(0, 40)}..."`);
    console.log(`    압축: "${encoded.substring(0, 50)}..." (${encoded.length}자)`);
    console.log(`    복원: "${decoded.substring(0, 40)}..."`);
    
    reportTest("압축 인코딩 → 디코딩 일치", testData === decoded);
  } catch (err: any) {
    reportTest("압축 인코딩 → 디코딩 일치", false, err.message);
  }

  // decodeToBuffer 테스트
  try {
    const testData = "Buffer 압축 테스트 데이터입니다. 이 문장이 정확히 복원되어야 합니다.";
    const encoded = encoder.encode(testData, { compress: true });
    const decodedBuffer = encoder.decodeToBuffer(encoded);
    const decodedStr = decodedBuffer.toString('utf-8');
    
    reportTest("압축 decodeToBuffer 검증", testData === decodedStr);
  } catch (err: any) {
    reportTest("압축 decodeToBuffer 검증", false, err.message);
  }

  // 한글 압축 테스트
  try {
    const koreanData = "안녕하세요! 반갑습니다. 오늘 날씨가 좋네요. ".repeat(50);
    const compressEncoded = encoder.encode(koreanData, { compress: true });
    const decoded = encoder.decode(compressEncoded);
    reportTest("압축 (한글 대용량)", koreanData === decoded);
  } catch (err: any) {
    reportTest("압축 (한글 대용량)", false, err.message);
  }

  // 빈 문자열 압축
  try {
    const emptyData = "";
    const encoded = encoder.encode(emptyData, { compress: true });
    const decoded = encoder.decode(encoded);
    reportTest("압축 (빈 문자열)", emptyData === decoded);
  } catch (err: any) {
    reportTest("압축 (빈 문자열)", false, err.message);
  }

  // 비압축 데이터 호환성
  try {
    const testData = "Normal encoding without compression flag";
    const encoded = encoder.encode(testData); // compress: false
    const decoded = encoder.decode(encoded);
    reportTest("비압축 데이터 디코딩 호환성", testData === decoded);
  } catch (err: any) {
    reportTest("비압축 데이터 디코딩 호환성", false, err.message);
  }

  // 바이너리 데이터 압축
  try {
    const binaryEncoder = new Ddu64(BASE64_CHARS, "=", { encoding: 'latin1' });
    const buffer = Buffer.alloc(1000, 0xAB);
    const compressEncoded = binaryEncoder.encode(buffer, { compress: true });
    const decodedBuffer = binaryEncoder.decodeToBuffer(compressEncoded);
    reportTest("압축 (바이너리 1KB)", buffer.equals(decodedBuffer));
  } catch (err: any) {
    reportTest("압축 (바이너리 1KB)", false, err.message);
  }

  // 다양한 charset에서 압축 테스트
  try {
    const koreanEncoder = new Ddu64("우따야", "뭐", { usePowerOfTwo: false });
    const testData = "다른 charset에서도 압축이 잘 되는지 테스트합니다! 반복 반복 반복.".repeat(20);
    const encoded = koreanEncoder.encode(testData, { compress: true });
    const decoded = koreanEncoder.decode(encoded);
    reportTest("압축 (한글 charset)", testData === decoded);
  } catch (err: any) {
    reportTest("압축 (한글 charset)", false, err.message);
  }

  // 대용량 데이터 압축/디코딩
  try {
    const largeData = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(2000);
    const normalEncoded = encoder.encode(largeData);
    const compressEncoded = encoder.encode(largeData, { compress: true });
    const decoded = encoder.decode(compressEncoded);
    
    const compressionRatio = ((1 - compressEncoded.length / normalEncoded.length) * 100).toFixed(1);
    console.log(`\n  [대용량 테스트] 원본: ${largeData.length}자`);
    console.log(`    비압축: ${normalEncoded.length}자 → 압축: ${compressEncoded.length}자 (${compressionRatio}% 감소)`);
    
    reportTest("압축 (대용량 114KB)", largeData === decoded);
  } catch (err: any) {
    reportTest("압축 (대용량 114KB)", false, err.message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3) 다양한 인코더에서 압축 테스트
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n  [다양한 인코더에서 압축 테스트]");
  
  const testDataForEncoders = "압축 테스트용 데이터입니다. 반복되는 패턴이 있으면 압축률이 높아집니다. ".repeat(30);
  
  Object.entries(encoders).forEach(([name, enc]) => {
    try {
      const normalEncoded = enc.encode(testDataForEncoders);
      const compressEncoded = enc.encode(testDataForEncoders, { compress: true });
      const decoded = enc.decode(compressEncoded);
      
      const ratio = ((1 - compressEncoded.length / normalEncoded.length) * 100).toFixed(1);
      const passed = decoded === testDataForEncoders;
      
      console.log(`    ${name}: 비압축 ${normalEncoded.length}자 → 압축 ${compressEncoded.length}자 (${ratio}%↓)`);
      reportTest(`압축 (${name})`, passed);
    } catch (err: any) {
      reportTest(`압축 (${name})`, false, err.message);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4) 압축 랜덤 데이터 Fuzzing
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n  [압축 랜덤 데이터 Fuzzing (100회)]");
  
  let fuzzingPassed = 0;
  const fuzzingTotal = 100;
  
  for (let i = 0; i < fuzzingTotal; i++) {
    try {
      const length = Math.floor(Math.random() * 5000) + 100;
      let randomData = "";
      for (let j = 0; j < length; j++) {
        randomData += String.fromCharCode(Math.floor(Math.random() * 0xD800));
      }
      
      const encoded = encoder.encode(randomData, { compress: true });
      const decoded = encoder.decode(encoded);
      
      if (decoded === randomData) fuzzingPassed++;
    } catch {
      // 에러 발생 시 패스하지 않음
    }
  }
  
  reportTest(`압축 Fuzzing (${fuzzingPassed}/${fuzzingTotal} 성공)`, fuzzingPassed === fuzzingTotal);
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("[ 14. Heavy Fuzzing & Concurrency ]");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

async function runAsyncTests() {
  console.log("비동기 동시성 테스트 시작 (Promise.all 사용)...\n");
  
  const encoder = new Ddu64(BASE64_CHARS, "=");
  const tasks: Promise<boolean>[] = [];
  const ITERATIONS = 1000;
  
  for (let i = 0; i < ITERATIONS; i++) {
    tasks.push(new Promise<boolean>((resolve) => {
      setImmediate(() => {
        try {
          // 랜덤 데이터 생성
          const len = Math.floor(Math.random() * 1000) + 1;
          const buffer = Buffer.allocUnsafe(len);
          for(let j=0; j<len; j++) buffer[j] = Math.floor(Math.random() * 256);
          
          const encoded = encoder.encode(buffer);
          const decoded = encoder.decodeToBuffer(encoded);
          resolve(buffer.equals(decoded));
        } catch {
          resolve(false);
        }
      });
    }));
  }
  
  const results = await Promise.all(tasks);
  const failures = results.filter(r => !r).length;
  
  if (failures === 0) {
    console.log(`  ✓ 비동기 Fuzzing ${ITERATIONS}회 성공`);
    passedTests++;
  } else {
    console.log(`  ✗ 비동기 Fuzzing 실패: ${failures}/${ITERATIONS}`);
    failedTests++;
  }
  totalTests++;
  
  printFinalResults();
}

function printFinalResults() {
  // ═══════════════════════════════════════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════════════════════════════════════");
  console.log("[ 15. 최종 결과 및 추천 사항 ]");
  console.log("═══════════════════════════════════════════════════════════════════════════════\n");

  const successRate = ((passedTests / totalTests) * 100).toFixed(1);

  console.log(`총 테스트: ${totalTests}개`);
  console.log(`통과: ${passedTests}개 (${successRate}%)`);
  console.log(`실패: ${failedTests}개\n`);

  if (failedTests === 0) {
    console.log("✅ 모든 테스트 통과! 모든 인코더가 정상적으로 작동합니다.\n");
    console.log("참고: decodeToBuffer 메서드를 사용하여 바이너리 데이터 처리 문제를 해결했습니다.");
    console.log("      이전에 실패했던 0xFF 및 0xAA/0x55 패턴 테스트도 이제 통과합니다.\n");
  } else {
    console.log(`❌ ${failedTests}개 예상치 못한 테스트 실패\n`);
    process.exit(1);
  }

  console.log("╔════════════════════════════════════════════════════════════════════════════╗");
  console.log("║                       테스트 완료!                                         ║");
  console.log("╚════════════════════════════════════════════════════════════════════════════╝");
}

// 기존 동기 코드 끝난 후 실행
runAsyncTests();

