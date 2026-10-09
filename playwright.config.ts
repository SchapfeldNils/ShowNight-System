import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    screenshot: "only-on-failure",
    trace: "off",
  },
  webServer: {
    command: "node --import tsx tests/browser-server.ts",
    url: "http://localhost:3000/health/ready",
    reuseExistingServer: false,
    timeout: 90000,
  },
});
