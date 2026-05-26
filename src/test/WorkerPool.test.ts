/**
 * Unit tests for WorkerPool manager.
 *
 * Tests focus on pool management logic and validation.
 * Actual worker communication is tested separately in integration tests.
 */

import { describe, it, expect, afterEach } from "vitest";
import { WorkerPoolImpl, setWorkerPoolSize } from "../workers/WorkerPool.js";

describe("WorkerPool", () => {
  let pool: WorkerPoolImpl;

  afterEach(async () => {
    if (pool) {
      await pool.terminate();
    }
  });

  describe("setPoolSize validation", () => {
    it("should accept valid integer pool sizes within [1, 64]", () => {
      pool = new WorkerPoolImpl();

      expect(() => pool.setPoolSize(1)).not.toThrow();
      expect(() => pool.setPoolSize(4)).not.toThrow();
      expect(() => pool.setPoolSize(32)).not.toThrow();
      expect(() => pool.setPoolSize(64)).not.toThrow();
    });

    it("should throw on non-integer values", () => {
      pool = new WorkerPoolImpl();

      expect(() => pool.setPoolSize(1.5)).toThrow(/integer/i);
      expect(() => pool.setPoolSize(2.7)).toThrow(/integer/i);
      expect(() => pool.setPoolSize(0.1)).toThrow(/integer/i);
      expect(() => pool.setPoolSize(NaN)).toThrow(/integer/i);
      expect(() => pool.setPoolSize(Infinity)).toThrow(/integer/i);
      expect(() => pool.setPoolSize(-Infinity)).toThrow(/integer/i);
    });

    it("should throw on values less than 1", () => {
      pool = new WorkerPoolImpl();

      expect(() => pool.setPoolSize(0)).toThrow(/between 1 and 64/i);
      expect(() => pool.setPoolSize(-1)).toThrow(/between 1 and 64/i);
      expect(() => pool.setPoolSize(-100)).toThrow(/between 1 and 64/i);
    });

    it("should throw on values greater than 64", () => {
      pool = new WorkerPoolImpl();

      expect(() => pool.setPoolSize(65)).toThrow(/between 1 and 64/i);
      expect(() => pool.setPoolSize(100)).toThrow(/between 1 and 64/i);
      expect(() => pool.setPoolSize(1000)).toThrow(/between 1 and 64/i);
    });

    it("should include the invalid value in the error message", () => {
      pool = new WorkerPoolImpl();

      expect(() => pool.setPoolSize(3.14)).toThrow("3.14");
      expect(() => pool.setPoolSize(100)).toThrow("100");
    });
  });

  describe("setWorkerPoolSize (module-level function)", () => {
    it("should validate range [1, 64]", () => {
      expect(() => setWorkerPoolSize(1)).not.toThrow();
      expect(() => setWorkerPoolSize(64)).not.toThrow();
      expect(() => setWorkerPoolSize(0)).toThrow();
      expect(() => setWorkerPoolSize(65)).toThrow();
    });

    it("should throw on non-integer", () => {
      expect(() => setWorkerPoolSize(2.5)).toThrow(/integer/i);
    });
  });

  describe("pool lifecycle", () => {
    it("should be terminable without errors", async () => {
      pool = new WorkerPoolImpl();
      await expect(pool.terminate()).resolves.toBeUndefined();
    });

    it("should reject operations after termination", async () => {
      pool = new WorkerPoolImpl();
      await pool.terminate();

      const config = {
        charSet: ["a", "b", "c", "d"],
        paddingChar: "=",
        bitLength: 2,
        usePowerOfTwo: true,
      };

      await expect(pool.encode(new Uint8Array([1, 2, 3]), config)).rejects.toThrow(/terminated/i);
      await expect(pool.decode("abc", config)).rejects.toThrow(/terminated/i);
    });

    it("should allow multiple terminate calls", async () => {
      pool = new WorkerPoolImpl();
      await pool.terminate();
      await expect(pool.terminate()).resolves.toBeUndefined();
    });
  });

  describe("pool construction", () => {
    it("should accept a custom initial pool size", () => {
      pool = new WorkerPoolImpl(8);
      // No throw means it accepted the size
      expect(() => pool.setPoolSize(8)).not.toThrow();
    });

    it("should use default pool size when none provided", () => {
      pool = new WorkerPoolImpl();
      // Should not throw - default is CPU cores - 1, clamped to [1, 64]
      expect(pool).toBeDefined();
    });
  });
});
