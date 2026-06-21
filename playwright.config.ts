import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const e2eDataDir = path.join(process.cwd(), ".data", "e2e");

rmSync(e2eDataDir, { force: true, recursive: true });
mkdirSync(e2eDataDir, { recursive: true });

process.env.BATONFLOW_AUTH_STORE = "file";
process.env.BATONFLOW_AUTH_STORE_PATH = path.join(e2eDataDir, "auth.json");
process.env.BATONFLOW_PROJECT_STORE_PATH = path.join(e2eDataDir, "projects.json");
process.env.BATONFLOW_BACKEND_URL = "http://127.0.0.1:3100";
process.env.GITHUB_CLIENT_ID = "playwright-client-id";
process.env.GITHUB_CLIENT_SECRET = "playwright-client-secret";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
