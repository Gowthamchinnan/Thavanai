import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config();

const e2eDatabaseUrl = process.env.E2E_DATABASE_URL;
if (!e2eDatabaseUrl) {
  throw new Error("E2E_DATABASE_URL is required to run Playwright tests.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next build && npx next start",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      DATABASE_URL: e2eDatabaseUrl,
      AUTH_SECRET: "e2e-only-secret-not-for-production-use",
      AUTH_TRUST_HOST: "true",
      NEXTAUTH_URL: "http://127.0.0.1:3100",
      NEXT_DIST_DIR: ".next-e2e",
      PORT: "3100",
    },
  },
});
