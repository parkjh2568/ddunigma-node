/**
 * DDS2 프레임드 스트리밍 테스트.
 *
 * 라운드트립(평문/압축/암호화), 프레임/청크 크기 불변성, 그리고 적대적 시나리오
 * (절단/재정렬/변조)에서의 거부를 검증한다. 적대적 테스트가 보안 속성(재정렬·절단·변조
 * 탐지)의 구체 증거 역할을 한다.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { Ddu64Node } from "../Ddu64Node.js";
import {
  createFramedEncodeStream,
  createFramedDecodeStream,
  type DduFramedStreamOptions,
} from "../streams/FramedStreams.js";

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function encodeAll(
  encoder: Ddu64Node,
  options: DduFramedStreamOptions | undefined,
  input: Uint8Array,
  chunkSize = 4096,
): Promise<string> {
  const ts = createFramedEncodeStream(encoder, options);
  const writer = ts.writable.getWriter();
  const reader = ts.readable.getReader();
  let out = "";
  const readPromise = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out += value;
    }
  })();
  const writePromise = (async () => {
    for (let i = 0; i < input.length; i += chunkSize) {
      await writer.write(input.subarray(i, i + chunkSize));
    }
    await writer.close();
  })().catch(() => {}); // 실제 에러는 readPromise로 표면화; write측 reject는 흡수
  await writePromise;
  await readPromise;
  return out;
}

async function decodeAll(
  encoder: Ddu64Node,
  options: DduFramedStreamOptions | undefined,
  encoded: string,
  chunkSize = 64,
): Promise<Uint8Array> {
  const ts = createFramedDecodeStream(encoder, options);
  const writer = ts.writable.getWriter();
  const reader = ts.readable.getReader();
  const chunks: Uint8Array[] = [];
  const readPromise = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  })();
  const writePromise = (async () => {
    for (let i = 0; i < encoded.length; i += chunkSize) {
      await writer.write(encoded.slice(i, i + chunkSize));
    }
    await writer.close();
  })().catch(() => {}); // 실제 에러는 readPromise로 표면화; write측 reject는 흡수
  await writePromise;
  await readPromise;
  return concat(chunks);
}

const KEY_OPTS = {
  encryptionKey: "framed-test-key",
  keyDerivation: { algorithm: "sha256" },
} as const;

describe("DDS2 framed streaming — round-trip", () => {
  const sizes = [0, 1, 63, 64, 65, 200, 1000];

  for (const size of sizes) {
    it(`plain round-trips at size ${size} (frameSize 64)`, async () => {
      const enc = new Ddu64Node();
      const input = new Uint8Array(size);
      for (let i = 0; i < size; i++) input[i] = (i * 37 + 11) & 0xff;
      const encoded = await encodeAll(enc, { frameSize: 64 }, input);
      const decoded = await decodeAll(enc, { frameSize: 64 }, encoded);
      expect(decoded).toEqual(input);
    });
  }

  it("compress round-trips", async () => {
    const enc = new Ddu64Node({ compress: true });
    const input = new TextEncoder().encode("ABCABCABC".repeat(500));
    const encoded = await encodeAll(enc, { frameSize: 256 }, input);
    const decoded = await decodeAll(enc, { frameSize: 256 }, encoded);
    expect(decoded).toEqual(input);
  });

  it("encrypt round-trips (multi-frame)", async () => {
    const enc = new Ddu64Node(KEY_OPTS);
    const input = new Uint8Array(1000);
    for (let i = 0; i < input.length; i++) input[i] = (i * 13 + 7) & 0xff;
    const encoded = await encodeAll(enc, { frameSize: 100 }, input);
    const decoded = await decodeAll(enc, { frameSize: 100 }, encoded);
    expect(decoded).toEqual(input);
  });

  it("encrypt + compress round-trips", async () => {
    const enc = new Ddu64Node({ ...KEY_OPTS, compress: true });
    const input = new TextEncoder().encode("hello world ".repeat(400));
    const encoded = await encodeAll(enc, { frameSize: 128 }, input);
    const decoded = await decodeAll(enc, { frameSize: 128 }, encoded);
    expect(decoded).toEqual(input);
  });
});

describe("DDS2 framed streaming — invariance", () => {
  it("decoded output is independent of frameSize", async () => {
    const enc = new Ddu64Node(KEY_OPTS);
    const input = new Uint8Array(777);
    for (let i = 0; i < input.length; i++) input[i] = (i * 53 + 1) & 0xff;
    const a = await decodeAll(enc, undefined, await encodeAll(enc, { frameSize: 16 }, input));
    const b = await decodeAll(enc, undefined, await encodeAll(enc, { frameSize: 500 }, input));
    expect(a).toEqual(input);
    expect(b).toEqual(input);
  });

  it("decode is independent of input chunk boundaries (property)", async () => {
    const enc = new Ddu64Node();
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 0, maxLength: 600 }),
        fc.integer({ min: 1, max: 50 }),
        async (bytes, decChunk) => {
          const input = new Uint8Array(bytes);
          const encoded = await encodeAll(enc, { frameSize: 48 }, input);
          const decoded = await decodeAll(enc, { frameSize: 48 }, encoded, decChunk);
          expect(decoded).toEqual(input);
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe("DDS2 framed streaming — adversarial (must reject)", () => {
  async function expectDecodeThrows(enc: Ddu64Node, encoded: string): Promise<void> {
    await expect(decodeAll(enc, undefined, encoded)).rejects.toBeTruthy();
  }

  it("rejects truncated stream (dropped trailer)", async () => {
    const enc = new Ddu64Node(KEY_OPTS);
    const input = new Uint8Array(500).fill(7);
    const encoded = await encodeAll(enc, { frameSize: 64 }, input);
    const segments = encoded.split("\n");
    segments.pop(); // drop trailer
    await expectDecodeThrows(enc, segments.join("\n"));
  });

  it("rejects trailer with wrong frame count", async () => {
    const enc = new Ddu64Node();
    const input = new Uint8Array(300).fill(3);
    const encoded = await encodeAll(enc, { frameSize: 64 }, input);
    const segments = encoded.split("\n");
    segments[segments.length - 1] = "DDE2999";
    await expectDecodeThrows(enc, segments.join("\n"));
  });

  it("rejects reordered frames (encrypted, AAD binds index)", async () => {
    const enc = new Ddu64Node(KEY_OPTS);
    const input = new Uint8Array(500);
    for (let i = 0; i < input.length; i++) input[i] = i & 0xff;
    const encoded = await encodeAll(enc, { frameSize: 64 }, input);
    const segments = encoded.split("\n");
    // segments: [header, f0, f1, ..., trailer]. swap first two frames.
    expect(segments.length).toBeGreaterThan(4);
    const tmp = segments[1];
    segments[1] = segments[2];
    segments[2] = tmp;
    await expectDecodeThrows(enc, segments.join("\n"));
  });

  it("rejects tampered ciphertext (encrypted, GCM tag)", async () => {
    const enc = new Ddu64Node(KEY_OPTS);
    const input = new Uint8Array(400).fill(9);
    const encoded = await encodeAll(enc, { frameSize: 64 }, input);
    const segments = encoded.split("\n");
    // 첫 프레임 문자 하나를 charset 내 다른 문자로 교체(charset 유지해 디코드는 진행, GCM에서 실패).
    const frame = segments[1];
    const chars = [...frame];
    chars[chars.length - 1] = chars[chars.length - 1] === "뜌" ? "땨" : "뜌";
    segments[1] = chars.join("");
    await expectDecodeThrows(enc, segments.join("\n"));
  });

  it("rejects cross-stream frame splicing (encrypted, stream id in AAD)", async () => {
    const enc = new Ddu64Node(KEY_OPTS);
    const inputA = new Uint8Array(400);
    const inputB = new Uint8Array(400);
    for (let i = 0; i < 400; i++) {
      inputA[i] = i & 0xff;
      inputB[i] = (i * 7 + 3) & 0xff;
    }
    const a = (await encodeAll(enc, { frameSize: 64 }, inputA)).split("\n");
    const b = (await encodeAll(enc, { frameSize: 64 }, inputB)).split("\n");
    // 스트림 B의 한 프레임을 스트림 A에 끼워넣음 → 헤더 streamId 불일치로 AAD 검증 실패
    a[2] = b[2];
    await expect(decodeAll(enc, undefined, a.join("\n"))).rejects.toBeTruthy();
  });

  it("rejects tampered header stream id (encrypted)", async () => {
    const enc = new Ddu64Node(KEY_OPTS);
    const input = new Uint8Array(300).fill(5);
    const encoded = await encodeAll(enc, { frameSize: 64 }, input);
    const segments = encoded.split("\n");
    const h = segments[0]; // "DDS2" + comp + enc + 16 hex
    const hex = [...h.slice(6)];
    hex[0] = hex[0] === "0" ? "1" : "0";
    segments[0] = h.slice(0, 6) + hex.join("");
    await expect(decodeAll(enc, undefined, segments.join("\n"))).rejects.toBeTruthy();
  });
});

describe("DDS2 framed streaming — per-frame checksum (non-encrypted integrity)", () => {
  it("checksum round-trips (plain + compress)", async () => {
    const enc = new Ddu64Node({ checksum: true, compress: true });
    const input = new TextEncoder().encode("integrity ".repeat(300));
    const encoded = await encodeAll(enc, { frameSize: 128 }, input);
    expect(encoded).toContain("DDS2");
    const decoded = await decodeAll(enc, undefined, encoded);
    expect(decoded).toEqual(input);
  });

  it("detects corrupted frame when checksum is on (non-encrypted)", async () => {
    const enc = new Ddu64Node({ checksum: true });
    const input = new Uint8Array(400);
    for (let i = 0; i < input.length; i++) input[i] = (i * 17) & 0xff;
    const encoded = await encodeAll(enc, { frameSize: 64 }, input);
    const segments = encoded.split("\n");
    const chars = [...segments[1]];
    const mid = Math.floor(chars.length / 2); // flags 바이트(첫 char)가 아닌 페이로드 영역 손상
    chars[mid] = chars[mid] === "뜌" ? "땨" : "뜌";
    segments[1] = chars.join("");
    await expect(decodeAll(enc, undefined, segments.join("\n"))).rejects.toBeTruthy();
  });

  it("detects reordered frames when checksum is on (non-encrypted)", async () => {
    const enc = new Ddu64Node({ checksum: true });
    const input = new Uint8Array(400);
    for (let i = 0; i < input.length; i++) input[i] = i & 0xff;
    const encoded = await encodeAll(enc, { frameSize: 64 }, input);
    const segments = encoded.split("\n");
    expect(segments.length).toBeGreaterThan(4);
    const tmp = segments[1];
    segments[1] = segments[2];
    segments[2] = tmp;
    // 인덱스 바인딩 CRC → 재정렬 시 불일치 탐지
    await expect(decodeAll(enc, undefined, segments.join("\n"))).rejects.toBeTruthy();
  });
});
