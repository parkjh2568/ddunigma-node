/**
 * ddunigma Web Streams API 구현.
 *
 * Web Streams API(globalThis.TransformStream)를 사용하는
 * TransformStream 기반 인코딩/디코딩 파이프라인을 제공합니다.
 * 모든 최신 브라우저와 Node.js에서 사용 가능합니다.
 *
 * 스트리밍 모드:
 * - 인코딩: 압축/암호화/체크섬 비활성화 + 2의 제곱수 charset에서 청크 단위 출력
 * - 디코딩: footer의 압축/암호화 마커를 최종 신뢰하기 위해 payload를 축적 후 처리
 *
 * 메타데이터 의미 주의:
 * 스트림 헤더의 압축 플래그(D/B/N)는 압축이 "요청"되었는지를 기록하고, 페이로드 footer는
 * 실제로 압축이 "적용"되었는지를 기록합니다. 작은/비압축성 데이터는 압축 결과가 원본보다
 * 커서 적용되지 않을 수 있으므로 헤더가 D/B여도 footer엔 압축 마커가 없을 수 있습니다.
 * 디코더는 항상 footer를 권위 있는 소스로 신뢰하므로 라운드트립은 정상이며, 헤더 플래그는
 * 어디까지나 "요청" 힌트로만 해석해야 합니다.
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
import type { CharSetInfo, DduInternalOptions, DduStreamOptions } from "../core/types.js";
import { Ddu64LimitError, wrapDdu64Error } from "../core/errors.js";
import { normalizeLimit } from "../core/internal/DecodeValidation.js";
import { validateRuntimeOptions } from "../core/internal/OptionValidation.js";

const DEFAULT_MAX_BUFFERED_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_BUFFERED_CHARS = 64 * 1024 * 1024;

// ─── 인코딩 TransformStream ─────────────────────────────────────────────────

/**
 * 바이너리 데이터를 charset 인코딩 문자열로 변환하는
 * Web Streams API TransformStream을 생성합니다.
 *
 * 압축/암호화/체크섬이 비활성화되고 charset이 2의 제곱수일 때 각 청크를 즉시 인코딩합니다.
 * 그 외에는 전체 데이터를 축적한 후 flush에서 처리합니다.
 *
 * 암호화 정책: 스트림 암호화 여부는 **인코더가 키를 보유했는지로만** 결정됩니다
 * (`encryptionKey` 설정 시 항상 암호화). 스트림 옵션 타입(`DduStreamOptions`)에는 `encrypt`가
 * 노출되지 않으며, 내부 옵션으로 `encrypt: false`를 주더라도 키가 있으면 무시되고 암호화됩니다.
 * 평문 스트림이 필요하면 키 없는 인코더 인스턴스를 사용하세요.
 *
 * @param encoder - 인코딩에 사용할 Ddu64Core 인스턴스
 * @param options - 인코딩 옵션 (compress, compressionAlgorithm 등)
 * @returns TransformStream<Uint8Array, string>
 */
export function createReadableEncodeStream(
  encoder: Ddu64Core,
  options?: DduStreamOptions,
): TransformStream<Uint8Array, string> {
  validateRuntimeOptions(options, "stream");
  const info = encoder.getCharSetInfo();
  const shouldCompress = options?.compress ?? info.defaultCompress;
  const shouldEncrypt = info.hasEncryptionKey;
  const shouldChecksum = options?.checksum ?? info.defaultChecksum;
  const compressionAlgorithm = shouldCompress
    ? (options?.compressionAlgorithm ?? info.defaultCompressionAlgorithm)
    : undefined;
  const paddingChar = info.paddingChar;
  const maxBufferedBytes = normalizeLimit(
    options?.maxBufferedBytes,
    DEFAULT_MAX_BUFFERED_BYTES,
    true,
    "maxBufferedBytes",
  );

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
            chunkSize: 0,
            chunkSeparator: undefined,
            omitFooter: true,
          } as DduInternalOptions);
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
        if (totalLength + chunk.length > maxBufferedBytes) {
          controller.error(
            new Ddu64LimitError(
              `[WebStreams encode] Buffered input exceeds limit. Limit: ${maxBufferedBytes} bytes`,
              "stream",
            ),
          );
          return;
        }
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
              chunkSize: 0,
              chunkSeparator: undefined,
            } as DduInternalOptions);
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
            chunkSize: 0,
            chunkSeparator: undefined,
          } as DduInternalOptions);
          if (encoded.length > 0) {
            controller.enqueue(encoded);
          }

          chunks = [];
          totalLength = 0;
        }
      } catch (err) {
        controller.error(wrapDdu64Error(err, "stream"));
      }
    },
  });
}

// ─── 디코딩 TransformStream ─────────────────────────────────────────────────

/**
 * charset 인코딩 문자열을 바이너리 데이터로 역변환하는
 * Web Streams API TransformStream을 생성합니다.
 *
 * 스트림은 DDS1 스트림 헤더를 조기 검증하되, 헤더만으로 복호화/압축해제를 비활성화하지 않습니다.
 * footer가 최종 wire metadata이므로 전체 페이로드를 축적 후 일괄 디코딩합니다.
 *
 * @param encoder - 디코딩에 사용할 Ddu64Core 인스턴스
 * @param options - 디코딩 옵션
 * @returns TransformStream<string, Uint8Array>
 */
export function createReadableDecodeStream(
  encoder: Ddu64Core,
  options?: DduStreamOptions,
): TransformStream<string, Uint8Array> {
  validateRuntimeOptions(options, "stream");
  const info = encoder.getCharSetInfo();
  const paddingChar = info.paddingChar;
  const headerLength = getStreamHeaderLength(paddingChar);
  const shouldChecksum = options?.checksum ?? info.defaultChecksum;
  const maxBufferedChars = normalizeLimit(
    options?.maxBufferedChars,
    DEFAULT_MAX_BUFFERED_CHARS,
    true,
    "maxBufferedChars",
  );

  let textBuffer = "";
  let headerParsed = false;
  let headerMeta: StreamHeaderMeta | null = null;

  return new TransformStream<string, Uint8Array>({
    async transform(chunk, controller) {
      try {
        textBuffer += chunk;
        if (textBuffer.length > maxBufferedChars) {
          throw new Ddu64LimitError(
            `[WebStreams decode] Buffered encoded input exceeds limit. Limit: ${maxBufferedChars} characters`,
            "stream",
          );
        }

        // 헤더가 아직 파싱되지 않았으면 시도
        if (!headerParsed && textBuffer.length >= headerLength) {
          if (!textBuffer.startsWith(paddingChar)) {
            throw new Error("[WebStreams decode] Invalid or missing stream header");
          }

          headerMeta = parseStreamHeader(textBuffer, paddingChar);
          if (headerMeta === null) {
            throw new Error("[WebStreams decode] Invalid or missing stream header");
          }

          if (headerMeta.encrypted && !info.hasEncryptionKey) {
            throw new Error("[WebStreams decode] Encrypted stream requires an encryptionKey");
          }

          headerParsed = true;

          // 헤더 제거
          textBuffer = textBuffer.slice(headerLength);
        }
      } catch (err) {
        controller.error(wrapDdu64Error(err, "stream"));
      }
    },

    async flush(controller) {
      try {
        if (!headerParsed) {
          if (textBuffer.length === 0) return;
          throw new Error("[WebStreams decode] Incomplete stream header");
        }

        const detectedCompression = headerMeta!.compressionAlgorithm;

        const decoded = await encoder.decodeToUint8ArrayAsync(textBuffer, {
          ...options,
          compress: options?.compress,
          compressionAlgorithm: detectedCompression,
          checksum: shouldChecksum,
          chunkSize: undefined,
          chunkSeparator: undefined,
        });

        if (decoded.length > 0) {
          controller.enqueue(decoded);
        }
        textBuffer = "";
      } catch (err) {
        controller.error(wrapDdu64Error(err, "stream"));
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
