import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Core logic only: services, the PostgreSQL repository, and the row mapper
      // (ARCHITECTURE.md §13.4). Adapters and process wiring are excluded.
      include: [
        "src/services/**/*.ts",
        "src/db/postgres-task-repository.ts",
        "src/db/row-mapper.ts",
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
  },
});
