/**
 * 스코프 자기기술 체크섬(CK) 결정론적 테스트 벡터 생성기.
 * (과거 'v5 체크섬'으로 불렸으나 폐기된 'v5 KDF envelope'와는 무관.)
 *
 * 체크섬 접미사만 `CHK[8hex]` → `CK[P|O][8hex]`로 바꾸고 payload+footer는 4.x와 동일합니다.
 * 따라서 기존 4.x 코덱으로 payload+footer를 생성하고(체크섬 off), scope에 따른 CRC를 계산해
 * 기대 출력을 조립합니다. 회귀 기준이 될 벡터를 고정하기 위한 스크립트입니다.
 *
 * 실행: npx tsx scripts/gen-scoped-checksum-vectors.ts
 * 출력: src/test/fixtures/scoped-checksum-vectors.json
 *
 * @module scripts/gen-scoped-checksum-vectors
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ddu64Node } from "../src/Ddu64Node.js";
import { calculateCRC32 } from "../src/core/codecUtils.js";

const CHECKSUM_MARKER_V5 = "CK";

interface V5Vector {
  id: string;
  description: string;
  input: { raw: string; encoding: "binary" };
  charset: { preset: "ddu" };
  options: {
    compress?: boolean;
    encryptionKey?: string;
    checksum: true;
    checksumScope: "plaintext" | "output";
  };
  /** 기대 체크섬이 어떤 바이트의 CRC32인지 (검증 보조) */
  checksumSource: "plaintext" | "output";
  expected: {
    /** 결정론적 케이스에서만 채워짐 (암호화는 round-trip-only) */
    encoded: string | null;
    checksumMarker: "CK";
    scopeChar: "P" | "O";
    checksumHex: string | null;
  };
  tags: string[];
}

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

const inputs: Array<{ id: string; bytes: Uint8Array; note: string }> = [
  { id: "ascii-hello", bytes: new TextEncoder().encode("Hello"), note: "ASCII 'Hello'" },
  { id: "korean", bytes: new TextEncoder().encode("안녕하세요"), note: "Korean UTF-8" },
  {
    id: "binary-edge",
    bytes: new Uint8Array([0, 1, 127, 128, 255]),
    note: "binary edge bytes",
  },
  {
    id: "compressible",
    bytes: new TextEncoder().encode("A".repeat(200)),
    note: "highly compressible (200x 'A')",
  },
];

const vectors: V5Vector[] = [];

for (const inp of inputs) {
  for (const scope of ["plaintext", "output"] as const) {
    const scopeChar = scope === "plaintext" ? "P" : "O";

    // ── 비암호화 결정론적 케이스 (plain / compress) ──
    for (const compress of [false, true]) {
      const enc = new Ddu64Node(undefined, undefined, { compress });
      // 체크섬 off → payload + footer (V5에서 그대로 재사용)
      const payloadFooter = enc.encode(inp.bytes, { compress, checksum: false });

      // scope에 따른 CRC 소스 바이트
      let sourceBytes: Uint8Array;
      if (scope === "plaintext") {
        sourceBytes = inp.bytes;
      } else {
        // 출력 scope: 실제 비트팩된 와이어 바이트 = compress:false로 디코드(인플레이트 생략)
        sourceBytes = enc.decodeToUint8Array(payloadFooter, { compress: false, checksum: false });
      }
      const checksumHex = calculateCRC32(sourceBytes);
      const encoded = payloadFooter + CHECKSUM_MARKER_V5 + scopeChar + checksumHex;

      vectors.push({
        id: `v5-${inp.id}-${compress ? "deflate" : "plain"}-scope${scopeChar}`,
        description: `${inp.note}, ${compress ? "deflate" : "no-compress"}, checksumScope=${scope}`,
        input: { raw: toHex(inp.bytes), encoding: "binary" },
        charset: { preset: "ddu" },
        options: { compress: compress || undefined, checksum: true, checksumScope: scope },
        checksumSource: scope,
        expected: { encoded, checksumMarker: CHECKSUM_MARKER_V5, scopeChar, checksumHex },
        tags: ["deterministic", compress ? "deflate" : "plain", `scope-${scope}`],
      });
    }

    // ── 암호화 케이스 (round-trip only: 랜덤 IV로 비결정론적) ──
    vectors.push({
      id: `v5-${inp.id}-encrypt-scope${scopeChar}`,
      description: `${inp.note}, AES-256-GCM, checksumScope=${scope} (round-trip only)`,
      input: { raw: toHex(inp.bytes), encoding: "binary" },
      charset: { preset: "ddu" },
      options: { encryptionKey: "v5-vector-key", checksum: true, checksumScope: scope },
      checksumSource: scope,
      expected: { encoded: null, checksumMarker: CHECKSUM_MARKER_V5, scopeChar, checksumHex: null },
      tags: ["round-trip-only", "encrypt", `scope-${scope}`],
    });
  }
}

const out = {
  version: "v5-draft-1",
  description:
    "ddunigma 5.0 V5 wire-format (self-describing checksum) deterministic test vectors. " +
    "Footer checksum suffix: CK[P|O][8 lowercase hex]. payload+footer identical to 4.x. " +
    "Encrypted vectors are round-trip-only (random IV).",
  markerSpec: {
    checksumMarkerV5: CHECKSUM_MARKER_V5,
    scopeChars: { plaintext: "P", output: "O" },
    suffixPattern: "^CK[PO][0-9a-f]{8}$",
    legacyMarker: "CHK",
    notes:
      "Decoder must try V5 (CK[PO][8hex]) first, then legacy CHK[8hex]. Fixed-length + scope char + " +
      "8 hex validation mitigates accidental collisions in charsets containing C/H/K and hex digits.",
  },
  vectors,
};

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "..", "src", "test", "fixtures", "scoped-checksum-vectors.json");
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf-8");

const deterministic = vectors.filter((v) => v.tags.includes("deterministic")).length;
const roundTrip = vectors.filter((v) => v.tags.includes("round-trip-only")).length;
console.log(
  `Wrote ${vectors.length} vectors (${deterministic} deterministic, ${roundTrip} round-trip-only) to ${outPath}`,
);
