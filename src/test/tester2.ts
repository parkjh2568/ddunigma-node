import * as os from 'os';
import { Ddu64 } from "..";

function measurePerformance(yaho:number = -1) {
    const encoderDecoder = new Ddu64();
    const testData = `Hello,${yaho} World! Thi${yaho}s is ${yaho}a per${yaho}formance te${yaho}st for e${yaho}ncod${yaho}ing an${yaho}d decod${yaho}ing.`;
    
    // 메모리 사용량 측정
    const initialMemoryUsage = process.memoryUsage().heapUsed;

    // CPU 사용량 측정
    const initialCpuUsage = process.cpuUsage();

    // 인코딩 성능 테스트
    const encodeStartTime = performance.now();
    const encodedData = encoderDecoder.encode(testData);
    const encodeEndTime = performance.now();
    const encodeTime = encodeEndTime - encodeStartTime;

    // 디코딩 성능 테스트
    const decodeStartTime = performance.now();
    const decodedData = encoderDecoder.decode(encodedData);
    const decodeEndTime = performance.now();
    const decodeTime = decodeEndTime - decodeStartTime;

    // 메모리 사용량 측정
    const finalMemoryUsage = process.memoryUsage().heapUsed;
    const memoryUsage = finalMemoryUsage - initialMemoryUsage;

    const finalCpuUsage = process.cpuUsage(initialCpuUsage);
    const cpuUsage = finalCpuUsage.user + finalCpuUsage.system;

    return { encodeTime, decodeTime, memoryUsage, cpuUsage };
}

const result1 = measurePerformance();
console.log(`Encode Time: ${result1.encodeTime.toFixed(2)} ms`);
console.log(`Decode Time: ${result1.decodeTime.toFixed(2)} ms`);
console.log(`Memory Usage: ${result1.memoryUsage} bytes`);
console.log(`CPU Usage: ${result1.cpuUsage} microseconds\n`);

const yaho = 10000;
let yaho2 = yaho;
console.log(`loop ${yaho}`);
while(--yaho2 > 0){
    const result2 = measurePerformance(yaho);
    result1.encodeTime += result2.encodeTime;
    result1.decodeTime += result2.decodeTime;
    result1.memoryUsage += result2.memoryUsage;
    result1.cpuUsage += result2.cpuUsage;
}
console.log(`Encode Time: ${(result1.encodeTime/yaho).toFixed(2)} ms`);
console.log(`Decode Time: ${(result1.decodeTime/yaho).toFixed(2)} ms`);
console.log(`Memory Usage: ${result1.memoryUsage/yaho} bytes`);
console.log(`CPU Usage: ${result1.cpuUsage/yaho} microseconds\n`);
