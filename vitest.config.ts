import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    root: "./",
    // Only include tests from src directory, not compiled build directory
    include: ["src/**/*.{test,spec}.{js,ts}"],
    exclude: [
      "build/**/*", // Explicitly exclude all build directory files
      "node_modules/**/*",
      "docs/**/*",
      "scripts/**/*",
    ],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text", "lcov", "html", "json"],
      include: ["src/**/*.ts"],
      exclude: [
        "build",
        "scripts",
        "docs",
        "**/*.d.ts",
        "**/node_modules/**",
        "**/vitest.config.ts",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/__tests__/**",
        "src/main.ts", // Entry point, not core logic
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    testTimeout: 10000, // 10 seconds for integration tests
    hookTimeout: 10000,
  },
});
