import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: "./test/browser",
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:4176",
    viewport: { width: 1512, height: 982 },
    headless: true,
    ignoreHTTPSErrors: true,
    launchOptions: {
      executablePath: process.env.CHROME_BIN || "/usr/bin/google-chrome",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `${process.execPath} test/browser-server.mjs`,
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    url: "http://127.0.0.1:4176/health",
    reuseExistingServer: false,
    timeout: 20000,
    env: {
      PORT: "4176",
      HOST: "127.0.0.1",
      STUDIO_ORIGIN: "http://127.0.0.1:4176",
      STUDIO_MASTER_KEY: "9".repeat(64),
      STUDIO_SETUP_TOKEN: "browser-test-setup-token-long-enough",
      NODE_ENV: "test",
    },
  },
});
