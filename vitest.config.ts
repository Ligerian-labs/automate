import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "apps/api/src/**/*.ts",
        "apps/worker/src/**/*.ts",
        "packages/core/src/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/index.ts",
        "**/db/migrate.ts",
        "**/db/seed.ts",
      ],
    },
  },
});
