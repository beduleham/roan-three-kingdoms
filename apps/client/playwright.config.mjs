import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "demo.spec.mjs",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 1080 },
    launchOptions: process.env.DEMO_CHROMIUM_PATH
      ? { executablePath: process.env.DEMO_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command:
      "npm run dev --workspace @roan/client -- --host 127.0.0.1 --port 4173",
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
});
