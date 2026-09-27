// SPDX-License-Identifier: Apache-2.0

import { defineConfig, devices } from "@playwright/test";

// The references are the renders of design/ in docs/design-screenshots/,
// made in the same Playwright container these tests run in (see
// scripts/in-container.sh). A visual test compares against them by file name
// and renders the same way: animations disabled, no subpixel text
// antialiasing. Nothing is ever written back: a missing or misspelt reference
// fails the test instead of turning the code's own render into a new
// reference. No pixel may differ.
const origin = "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "packages/web/e2e",
  snapshotPathTemplate: "docs/design-screenshots/{arg}{ext}",
  updateSnapshots: "none",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  expect: {
    toHaveScreenshot: { animations: "disabled", maxDiffPixels: 0 },
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
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
  ],
});
