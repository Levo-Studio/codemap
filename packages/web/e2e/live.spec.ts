// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { en } from "@codemap/core/strings";
import { expect, test } from "@playwright/test";
import { type Running, startCodemap } from "./codemap.js";

// The live map: a change in the project reaches the open map without a
// reload, and a lost server shows as lost.

let root: string;
let running: Running;

const write = async (path: string, content: string) => {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
};

test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "codemap-live-e2e-"));
  await write("lib/billing/charge.ts", "export function charge() {}\n");
  running = await startCodemap(root);
});

test.afterEach(async () => {
  await running.stop();
  await rm(root, { recursive: true, force: true });
});

test("a new area appears on the open map and in the changes", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(running.address);
  await expect(page.getByText("Billing", { exact: true })).toBeVisible();
  // What is there when the map opens does not enter.
  await expect(page.locator("[data-entering]")).toHaveCount(0);

  await write(
    "lib/mail/send.ts",
    `import { charge } from "../billing/charge";\nexport function send() { charge(); }\n`,
  );
  await expect(page.getByText("Mail", { exact: true })).toBeVisible({ timeout: 5000 });
  // The new node enters; the one that was there stays as it is.
  const node = (label: string) =>
    page.locator("[data-node]").filter({ has: page.getByText(label, { exact: true }) });
  await expect(node("Mail")).toHaveAttribute("data-entering", "true");
  await expect(node("Billing")).not.toHaveAttribute("data-entering");

  // The timeline, which only it says since when it counts, lists the area;
  // the project panel's session list does too.
  const since = page.getByText(/^Since \d\d:\d\d/);
  await page.getByRole("button", { name: new RegExp(`^${en.topbar.changes}`) }).click();
  await expect(since).toBeVisible();
  await expect(page.locator("aside").getByText(en.changes.item.area("Mail"))).toBeVisible();
  await page.getByRole("button", { name: en.changes.closeLabel }).click();
  await expect(since).toBeHidden();
  await expect(page.locator("aside").getByText(en.changes.item.area("Mail"))).toBeVisible();
  expect(errors).toEqual([]);
});

test("a change keeps the map where the user moved it", async ({ page }) => {
  await page.goto(running.address);
  await expect(page.getByText("Billing", { exact: true })).toBeVisible();
  const box = await page.locator("[data-map]").boundingBox();
  if (!box) throw new Error("no map");
  await page.mouse.move(box.x + box.width - 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 110, box.y + 60, { steps: 4 });
  await page.mouse.up();
  const transform = () =>
    page
      .locator("[data-map] [data-node]")
      .first()
      // Cast: this file is checked without the DOM types.
      .evaluate(
        (n) => (n.parentNode as unknown as { style: { transform: string } }).style.transform,
      );
  const moved = await transform();
  expect(moved).not.toBe("");
  await write("lib/mail/send.ts", "export function send() {}\n");
  await expect(page.getByText("Mail", { exact: true })).toBeVisible({ timeout: 5000 });
  expect(await transform()).toBe(moved);
});

test("the map says so when the server is gone", async ({ page }) => {
  await page.goto(running.address);
  await expect(page.getByText("Billing", { exact: true })).toBeVisible();
  await running.stop();
  await expect(page.getByText(en.offline.title)).toBeVisible({ timeout: 5000 });
  await expect(page.locator("header").getByText(en.topbar.status.offline)).toBeVisible();
  await expect(page.getByText(en.chat.offline)).toBeVisible();
});
