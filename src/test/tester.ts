import * as os from 'os';
import { Ddu64 } from "..";

function measurePerformance() {
    const encoderDecoder = new Ddu64();
    const testData = "Hello, World! This is a performance test for encoding and decoding.";
    
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

    console.log(`Encode Time: ${encodeTime.toFixed(2)} ms`);
    console.log(`Decode Time: ${decodeTime.toFixed(2)} ms`);
    console.log(`Memory Usage: ${memoryUsage} bytes`);
    console.log(`CPU Usage: ${cpuUsage} microseconds`);
}

measurePerformance();