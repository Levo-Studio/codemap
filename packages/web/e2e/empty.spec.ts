// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { en } from "@codemap/core/strings";
import { expect, test } from "@playwright/test";
import { startCodemap } from "./codemap.js";

// A folder without code shows the empty screen (S10), and becomes the map as
// soon as code arrives.

test("a folder without code says so, and shows the map once code arrives", async ({ page }) => {
  const root = await mkdtemp(join(tmpdir(), "codemap-empty-e2e-"));
  await writeFile(join(root, "notes.md"), "# Notes\n");
  const running = await startCodemap(root);
  try {
    await page.goto(running.address);
    await expect(page.getByText(en.empty.title)).toBeVisible();
    await expect(page.locator("header").getByText(en.topbar.crumbs.noProject)).toBeVisible();

    await mkdir(join(root, "lib/billing"), { recursive: true });
    await writeFile(join(root, "lib/billing/charge.ts"), "export function charge() {}\n");
    await expect(page.getByText("Billing", { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(en.empty.title)).toBeHidden();
  } finally {
    await running.stop();
    await rm(root, { recursive: true, force: true });
  }
});
