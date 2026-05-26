/**
 * ddunigma 인코딩/디코딩 연산을 위한 Node.js Worker Thread 진입점.
 *
 * 이 파일은 Node.js worker_threads Worker 내부에서 실행됩니다.
 * 인코딩/디코딩 요청 메시지를 수신하고 결과를 다시 전송합니다.
 *
 * @module workers/nodeWorker
 */

import { parentPort } from "worker_threads";
import { bitPackEncode, bitPackDecode, createBitPackConfig } from "../core/BitPack.js";
import { buildFooter, parseFooter } from "../core/wireFormat.js";
import { stringToBytes, bytesToString } from "../core/codecUtils.js";
import type { WorkerRequest, WorkerResponse } from "./WorkerPool.js";
import type { EncoderConfig } from "../core/types.js";

// ─── 인코딩 로직 ─────────────────────────────────────────────────────────────

function encodeInWorker(data: Uint8Array, config: EncoderConfig): string {
  const { charSet, paddingChar, useRepeatPadding } = config;
  const charsetSize = charSet.length;
  const bitPackConfig = createBitPackConfig(charsetSize);

  if (data.length === 0) return "";

  const { indices, paddingBits } = bitPackEncode(data, bitPackConfig);

  // 인덱스를 문자로 매핑
  const parts: string[] = new Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    parts[i] = charSet[indices[i]];
  }

  // 푸터 생성
  const footer = buildFooter({
    paddingBits,
    compressionAlgorithm: config.compressionAlgorithm,
    isEncrypted: !!config.encrypt,
    paddingChar,
    useRepeatPadding: useRepeatPadding && !config.compressionAlgorithm && !config.encrypt,
  });

  return parts.join("") + footer;
}

// ─── 디코딩 로직 ─────────────────────────────────────────────────────────────

function decodeInWorker(input: string, config: EncoderConfig): Uint8Array {
  const { charSet, paddingChar } = config;
  const charsetSize = charSet.length;
  const bitPackConfig = createBitPackConfig(charsetSize);
  const usePowerOfTwo = charsetSize > 0 && (charsetSize & (charsetSize - 1)) === 0;
  const effectiveBitLength = usePowerOfTwo
    ? Math.floor(Math.log2(charsetSize))
    : Math.ceil(Math.log2(charsetSize));

  // 역방향 룩업 생성
  const lookup = new Map<string, number>();
  for (let i = 0; i < charSet.length; i++) {
    lookup.set(charSet[i], i);
  }

  // 푸터 파싱
  const { cleanedInput, paddingBits } = parseFooter(input, paddingChar, effectiveBitLength);

  if (cleanedInput.length === 0) return new Uint8Array(0);

  // 문자를 인덱스로 디코딩
  const indices: number[] = new Array(cleanedInput.length);
  let idx = 0;
  for (let i = 0; i < cleanedInput.length; i++) {
    const char = cleanedInput[i];
    const val = lookup.get(char);
    if (val === undefined) {
      throw new Error(`[nodeWorker decode] Invalid character "${char}" at position ${i}`);
    }
    indices[idx++] = val;
  }
  indices.length = idx;

  return bitPackDecode(indices, paddingBits, bitPackConfig);
}

// ─── 메시지 핸들러 ───────────────────────────────────────────────────────────

if (parentPort) {
  parentPort.on("message", (request: WorkerRequest) => {
    try {
      let result: string | Uint8Array;

      if (request.type === "encode") {
        const inputData =
          typeof request.data === "string" ? stringToBytes(request.data) : request.data;
        result = encodeInWorker(inputData, request.config);
      } else {
        const inputStr =
          typeof request.data === "string" ? request.data : bytesToString(request.data);
        result = decodeInWorker(inputStr, request.config);
      }

      const response: WorkerResponse = {
        id: request.id,
        type: "result",
        result,
      };
      parentPort!.postMessage(response);
    } catch (error) {
      const response: WorkerResponse = {
        id: request.id,
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      };
      parentPort!.postMessage(response);
    }
  });
}
