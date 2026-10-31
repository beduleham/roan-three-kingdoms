import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "objectives.spec.mjs",
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4186",
    launchOptions: process.env.DEMO_CHROMIUM_PATH
      ? { executablePath: process.env.DEMO_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: "node apps/server/test-support/objective-server.mjs",
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env: {
      PORT: "4186",
      CLIENT_DIST_PATH: "apps/client/dist",
      ACCOUNT_DB_PATH: ":memory:",
      CLIENT_ORIGINS: "http://127.0.0.1:4186",
    },
    url: "http://127.0.0.1:4186/healthz",
    reuseExistingServer: false,
  },
});
