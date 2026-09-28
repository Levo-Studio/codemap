// SPDX-License-Identifier: Apache-2.0

import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

// The app as a user gets it: the built CLI reads this repository, starts the
// server and prints the address; the browser opens it. Nothing the page loads
// may be refused or missing, and the map can be walked down and back up.
// Needs the packages built (pnpm build).

const repo = fileURLToPath(new URL("../../..", import.meta.url));
const bin = fileURLToPath(new URL("../../cli/dist/bin.js", import.meta.url));

let cli: ChildProcess;
let address: string;

test.beforeAll(async () => {
  cli = spawn(process.execPath, [bin, "--no-open", repo], {
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  address = await new Promise<string>((resolve, reject) => {
    let output = "";
    cli.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      const found = output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/);
      if (found) resolve(found[0]);
    });
    cli.on("exit", (code) => reject(new Error(`codemap exited with ${code}:\n${output}`)));
  });
});

test.afterAll(() => {
  cli.kill("SIGTERM");
});

test("the map loads without errors and can be walked down and back up", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) => errors.push(`${request.url()} failed`));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.url()} ${response.status()}`);
  });

  await page.goto(address);
  // The token goes into a cookie and leaves the address.
  await expect(page).toHaveURL(/\/$/);
  const area = page.locator("[data-node][role=button]").first();
  await expect(area).toBeVisible();
  // Waits for the fonts, so a refused one is reported before the end. A string,
  // because this file is checked without the DOM types.
  await page.evaluate("document.fonts.ready.then(() => true)");

  await area.click();
  await expect(page).toHaveURL(/#area:/);
  await page.getByRole("button", { name: "System" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();

  expect(errors).toEqual([]);
});

// The transform the camera puts on the map's nodes; "none" at 1:1 and unmoved.
const nodesTransform = (page: Page) =>
  page
    .locator("[data-map] [data-node]")
    .first()
    .evaluate(
      // Cast: this file is checked without the DOM types.
      (node) =>
        (node.parentNode as unknown as { style: { transform: string } }).style.transform || "none",
    );

test("a map that opens starts fitted, whatever the last one was moved to", async ({ page }) => {
  await page.goto(address);
  const map = page.locator("[data-map]");
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  const box = await map.boundingBox();
  if (!box) throw new Error("no map");
  // Drag the background of the system map far to one side.
  await page.mouse.move(box.x + box.width - 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 210, box.y + 110, { steps: 4 });
  await page.mouse.up();
  await page.locator("[data-node][role=button]").first().click();
  await expect(page).toHaveURL(/#area:/);
  // The crumb back to the system is a button once the area's map is shown.
  await expect(page.getByRole("button", { name: "System" })).toBeVisible();
  const opened = await nodesTransform(page);
  // The same place, loaded fresh, shows the fitted camera.
  await page.reload();
  await expect(page.locator("[data-node]").first()).toBeVisible();
  expect(opened).toBe(await nodesTransform(page));
});

test("a pinch or Ctrl+wheel zooms the map, not the page", async ({ page }) => {
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  // dispatchEvent answers false when a listener prevented the default, the
  // browser's own zoom. A string: this file is checked without the DOM types.
  const pageZooms = await page.evaluate(`
    document.querySelector("[data-map]").dispatchEvent(
      new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true }),
    )
  `);
  expect(pageZooms).toBe(false);
  expect(await nodesTransform(page)).toMatch(/scale/);
});
