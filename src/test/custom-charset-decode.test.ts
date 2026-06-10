/**
 * Custom charset + padding decode regression tests.
 *
 * Pins a real-world custom charset/padding configuration and a set of
 * encoded payloads to their decoded values. Guards against regressions in
 * custom (non-predefined) charset lookup, padding handling, and the shared
 * lookup-table cache changes.
 */

import { describe, it, expect } from "vitest";
import { Ddu64Node } from "../Ddu64Node.js";

const CHARSET =
  "qw74QW7ETefgtnkoY6UIOPZXCVBNMertyASDwdfghumJDGEUISO9AKXMCBnbvffeqsFGHJpkcnmxjshqiowpejtnrjcKLuioplkjhgfdsazxcvbnm";
const PADDING = "R";

/** Encoded payload → expected decoded string. */
const VECTORS: ReadonlyArray<readonly [encoded: string, decoded: string]> = [
  ["qoq4qnqxqoq4qew7qnqOqqwqqnqOqqqiqnq6R4", "8308291071021"],
  ["qoq4q6qxqnquqQqaqnqOqqwqqnq4qqqiqnqqR4", "8402151070020"],
  ["qoq4qrqaqoq4qVqxqnqOqPwwqnqqR4", "8758601580"],
  ["qoq4qDqxqoq4qQw7qnqOqeqiqnqLqVqjqnqxR4", "8808191223613"],
  ["qkquq6qjqnq4qeqiqnqOqPqiqoq4qqqjqnqxR4", "6410221528013"],
  ["qkqLqrqxqnqOqeqaqnqOqeqLqkqLqVqjqkqxR4", "7701251237617"],
  ["qoq4qPqxqoq4qqqjqnqOqVwwqkqOqrqjqkq6R4", "8508011685715"],
  ["qoq4qmqxqkquqQqLqnqOqqwqqoqOqmqjqoqqR4", "8906131079918"],
  ["qoqOqQqxqnqOqewqqnqOqQqzqoqOqPqjqoqqR4", "9101271169518"],
  ["qoq4qQqxqoq4qewqqnqOqQwqqoq4qnqjqkqDR4", "8108271178316"],
  ["qoq4qeqxqnqLqewwqnqOq6wqqnq4qVqjqkqDR4", "8203281470616"],
  ["qkquqeqxqnquqQqlqnquqeqlqkqOqVqjqkqDR4", "6202142245616"],
  ["qoqOqPqxqoq4qqwqqnqOqqqlqkquqQqjqnq6R4", "9508071046111"],
  ["qoq4qDqxqoq4qQw7qnqOqeqiqnqLqVqjqnqxR4", "8808191223613"],
  ["qkqLqDqxqoqOqeqLqnqOqqqzqnqLqQqiqkqDR4", "7809231063126"],
  ["qoqOqVqxqkq4qqqz", "960406"],
  ["qoq4qmqxqnquqQqLqnqOqQwqqnq4qqqjqkq6R4", "8902131170015"],
  ["qoqOqVqxqnquqQqaqnqOqQqaqnqLqVqjqnqDR4", "9602151153612"],
  ["qoqOqqqxqoqOqewqqnqOqeqlqoqOqVqlqnqDR4", "9009271249642"],
  ["qoq4qmqxqnqOqqqiqnqLqQqjqkquqnqiqkq4qDR2", "89010231163248"],
  ["qkqLqqqjqnq4qqqiqnqOqQqiqnqLqeqiqoqqR4", "7010021123228"],
  ["qkquqmqxqoqOqeqaqnqOqQwwqnquqVqjqnqqR4", "6909251182610"],
  ["qoqOqVqjqnq4qew7qnqOqqwqqkqLqeqiqnq6R4", "9610291077221"],
  ["qkqLqeqxqnqLqqqLqnqOqPqLqkqLqmqjqnqqR4", "7203031537910"],
];

describe("custom charset + padding decode", () => {
  function createEncoder(): Ddu64Node {
    return new Ddu64Node(CHARSET, PADDING, { throwOnError: false });
  }

  it.each(VECTORS)("decodes %s → %s", (encoded, expected) => {
    const encoder = createEncoder();
    expect(encoder.decode(encoded)).toBe(expected);
  });

  it("decodes every vector with a single shared encoder instance", () => {
    const encoder = createEncoder();
    for (const [encoded, expected] of VECTORS) {
      expect(encoder.decode(encoded)).toBe(expected);
    }
  });

  it("re-encodes decoded values back to the original payload", () => {
    const encoder = createEncoder();
    for (const [encoded] of VECTORS) {
      const decoded = encoder.decode(encoded);
      expect(encoder.decode(encoder.encode(decoded))).toBe(decoded);
    }
  });
});
