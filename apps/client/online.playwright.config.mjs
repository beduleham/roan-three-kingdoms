import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "online.spec.mjs",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4174",
    launchOptions: process.env.DEMO_CHROMIUM_PATH
      ? { executablePath: process.env.DEMO_CHROMIUM_PATH }
      : {},
  },
  webServer: [
    {
      command:
        "npm run build:core && npm run build:protocol && npm run build --workspace @roan/server && node apps/server/dist/index.js",
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      url: "http://127.0.0.1:2567",
      reuseExistingServer: false,
    },
    {
      command:
        "npm run dev --workspace @roan/client -- --host 127.0.0.1 --port 4174",
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      url: "http://127.0.0.1:4174/online.html",
      reuseExistingServer: false,
    },
  ],
});
