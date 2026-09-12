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
      // types/ and interfaces/ hold only declarations, which erase to empty
      // modules -- they would otherwise report 0% and drag the total down.
      exclude: ["**/*.test.*", "ts/types/**", "ts/interfaces/**"],
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
