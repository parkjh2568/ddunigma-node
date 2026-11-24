import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

describe("benchmark command failures", () => {
  it("delivers a large concurrent final result before disconnecting IPC", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        fileURLToPath(new URL("../benchmarks/stream-benchmark.ts", import.meta.url)),
      ],
      {
        encoding: "utf8",
        timeout: 20_000,
        maxBuffer: 4 * 1024 * 1024,
        env: {
          ...process.env,
          DDU_BENCH_SAMPLES: "20",
          DDU_BENCH_FILTER: "plain-encode-16k",
          DDU_BENCH_CONCURRENCY: "16",
          DDU_BENCH_TIMEOUT_MS: "15000",
          DDU_BENCH_MAX_RSS_MIB: "512",
        },
      },
    );
    expect(result.status, result.stderr).toBe(0);
    const rows = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const completed = rows.at(-1);
    expect(completed).toMatchObject({ status: "ok", samples: 20, concurrency: 16 });
    expect(completed.raw).toHaveLength(20);
    expect(
      completed.raw.every((sample: { streams: unknown[] }) => sample.streams.length === 16),
    ).toBe(true);
  });
  it.each([
    { script: "latency-benchmark.ts", settings: { DDU_BENCH_SAMPLES: "19" } },
    { script: "latency-benchmark.ts", settings: { DDU_BENCH_FILTER: "does-not-exist" } },
    { script: "stream-benchmark.ts", settings: { DDU_BENCH_SAMPLES: "19" } },
    { script: "stream-benchmark.ts", settings: { DDU_BENCH_FILTER: "" } },
    { script: "stream-benchmark.ts", settings: { DDU_BENCH_FILTER: "does-not-exist" } },
  ])("rejects invalid configuration: $script $settings", ({ script, settings }) => {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", fileURLToPath(new URL(`../benchmarks/${script}`, import.meta.url))],
      {
        encoding: "utf8",
        timeout: 15_000,
        env: {
          ...process.env,
          DDU_BENCH_SAMPLES: "20",
          DDU_BENCH_FILTER: "plain-encode-16k",
          ...settings,
        },
      },
    );
    expect(result.status).toBe(1);
    const rows = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(rows.at(-1)).toEqual(
      expect.objectContaining(
        script === "latency-benchmark.ts" ? { type: "failure" } : { status: "failed" },
      ),
    );
  });

  it.each([
    {
      reason: "deadline",
      fixture: "await new Promise(resolve => setTimeout(resolve, 1000));",
      settings: { DDU_BENCH_TIMEOUT_MS: "100", DDU_BENCH_MAX_RSS_MIB: "512" },
    },
    {
      reason: "observed-rss-limit",
      fixture: `
        const send = process.send.bind(process);
        let injected = false;
        process.send = (message, ...args) => {
          const result = send(message, ...args);
          if (message?.kind === "sample" && !injected) {
            injected = true;
            globalThis.__dduBenchmarkMemory = new Uint8Array(256 * 1024 * 1024).fill(1);
            send({ kind: "memory", rssBytes: process.memoryUsage().rss, maxRssKiB: process.resourceUsage().maxRSS });
          }
          return result;
        };
      `,
      settings: { DDU_BENCH_TIMEOUT_MS: "10000", DDU_BENCH_MAX_RSS_MIB: "256" },
    },
  ])(
    "preserves child $reason failures and terminates the child",
    ({ reason, fixture, settings }) => {
      const root = mkdtempSync(join(tmpdir(), "ddunigma-child-failure-"));
      try {
        const preload = join(root, "preload.mjs");
        writeFileSync(preload, `if (process.argv.includes("--scenario")) { ${fixture} }`);
        const result = spawnSync(
          process.execPath,
          [
            "--import",
            "tsx",
            "--import",
            pathToFileURL(preload).href,
            fileURLToPath(new URL("../benchmarks/stream-benchmark.ts", import.meta.url)),
          ],
          {
            encoding: "utf8",
            timeout: 20_000,
            env: {
              ...process.env,
              DDU_BENCH_SAMPLES: "20",
              DDU_BENCH_FILTER: "plain-encode-16k",
              DDU_BENCH_CONCURRENCY: "1",
              ...settings,
            },
          },
        );
        expect(result.status).toBe(1);
        const rows = result.stdout
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        expect(rows.at(-1)).toMatchObject({ status: "failed", reason, signal: "SIGKILL" });
        expect(Array.isArray(rows.at(-1).raw)).toBe(true);
        expect(rows.at(-1).completedSamples).toBe(rows.at(-1).raw.length);
        if (reason === "observed-rss-limit")
          expect(rows.at(-1).completedSamples).toBeGreaterThan(0);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
