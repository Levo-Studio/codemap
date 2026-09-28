// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { type Running, startCodemap } from "./codemap.js";

// The app as a user gets it: the built CLI reads this repository, starts the
// server and prints the address; the browser opens it. Nothing the page loads
// may be refused or missing, and the map can be walked down and back up.

const repo = fileURLToPath(new URL("../../..", import.meta.url));

let running: Running;
let address: string;

test.beforeAll(async () => {
  running = await startCodemap(repo);
  address = running.address;
});

test.afterAll(async () => {
  await running.stop();
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

  await area.dblclick();
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
  await page.locator("[data-node][role=button]").first().dblclick();
  await expect(page).toHaveURL(/#area:/);
  // The crumb back to the system is a button once the area's map is shown.
  await expect(page.getByRole("button", { name: "System" })).toBeVisible();
  const opened = await nodesTransform(page);
  // The same place, loaded fresh, shows the fitted camera.
  await page.reload();
  await expect(page.locator("[data-node]").first()).toBeVisible();
  expect(opened).toBe(await nodesTransform(page));
});

test("a click selects a node for the panel, and a click on the empty map clears it", async ({
  page,
}) => {
  await page.goto(address);
  const area = page.locator("[data-node][role=button]").first();
  await expect(area).toBeVisible();
  const aside = page.locator("aside");
  await expect(aside.getByText("Project", { exact: true })).toBeVisible();
  const label = (await area.locator("span").first().textContent()) ?? "";
  await area.click();
  await expect(aside.getByText(label, { exact: true })).toBeVisible();
  await expect(aside.getByText("Project", { exact: true })).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  const box = await page.locator("[data-map]").boundingBox();
  if (!box) throw new Error("no map");
  await page.mouse.click(box.x + box.width - 10, box.y + 10);
  await expect(aside.getByText("Project", { exact: true })).toBeVisible();
});

test("the zoom buttons over the map zoom it", async ({ page }) => {
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  const before = await nodesTransform(page);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(() => nodesTransform(page)).not.toBe(before);
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

test("only the primary button drags the map, and a cancelled drag ends", async ({ page }) => {
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  const box = await page.locator("[data-map]").boundingBox();
  if (!box) throw new Error("no map");
  const before = await nodesTransform(page);
  await page.mouse.move(box.x + box.width - 10, box.y + 10);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(box.x + box.width - 110, box.y + 60, { steps: 4 });
  await page.mouse.up({ button: "right" });
  expect(await nodesTransform(page)).toBe(before);
  // A drag the browser cancels, as it does when a touch turns into a gesture,
  // leaves no drag behind for the next hover.
  await page.mouse.move(box.x + box.width - 10, box.y + 10);
  await page.mouse.down();
  await page.locator("[data-map]").dispatchEvent("pointercancel");
  await page.mouse.move(box.x + box.width - 110, box.y + 60, { steps: 4 });
  expect(await nodesTransform(page)).toBe(before);
  await page.mouse.up();
});

test("an address naming no place shows the system map", async ({ page }) => {
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  for (const hash of ["#area:%E0", "#area:no-such-area"]) {
    await page.evaluate(`location.hash = ${JSON.stringify(hash)}`);
    await page.reload();
    await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  }
});
