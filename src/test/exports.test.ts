import { describe, expect, it } from "vitest";
import * as nodeEntry from "../index.js";
import * as browserEntry from "../browser.js";
import * as coreEntry from "../core.js";

describe("public entry exports", () => {
  it("exports custom error helpers from all public entries", () => {
    const entries = [nodeEntry, browserEntry, coreEntry];

    for (const entry of entries) {
      const error = new entry.Ddu64DecodeError("decode failed");

      expect(entry.Ddu64ErrorCode.ChecksumMismatch).toBe("DDU64_CHECKSUM_MISMATCH");
      expect(error).toBeInstanceOf(entry.Ddu64Error);
      expect(entry.isDdu64Error(error)).toBe(true);
      expect(error.code).toBe(entry.Ddu64ErrorCode.DecodeFailed);
    }
  });
});
