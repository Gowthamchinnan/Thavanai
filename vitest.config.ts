import path from "node:path";
import dotenv from "dotenv";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

dotenv.config();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    env: testDatabaseUrl ? { DATABASE_URL: testDatabaseUrl } : {},
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
