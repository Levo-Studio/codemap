// SPDX-License-Identifier: Apache-2.0

import { defineConfig, devices } from "@playwright/test";

const origin = "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "packages/web/e2e",
  snapshotPathTemplate: "docs/design-screenshots/{arg}{ext}",
  updateSnapshots: "none",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  expect: {
    toHaveScreenshot: { animations: "disabled", maxDiffPixels: 0, threshold: 0 },
  },
  webServer: {
    command: "pnpm --filter @codemap/web exec vite --host 127.0.0.1 --port 5173 --strictPort",
    url: `${origin}/fixtures.html`,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: origin,
    launchOptions: { args: ["--disable-lcd-text"] },
  },
  projects: [
    {
      name: "chromium",
      testMatch: "design.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: "app",
      testMatch: ["app.spec.ts", "live.spec.ts", "empty.spec.ts", "chat.spec.ts"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
});
