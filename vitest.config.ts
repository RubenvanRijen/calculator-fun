import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    // Logic tests run in plain Node; the DOM-wiring tests opt into jsdom with
    // a `// @vitest-environment jsdom` comment at the top of the file.
    environment: "node",
    include: ["ts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["ts/**/*.ts"],
      exclude: ["**/*.test.*"],
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
