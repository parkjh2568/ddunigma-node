import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 87,
        branches: 82,
        functions: 90,
        lines: 88,
      },
    },
  },
});
