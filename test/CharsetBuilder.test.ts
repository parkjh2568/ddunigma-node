import { describe, expect, it } from "vitest";
import { CharsetBuilder } from "../src/core/CharsetBuilder.js";

describe("CharsetBuilder", () => {
  it("builds common preset ranges", () => {
    expect(CharsetBuilder.uppercase().length).toBe(26);
    expect(CharsetBuilder.lowercase().length).toBe(26);
    expect(CharsetBuilder.digits().buildString()).toBe("0123456789");
    expect(CharsetBuilder.base32().length).toBe(32);
    expect(CharsetBuilder.base64().length).toBe(64);
    expect(CharsetBuilder.hangulJamo().length).toBe(67);
  });

  it("supports filtering, ordering, limiting, and copies", () => {
    const builder = CharsetBuilder.fromString("Aa0O1lIibB")
      .excludeConfusing()
      .exclude("B")
      .unique()
      .sort()
      .reverse()
      .limit(3);

    const first = builder.build();
    first.push("X");
    expect(builder.build()).not.toContain("X");
    expect(builder.length).toBeLessThanOrEqual(3);
  });

  it("uses deterministic seeded shuffle", () => {
    const left = CharsetBuilder.fromString("abcdef").shuffle(42).buildString();
    const right = CharsetBuilder.fromString("abcdef").shuffle(42).buildString();
    expect(left).toBe(right);
  });

  it("limits to the nearest lower power of two", () => {
    expect(CharsetBuilder.fromString("abcdef").limitToPowerOfTwo().length).toBe(4);
    expect(CharsetBuilder.create().limitToPowerOfTwo().length).toBe(0);
  });

  it("builds a non-conflicting padding character", () => {
    expect(CharsetBuilder.base64().buildWithPadding()).toEqual({
      charset: [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"],
      padding: "=",
    });
  });

  it("rejects invalid ranges, limits, and padding", () => {
    expect(() => CharsetBuilder.fromUnicodeRange(-1, 1)).toThrow(RangeError);
    expect(() => CharsetBuilder.fromUnicodeRange(2, 1)).toThrow(RangeError);
    expect(() => CharsetBuilder.fromUnicodeRange(0, 0x110000)).toThrow(RangeError);
    expect(() => CharsetBuilder.create().limit(0.5)).toThrow(RangeError);
    expect(() => CharsetBuilder.fromString("=").buildWithPadding("=")).toThrow("must not appear");
    expect(() => CharsetBuilder.base64().buildWithPadding("XX")).toThrow("one UTF-16");
    expect(() => CharsetBuilder.base64().buildWithPadding("")).toThrow("one UTF-16");
  });
});
