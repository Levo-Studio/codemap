// SPDX-License-Identifier: Apache-2.0

import { defineConfig, devices } from "@playwright/test";

// The references are the renders of design/ in docs/design-screenshots/, taken
// with animations disabled. A visual test compares against them by file name,
// so it has to render the same way. Nothing is ever written back: a missing or
// misspelt reference fails the test instead of turning the code's own render
// into a new reference.
export default defineConfig({
  testDir: "packages/web/e2e",
  snapshotPathTemplate: "docs/design-screenshots/{arg}{ext}",
  updateSnapshots: "none",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  expect: {
    toHaveScreenshot: { animations: "disabled" },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
});
