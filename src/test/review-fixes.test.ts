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
});
