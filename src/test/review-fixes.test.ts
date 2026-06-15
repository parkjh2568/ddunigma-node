/**
 * 외부 리뷰에서 확인된 결함에 대한 회귀 테스트.
 */

import { describe, expect, it } from "vitest";
import { Ddu64Node } from "../Ddu64Node.js";

describe("review fixes", () => {
  describe("empty encryptionKey is rejected (no plaintext/decrypt mismatch)", () => {
    it("throws on empty-string encryptionKey at construction", () => {
      expect(() => new Ddu64Node({ encryptionKey: "" })).toThrow(/non-empty string/i);
    });

    it("throws on per-call empty encryptionKey is not applicable; valid key round-trips", () => {
      const ddu = new Ddu64Node({ encryptionKey: "k" });
      const enc = ddu.encode("secret");
      expect(ddu.decode(enc)).toBe("secret");
    });
  });

  describe("lone surrogate charset/padding is rejected", () => {
    const base = ["A", "B", "C"];

    it("rejects a lone high surrogate in the charset", () => {
      expect(() => new Ddu64Node([...base, "\uD800"], "=")).toThrow(/surrogate/i);
    });

    it("rejects a lone low surrogate in the charset", () => {
      expect(() => new Ddu64Node([...base, "\uDC00"], "=")).toThrow(/surrogate/i);
    });

    it("rejects a lone surrogate padding character", () => {
      expect(() => new Ddu64Node(base, "\uD800")).toThrow(/surrogate/i);
    });

    it("accepts a normal BMP charset", () => {
      const ddu = new Ddu64Node(["A", "B", "C", "D"], "=");
      expect(ddu.decode(ddu.encode("AB"))).toBe("AB");
    });
  });

  describe("maxEncodedChars precheck", () => {
    it("rejects oversized encoded input before preprocessing", () => {
      const ddu = new Ddu64Node({ maxEncodedChars: 100 });
      const huge = "\n".repeat(1000);
      expect(() => ddu.decode(huge)).toThrow(/exceeds limit/i);
    });

    it("allows input within the limit", () => {
      const ddu = new Ddu64Node({ maxEncodedChars: 1000 });
      const enc = ddu.encode("hello");
      expect(ddu.decode(enc)).toBe("hello");
    });
  });

  describe("chunkSize: 0 disables a constructor default", () => {
    it("call-level chunkSize 0 overrides constructor chunkSize", () => {
      const ddu = new Ddu64Node(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
        "=",
        { chunkSize: 4, chunkSeparator: "\n" },
      );
      const chunked = ddu.encode("hello world payload");
      expect(chunked).toContain("\n");
      const flat = ddu.encode("hello world payload", { chunkSize: 0 });
      expect(flat).not.toContain("\n");
      expect(ddu.decode(flat)).toBe("hello world payload");
    });
  });

  describe("sparse/high-codepoint charset lookup (offset table)", () => {
    it("round-trips a charset with a high BMP code unit", () => {
      const ddu = new Ddu64Node(["가", "나", "다", "힣"], "뭐");
      const input = new Uint8Array([0, 1, 200, 255, 42]);
      expect(ddu.decodeToUint8Array(ddu.encode(input))).toEqual(input);
    });
  });
});
