/**
 * ddunigma Web Streams API 구현.
 *
 * Web Streams API(globalThis.TransformStream)를 사용하는
 * TransformStream 기반 인코딩/디코딩 파이프라인을 제공합니다.
 * 모든 최신 브라우저와 Node.js에서 사용 가능합니다.
 *
 * 스트리밍 모드:
 * - 압축/암호화/체크섬 비활성화 + 2의 제곱수 charset: 진정한 청크 단위 스트리밍
 * - 그 외: 전체 축적 후 일괄 처리 (알고리즘/와이어 포맷 제약)
 *
 * 스트림 헤더 형식: [pad]DDS1[D|B|N][1|0][pad]
 * D=deflate, B=brotli, N=없음 (압축), 1/0 (암호화).
 *
 * @module streams/WebStreams
 */

import { Ddu64Core } from "../core/Ddu64Core.js";
import {
  buildStreamHeader,
  parseStreamHeader,
  getStreamHeaderLength,
  type StreamHeaderMeta,
} from "../core/wireFormat.js";
import type { CharSetInfo, DduOptions } from "../core/types.js";

// ─── 인코딩 TransformStream ─────────────────────────────────────────────────

/**
 * 바이너리 데이터를 charset 인코딩 문자열로 변환하는
 * Web Streams API TransformStream을 생성합니다.
 *
 * 압축/암호화/체크섬이 비활성화되고 charset이 2의 제곱수일 때 각 청크를 즉시 인코딩합니다.
 * 그 외에는 전체 데이터를 축적한 후 flush에서 처리합니다.
 *
 * @param encoder - 인코딩에 사용할 Ddu64Core 인스턴스
 * @param options - 인코딩 옵션 (compress, encrypt, compressionAlgorithm 등)
 * @returns TransformStream<Uint8Array, string>
 */
export function createReadableEncodeStream(
  encoder: Ddu64Core,
  options?: DduOptions,
): TransformStream<Uint8Array, string> {
  const info = encoder.getCharSetInfo();
  const shouldCompress = options?.compress ?? info.defaultCompress;
  const shouldEncrypt = (options?.encrypt ?? true) && info.hasEncryptionKey;
  const shouldChecksum = options?.checksum ?? info.defaultChecksum;
  const compressionAlgorithm = shouldCompress
    ? (options?.compressionAlgorithm ?? info.defaultCompressionAlgorithm)
    : undefined;
  const paddingChar = info.paddingChar;

  const canStreamChunks = canUseChunkStreaming(info, {
    compressed: shouldCompress,
    encrypted: shouldEncrypt,
    checksum: shouldChecksum,
  });

  let headerEmitted = false;
  let chunks: Uint8Array[] = [];
  let totalLength = 0;
  // 청크 스트리밍 모드에서 비트 정렬을 위한 잔여 바이트 버퍼
  let residualBytes: Uint8Array | null = null;

  return new TransformStream<Uint8Array, string>({
    async transform(chunk, controller) {
      if (canStreamChunks) {
        // 청크 단위 스트리밍: 헤더를 먼저 출력하고 각 청크를 즉시 인코딩
        if (!headerEmitted) {
          const header = buildStreamHeader(paddingChar, {
            compressionAlgorithm: undefined,
            encrypted: false,
          });
          controller.enqueue(header);
          headerEmitted = true;
        }

        // 잔여 바이트와 현재 청크를 결합
        let data: Uint8Array;
        if (residualBytes && residualBytes.length > 0) {
          data = new Uint8Array(residualBytes.length + chunk.length);
          data.set(residualBytes, 0);
          data.set(chunk, residualBytes.length);
        } else {
          data = chunk;
        }

        // 비트 정렬: bitLength와 8의 LCM 단위로 처리해야 푸터 없이 깔끔하게 인코딩 가능
        // 6비트 charset의 경우 LCM(6,8) = 24비트 = 3바이트 단위
        const bitLength = info.bitLength;
        const lcmBytes = lcm(bitLength, 8) / 8; // 바이트 단위 정렬 크기
        const alignedLen = Math.floor(data.length / lcmBytes) * lcmBytes;

        if (alignedLen > 0) {
          const alignedData = data.subarray(0, alignedLen);
          // 푸터 없이 인코딩 (중간 청크)
          const encoded = await encoder.encodeAsync(alignedData, {
            compress: false,
            encrypt: false,
            checksum: false,
            chunkSize: undefined,
            chunkSeparator: undefined,
            omitFooter: true,
          });
          controller.enqueue(encoded);
        }

        // 잔여 바이트 저장
        if (alignedLen < data.length) {
          residualBytes = data.slice(alignedLen);
        } else {
          residualBytes = null;
        }
      } else {
        // 축적 모드: 압축/암호화/체크섬 또는 비-2의 제곱수 charset은 전체 데이터 필요
        chunks.push(chunk);
        totalLength += chunk.length;
      }
    },

    async flush(controller) {
      try {
        if (canStreamChunks) {
          // 청크 스트리밍 모드: 잔여 바이트 처리 (마지막 청크, 푸터 포함)
          if (!headerEmitted) {
            const header = buildStreamHeader(paddingChar, {
              compressionAlgorithm: undefined,
              encrypted: false,
            });
            controller.enqueue(header);
          }

          if (residualBytes && residualBytes.length > 0) {
            const encoded = await encoder.encodeAsync(residualBytes, {
              compress: false,
              encrypt: false,
              checksum: false,
              chunkSize: undefined,
              chunkSeparator: undefined,
            });
            controller.enqueue(encoded);
          }
          residualBytes = null;
        } else {
          // 축적 모드: 전체 데이터를 한번에 처리
          const header = buildStreamHeader(paddingChar, {
            compressionAlgorithm,
            encrypted: shouldEncrypt,
          });
          controller.enqueue(header);

          if (totalLength > 0) {
            const combined = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
              combined.set(chunk, offset);
              offset += chunk.length;
            }

            const encoded = await encoder.encodeAsync(combined, {
              ...options,
              compress: shouldCompress,
              encrypt: shouldEncrypt,
              checksum: shouldChecksum,
              chunkSize: undefined,
              chunkSeparator: undefined,
            });
            controller.enqueue(encoded);
          }

          chunks = [];
          totalLength = 0;
        }
      } catch (err) {
        controller.error(err instanceof Error ? err : new Error(String(err)));
      }
    },
  });
}

// ─── 디코딩 TransformStream ─────────────────────────────────────────────────

/**
 * charset 인코딩 문자열을 바이너리 데이터로 역변환하는
 * Web Streams API TransformStream을 생성합니다.
 *
 * 스트림은 DDS1 스트림 헤더를 파싱하여 압축 및 암호화 설정을 감지한 후
 * 페이로드를 그에 맞게 디코딩합니다.
 *
 * 압축/암호화/체크섬이 없고 charset이 2의 제곱수인 스트림은 헤더 파싱 후 각 청크를 즉시 디코딩합니다.
 * 그 외에는 전체 페이로드를 축적 후 일괄 디코딩합니다.
 *
 * @param encoder - 디코딩에 사용할 Ddu64Core 인스턴스
 * @param options - 디코딩 옵션
 * @returns TransformStream<string, Uint8Array>
 */
export function createReadableDecodeStream(
  encoder: Ddu64Core,
  options?: DduOptions,
): TransformStream<string, Uint8Array> {
  const info = encoder.getCharSetInfo();
  const paddingChar = info.paddingChar;
  const headerLength = getStreamHeaderLength(paddingChar);
  const shouldChecksum = options?.checksum ?? info.defaultChecksum;

  let textBuffer = "";
  let headerParsed = false;
  let headerMeta: StreamHeaderMeta | null = null;
  let canStreamDecode = false;

  return new TransformStream<string, Uint8Array>({
    async transform(chunk, controller) {
      textBuffer += chunk;

      // 헤더가 아직 파싱되지 않았으면 시도
      if (!headerParsed && textBuffer.length >= headerLength) {
        if (!textBuffer.startsWith(paddingChar)) {
          controller.error(new Error("[WebStreams decode] Invalid or missing stream header"));
          return;
        }

        headerMeta = parseStreamHeader(textBuffer, paddingChar);
        if (headerMeta === null) {
          controller.error(new Error("[WebStreams decode] Invalid or missing stream header"));
          return;
        }

        if (headerMeta.encrypted && !info.hasEncryptionKey) {
          controller.error(
            new Error("[WebStreams decode] Encrypted stream requires an encryptionKey"),
          );
          return;
        }

        headerParsed = true;
        canStreamDecode = canUseChunkStreaming(info, {
          compressed: !!headerMeta.compressionAlgorithm,
          encrypted: headerMeta.encrypted,
          checksum: shouldChecksum,
        });

        // 헤더 제거
        textBuffer = textBuffer.slice(headerLength);
      }

      // 청크 단위 디코딩: 압축/암호화/체크섬이 없고 2의 제곱수 charset일 때만
      if (headerParsed && canStreamDecode && textBuffer.length > 0) {
        // 비트 정렬 단위로 디코딩 (charset 문자 단위)
        // 6비트 charset, power-of-two: 1문자 = 6비트, 4문자 = 24비트 = 3바이트
        const bitLength = info.bitLength;
        const charsPerAlignment = lcm(bitLength, 8) / bitLength;
        const alignedLen = Math.floor(textBuffer.length / charsPerAlignment) * charsPerAlignment;

        if (alignedLen > 0) {
          const alignedText = textBuffer.slice(0, alignedLen);
          textBuffer = textBuffer.slice(alignedLen);

          try {
            const decoded = await encoder.decodeToUint8ArrayAsync(alignedText, {
              compress: false,
              encrypt: false,
              checksum: false,
              chunkSize: undefined,
              chunkSeparator: undefined,
            });
            if (decoded.length > 0) {
              controller.enqueue(decoded);
            }
          } catch {
            // 디코딩 실패 시 잔여 텍스트로 복원하고 flush에서 재시도
            textBuffer = alignedText + textBuffer;
          }
        }
      }
    },

    async flush(controller) {
      try {
        if (!headerParsed) {
          if (textBuffer.length === 0) return;
          controller.error(new Error("[WebStreams decode] Incomplete stream header"));
          return;
        }

        // 잔여 텍스트 처리
        if (textBuffer.length === 0) return;

        const detectedCompression = headerMeta!.compressionAlgorithm;
        const detectedEncryption = headerMeta!.encrypted;

        const decoded = await encoder.decodeToUint8ArrayAsync(textBuffer, {
          ...options,
          compress: !!detectedCompression,
          compressionAlgorithm: detectedCompression,
          encrypt: detectedEncryption,
          checksum: shouldChecksum,
          chunkSize: undefined,
          chunkSeparator: undefined,
        });

        if (decoded.length > 0) {
          controller.enqueue(decoded);
        }
        textBuffer = "";
      } catch (err) {
        controller.error(err instanceof Error ? err : new Error(String(err)));
      }
    },
  });
}

// ─── 유틸리티 ────────────────────────────────────────────────────────────────

/** 청크 단위 스트리밍을 안전하게 사용할 수 있는지 판별합니다. */
function canUseChunkStreaming(
  info: CharSetInfo,
  state: { compressed: boolean; encrypted: boolean; checksum: boolean },
): boolean {
  // 비-2의 제곱수 charset은 논리 심볼 하나가 문자 2개로 표현될 수 있어 전체 payload 단위로 처리합니다.
  return info.usePowerOfTwo && !state.compressed && !state.encrypted && !state.checksum;
}

/** 두 양의 정수의 최소공배수 */
function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

/** 두 양의 정수의 최대공약수 (유클리드 알고리즘) */
function gcd(a: number, b: number): number {
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}
