import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "maps.spec.mjs",
  timeout: 40000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4187",
    launchOptions: process.env.DEMO_CHROMIUM_PATH
      ? { executablePath: process.env.DEMO_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: "node apps/server/dist/index.js",
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env: {
      PORT: "4187",
      CLIENT_DIST_PATH: "apps/client/dist",
      ACCOUNT_DB_PATH: ":memory:",
      CLIENT_ORIGINS: "http://127.0.0.1:4187",
    },
    url: "http://127.0.0.1:4187/healthz",
    reuseExistingServer: false,
  },
});
