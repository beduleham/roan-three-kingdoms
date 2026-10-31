import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "network.spec.mjs",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4185",
    launchOptions: process.env.DEMO_CHROMIUM_PATH
      ? { executablePath: process.env.DEMO_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: "node apps/server/dist/index.js",
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env: {
      PORT: "4185",
      CLIENT_DIST_PATH: "apps/client/dist",
      ACCOUNT_DB_PATH: ":memory:",
      CLIENT_ORIGINS: "http://127.0.0.1:4185",
    },
    url: "http://127.0.0.1:4185/healthz",
    reuseExistingServer: false,
  },
});
