/**
 * DDS2 프레임드(진짜) 스트리밍 — 상수 메모리 인코딩/디코딩.
 *
 * 기존 `createReadable{Encode,Decode}Stream`은 압축/암호화/체크섬 사용 시 전량 버퍼링한다.
 * 본 모듈은 입력을 고정 크기 프레임으로 잘라 **프레임마다 독립적으로 압축/암호화**하고 즉시
 * 방출하므로 메모리 사용이 `frameSize + O(1)`로 유지된다. 단일 페이로드(DDS1/V4) 포맷과 완전히
 * 분리된 opt-in 포맷(`DDS2`)이며 기존 데이터 호환에는 영향이 없다.
 *
 * 보안 모델:
 * - 암호화는 어댑터의 AES-256-GCM(프레임마다 랜덤 IV)을 사용한다. 별도 nonce 관리 코드가
 *   없어 nonce 재사용 버그 표면이 없다(라이브러리의 기존 단일 페이로드 암호화와 동일 가정).
 * - 각 프레임 GCM AAD에 **프레임 인덱스**를 바인딩(`buildDds2FrameAAD`)하여 재정렬/재생을
 *   방어한다. 디코더는 자신이 세는 인덱스로 AAD를 재구성하므로 순서가 어긋나면 인증 실패.
 * - 트레일러의 총 프레임 수 + 마지막 프레임의 final 플래그로 절단(truncation)을 탐지한다.
 *
 * 문자열 레이아웃: `header "\n" frame* "\n" trailer` (charset은 개행을 포함하지 않음).
 *
 * @module streams/FramedStreams
 */

import { Ddu64Core } from "../core/Ddu64Core.js";
import {
  buildDds2Header,
  parseDds2Header,
  buildDds2Trailer,
  parseDds2Trailer,
  buildDds2FrameAAD,
  DDS2_FRAME_COMPRESSED,
  DDS2_FRAME_FINAL,
  DDS2_FRAME_CHECKSUM,
} from "../core/wireFormat.js";
import type { DduStreamOptions } from "../core/types.js";
import { calculateCRC32, normalizeCompressionLevel } from "../core/codecUtils.js";
import {
  Ddu64ChecksumError,
  Ddu64LimitError,
  Ddu64StreamError,
  wrapDdu64Error,
} from "../core/errors.js";
import { normalizeLimit } from "../core/internal/DecodeValidation.js";
import { validateRuntimeOptions } from "../core/internal/OptionValidation.js";

const DEFAULT_FRAME_SIZE = 64 * 1024;
const DEFAULT_MAX_BUFFERED_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_BUFFERED_CHARS = 64 * 1024 * 1024;
const SEPARATOR = "\n";

/**
 * 프레임 인덱스 + 스트림 ID를 바인딩한 4바이트 CRC32(BE). 인덱스/스트림 ID를 CRC 입력에
 * 포함하므로 비암호화 스트림에서도 프레임 재정렬·손상·교차 스트림 결합을 탐지합니다.
 */
function frameCrcBytes(streamId: string, frameIndex: number, payload: Uint8Array): Uint8Array {
  const sid = crcEncoder.encode(streamId);
  const combined = new Uint8Array(sid.length + 4 + payload.length);
  combined.set(sid, 0);
  new DataView(combined.buffer).setUint32(sid.length, frameIndex >>> 0, false);
  combined.set(payload, sid.length + 4);
  const value = parseInt(calculateCRC32(combined), 16) >>> 0;
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
}

const crcEncoder = /* @__PURE__ */ new TextEncoder();

/** 스트림 고유 식별자(8 랜덤 바이트 → 16 hex). Web Crypto는 모든 대상 런타임에서 전역. */
function generateStreamId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

function crc4Equals(a: Uint8Array, b: Uint8Array): boolean {
  return (
    a.length === 4 &&
    b.length === 4 &&
    a[0] === b[0] &&
    a[1] === b[1] &&
    a[2] === b[2] &&
    a[3] === b[3]
  );
}

/** DDS2 프레임드 스트림 옵션. */
export interface DduFramedStreamOptions extends DduStreamOptions {
  /** 프레임당 평문 바이트 수(기본 64 KiB). 메모리/압축률 트레이드오프. */
  frameSize?: number;
}

// ─── 인코딩 ──────────────────────────────────────────────────────────────────

/**
 * 바이너리를 DDS2 프레임드 charset 문자열로 변환하는 TransformStream을 생성합니다.
 * 압축/암호화 사용 여부와 무관하게 상수 메모리로 동작합니다.
 */
export function createFramedEncodeStream(
  encoder: Ddu64Core,
  options?: DduFramedStreamOptions,
): TransformStream<Uint8Array, string> {
  validateRuntimeOptions(options, "stream");
  const info = encoder.getCharSetInfo();
  const shouldCompress = options?.compress ?? info.defaultCompress;
  const shouldEncrypt = info.hasEncryptionKey;
  const shouldChecksum = options?.checksum ?? info.defaultChecksum;
  const algorithm = shouldCompress
    ? (options?.compressionAlgorithm ?? info.defaultCompressionAlgorithm)
    : undefined;
  const level = normalizeCompressionLevel(
    options?.compressionLevel ?? info.defaultCompressionLevel,
    algorithm ?? "deflate",
  );
  const frameSize = Math.max(1, Math.floor(options?.frameSize ?? DEFAULT_FRAME_SIZE));
  const maxBufferedBytes = normalizeLimit(
    options?.maxBufferedBytes,
    DEFAULT_MAX_BUFFERED_BYTES,
    true,
    "maxBufferedBytes",
  );

  let frameIndex = 0;
  let pending: Uint8Array[] = [];
  let pendingLen = 0;
  let headerEmitted = false;
  const streamId = generateStreamId();

  async function encodeFrame(plain: Uint8Array, isFinal: boolean): Promise<string> {
    const idx = frameIndex;
    let payload = plain;
    let flags = 0;
    if (shouldCompress && algorithm && payload.length > 0) {
      const compressed = await encoder.compressFrameAsync(payload, algorithm, level);
      if (compressed.length < payload.length) {
        payload = compressed;
        flags |= DDS2_FRAME_COMPRESSED;
      }
    }
    if (shouldEncrypt) {
      const aad = buildDds2FrameAAD(streamId, idx, algorithm);
      payload = await encoder.encryptFrameAsync(payload, aad);
    }
    if (isFinal) flags |= DDS2_FRAME_FINAL;

    // 프레임별 CRC(인덱스+스트림 ID 바인딩): 와이어 페이로드 뒤에 4바이트 append.
    let crc: Uint8Array | null = null;
    if (shouldChecksum) {
      flags |= DDS2_FRAME_CHECKSUM;
      crc = frameCrcBytes(streamId, idx, payload);
    }

    const frameBytes = new Uint8Array(1 + payload.length + (crc ? 4 : 0));
    frameBytes[0] = flags;
    frameBytes.set(payload, 1);
    if (crc) frameBytes.set(crc, 1 + payload.length);
    frameIndex++;
    return encoder.encodeFrameBytesAsync(frameBytes);
  }

  function takeFrameSlice(): Uint8Array {
    const out = new Uint8Array(frameSize);
    let offset = 0;
    let need = frameSize;
    while (need > 0 && pending.length > 0) {
      const head = pending[0];
      if (head.length <= need) {
        out.set(head, offset);
        offset += head.length;
        need -= head.length;
        pending.shift();
      } else {
        out.set(head.subarray(0, need), offset);
        pending[0] = head.subarray(need);
        offset += need;
        need = 0;
      }
    }
    pendingLen -= frameSize;
    return out;
  }

  return new TransformStream<Uint8Array, string>({
    async transform(chunk, controller) {
      try {
        if (!headerEmitted) {
          controller.enqueue(
            buildDds2Header({
              compressionAlgorithm: algorithm,
              encrypted: shouldEncrypt,
              streamId,
            }),
          );
          headerEmitted = true;
        }
        if (pendingLen + chunk.length > maxBufferedBytes) {
          throw new Ddu64LimitError(
            `[FramedStreams encode] Buffered input exceeds limit. Limit: ${maxBufferedBytes} bytes`,
            "stream",
          );
        }
        pending.push(chunk);
        pendingLen += chunk.length;

        // frameSize를 초과하는 동안에만 방출 → 마지막 프레임은 항상 flush에서 final로 처리.
        while (pendingLen > frameSize) {
          const slice = takeFrameSlice();
          controller.enqueue(SEPARATOR + (await encodeFrame(slice, false)));
        }
      } catch (err) {
        controller.error(wrapDdu64Error(err, "stream"));
      }
    },

    async flush(controller) {
      try {
        if (!headerEmitted) {
          controller.enqueue(
            buildDds2Header({
              compressionAlgorithm: algorithm,
              encrypted: shouldEncrypt,
              streamId,
            }),
          );
        }
        // 남은 바이트(0일 수 있음)를 final 프레임으로 방출. 빈 입력도 단일 final 프레임을 가진다.
        const remaining = new Uint8Array(Math.max(0, pendingLen));
        let offset = 0;
        for (const part of pending) {
          remaining.set(part, offset);
          offset += part.length;
        }
        pending = [];
        pendingLen = 0;
        controller.enqueue(SEPARATOR + (await encodeFrame(remaining, true)));
        controller.enqueue(SEPARATOR + buildDds2Trailer(frameIndex));
      } catch (err) {
        controller.error(wrapDdu64Error(err, "stream"));
      }
    },
  });
}

// ─── 디코딩 ──────────────────────────────────────────────────────────────────

/**
 * DDS2 프레임드 charset 문자열을 바이너리로 역변환하는 TransformStream을 생성합니다.
 * 프레임 경계(개행)마다 즉시 처리하여 상수 메모리로 동작합니다.
 */
export function createFramedDecodeStream(
  encoder: Ddu64Core,
  options?: DduFramedStreamOptions,
): TransformStream<string, Uint8Array> {
  validateRuntimeOptions(options, "stream");
  const info = encoder.getCharSetInfo();
  const maxBufferedChars = normalizeLimit(
    options?.maxBufferedChars,
    DEFAULT_MAX_BUFFERED_CHARS,
    true,
    "maxBufferedChars",
  );
  const maxDecompressedBytes = normalizeLimit(
    options?.maxDecompressedBytes,
    info.defaultMaxDecompressedBytes,
    true,
    "maxDecompressedBytes",
  );

  let buffer = "";
  let headerParsed = false;
  let header: {
    compressionAlgorithm?: "deflate" | "brotli";
    encrypted: boolean;
    streamId: string;
  } | null = null;
  let frameIndex = 0;
  let lastFrameWasFinal = false;
  let finished = false;

  async function decodeFrame(
    frameStr: string,
    controller: TransformStreamDefaultController<Uint8Array>,
  ) {
    if (finished) {
      throw new Ddu64StreamError("[FramedStreams decode] Frame received after final frame");
    }
    const frameBytes = await encoder.decodeFrameBytesAsync(frameStr);
    if (frameBytes.length < 1) {
      throw new Ddu64StreamError("[FramedStreams decode] Empty frame");
    }
    const idx = frameIndex;
    const flags = frameBytes[0];
    let payload = frameBytes.subarray(1);

    // 프레임별 CRC 검증(인덱스 바인딩) — decrypt/decompress 이전 와이어 바이트 대상.
    if (flags & DDS2_FRAME_CHECKSUM) {
      if (payload.length < 4) {
        throw new Ddu64StreamError("[FramedStreams decode] Frame too short for checksum");
      }
      const stored = payload.subarray(payload.length - 4);
      const wirePayload = payload.subarray(0, payload.length - 4);
      if (!crc4Equals(frameCrcBytes(header!.streamId, idx, wirePayload), stored)) {
        throw new Ddu64ChecksumError(
          `[FramedStreams decode] Frame checksum mismatch at frame ${idx}`,
        );
      }
      payload = wirePayload;
    }

    if (header!.encrypted) {
      const aad = buildDds2FrameAAD(header!.streamId, idx, header!.compressionAlgorithm);
      payload = await encoder.decryptFrameAsync(payload, aad);
    }
    if (flags & DDS2_FRAME_COMPRESSED) {
      if (!header!.compressionAlgorithm) {
        throw new Ddu64StreamError(
          "[FramedStreams decode] Frame marked compressed but header has no algorithm",
        );
      }
      payload = await encoder.decompressFrameAsync(
        payload,
        header!.compressionAlgorithm,
        maxDecompressedBytes,
      );
    }
    frameIndex++;
    lastFrameWasFinal = (flags & DDS2_FRAME_FINAL) !== 0;
    if (lastFrameWasFinal) finished = true;
    if (payload.length > 0) controller.enqueue(payload);
  }

  return new TransformStream<string, Uint8Array>({
    async transform(chunk, controller) {
      try {
        buffer += chunk;
        if (buffer.length > maxBufferedChars) {
          throw new Ddu64LimitError(
            `[FramedStreams decode] Buffered encoded input exceeds limit. Limit: ${maxBufferedChars} characters`,
            "stream",
          );
        }

        let nl = buffer.indexOf(SEPARATOR);
        while (nl !== -1) {
          const segment = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (!headerParsed) {
            header = parseDds2Header(segment);
            if (header.encrypted && !info.hasEncryptionKey) {
              throw new Ddu64StreamError(
                "[FramedStreams decode] Encrypted stream requires an encryptionKey",
              );
            }
            headerParsed = true;
          } else {
            // 개행으로 종료된 세그먼트는 항상 프레임(트레일러는 마지막에 개행 없이 남음).
            await decodeFrame(segment, controller);
          }
          nl = buffer.indexOf(SEPARATOR);
        }
      } catch (err) {
        controller.error(wrapDdu64Error(err, "stream"));
      }
    },

    async flush(controller) {
      try {
        if (!headerParsed) {
          if (buffer.length === 0) return;
          throw new Ddu64StreamError("[FramedStreams decode] Incomplete or missing DDS2 header");
        }
        // 남은 버퍼(개행 없음) = 트레일러.
        const { frameCount } = parseDds2Trailer(buffer);
        buffer = "";
        if (frameCount !== frameIndex) {
          throw new Ddu64StreamError(
            `[FramedStreams decode] Truncated stream: trailer declares ${frameCount} frames, got ${frameIndex}`,
          );
        }
        if (!lastFrameWasFinal) {
          throw new Ddu64StreamError(
            "[FramedStreams decode] Truncated stream: final frame flag not seen",
          );
        }
      } catch (err) {
        controller.error(wrapDdu64Error(err, "stream"));
      }
    },
  });
}
