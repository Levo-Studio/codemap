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
  await running.visit(page);
  await expect(page.getByText("Billing", { exact: true })).toBeVisible();
  // What is there when the map opens does not enter.
  await expect(page.locator("[data-entering]")).toHaveCount(0);

  await write(
    "lib/mail/send.ts",
    `import { charge } from "../billing/charge";\nexport function send() { charge(); }\n`,
  );
  await expect(page.getByText("Mail", { exact: true })).toBeVisible({ timeout: 5000 });
  // Nothing moved, so the connections stay in sight while it arrives.
  // Cast: this file is checked without the DOM types.
  const edges = () =>
    page.locator("[data-map] canvas").evaluate(
      (canvas) =>
        (
          canvas as unknown as {
            parentElement: { parentElement: { style: { opacity: string } } };
          }
        ).parentElement.parentElement.style.opacity,
    );
  for (let i = 0; i < 5; i++) {
    expect(["", "1"]).toContain(await edges());
    await page.waitForTimeout(60);
  }
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
  await running.visit(page);
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
  // Counts every connection the page opens, refused ones included.
  await page.addInitScript(`
    window.__sockets = 0;
    const Original = window.WebSocket;
    window.WebSocket = class extends Original {
      constructor(...args) {
        super(...args);
        window.__sockets++;
      }
    };
  `);
  await running.visit(page);
  await expect(page.getByText("Billing", { exact: true })).toBeVisible();
  await running.stop();
  await expect(page.getByText(en.offline.title)).toBeVisible({ timeout: 5000 });
  await expect(page.locator("header").getByText(en.topbar.status.offline)).toBeVisible();
  await expect(page.getByText(en.chat.offline)).toBeVisible();

  // It tries again when the countdown ends, and at once on Retry.
  const counted = () => page.evaluate("window.__sockets") as Promise<number>;
  const first = await counted();
  await expect.poll(counted, { timeout: 7000 }).toBeGreaterThan(first);
  // One try per countdown, not more.
  await page.waitForTimeout(500);
  expect(await counted()).toBe(first + 1);
  const before = await counted();
  await page.getByRole("button", { name: en.offline.retry }).click();
  await expect.poll(counted, { timeout: 1000 }).toBeGreaterThan(before);
});

test("the code shown in the panel follows what the agent writes", async ({ page }) => {
  const open = ["lib/billing", "lib/billing/charge", "lib/billing/charge.ts"];
  await running.visit(page, `#${open.map((id) => `open=${encodeURIComponent(id)}`).join("&")}`);
  const panel = page.locator("aside");
  await page
    .locator("[data-map] [data-node]")
    .filter({ has: page.getByText("charge", { exact: true }) })
    .click();
  await panel.getByRole("button", { name: en.panel.showCode }).click();
  const code = panel.getByRole("region", { name: "lib/billing/charge.ts" });
  await expect(code).toContainText("export function charge() {}");
  await write("lib/billing/charge.ts", "export function charge() {\n  return 1;\n}\n");
  await expect(code).toContainText("return 1;", { timeout: 5000 });
});
