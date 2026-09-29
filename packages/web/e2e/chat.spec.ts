// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { en } from "@codemap/core/strings";
import { expect, type Page, test } from "@playwright/test";
import { type Running, startCodemap } from "./codemap.js";

// Ask with its past chats: an answer moves into the panel as the user goes
// on to the map and back with the bar above it, a double click on the empty
// map closes it, and a closed chat opens again from the list of past ones,
// across starts. The provider is the tests' own (answering.mjs).

let root: string;
let running: Running;

const write = async (path: string, content: string) => {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
};

test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "codemap-chat-e2e-"));
  await write(
    "lib/billing/charge.ts",
    `import { save } from "../db/save";\nexport function charge() { save(); }\n`,
  );
  await write("lib/db/save.ts", "export function save() {}\n");
  running = await startCodemap(root, { answering: true });
});

test.afterEach(async () => {
  await running.stop();
  await rm(root, { recursive: true, force: true });
});

const field = (page: Page) => page.getByRole("textbox", { name: /Ask anything/ });
const answer = (page: Page) => page.getByRole("button", { name: en.chat.closeLabel });

async function askAQuestion(page: Page, question: string) {
  await page.goto(running.address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  await field(page).fill(question);
  await field(page).press("Enter");
  // The answer comes while the explanations are written beside it.
  await expect(answer(page)).toBeVisible({ timeout: 15000 });
}

test("an answer moves into the panel when the user goes on to the map, and back with its bar", async ({
  page,
}) => {
  await askAQuestion(page, "How is a charge saved?");
  await page.locator("[data-map] [data-node][role=button]").first().click();
  const back = page.getByRole("button", { name: en.chat.followUp });
  await expect(back).toBeVisible();
  await expect(page.locator("aside")).toContainText("How is a charge saved?");
  await expect(answer(page)).toBeHidden();
  await back.click();
  await expect(answer(page)).toBeVisible();
  // As the bar promised: the follow-up field is ready.
  await expect(page.getByRole("textbox", { name: en.chat.followUp })).toBeFocused();
  await expect(back).toBeHidden();
});

test("an answer comes with its map, which is not asked for again", async ({ page }) => {
  const again: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/map?") && request.url().includes("chat=")) {
      again.push(request.url());
    }
  });
  await askAQuestion(page, "How is a charge saved?");
  // Long enough for a request the answer set off to have gone out.
  await page.waitForTimeout(500);
  expect(again).toEqual([]);
});

test("a double click on the empty map closes the chat, which opens again from the past ones", async ({
  page,
}) => {
  await askAQuestion(page, "Where does billing save?");
  const map = await page.locator("[data-map]").boundingBox();
  if (!map) throw new Error("no map");
  await page.mouse.dblclick(map.x + map.width - 20, map.y + 20);
  await expect(answer(page)).toBeHidden();
  await field(page).focus();
  const past = page.getByRole("list", { name: en.chat.past });
  await expect(past).toContainText("Where does billing save?");
  // Opened again, its steps are numbered on the map as when it was asked.
  const shown = page.waitForResponse((r) => r.url().includes("chat=") && r.ok());
  await past.getByRole("button").first().click();
  await expect(answer(page)).toBeVisible();
  const screen = (await (await shown).json()) as { map: { nodes: { step?: number }[] } };
  expect(screen.map.nodes.filter((n) => n.step !== undefined).length).toBeGreaterThan(0);
});

test("asking from the bar shows the answer and, once it is closed, the panel again, not the past chats", async ({
  page,
}) => {
  await page.goto(running.address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  await field(page).focus();
  await expect(page.getByText(en.chat.past)).toBeVisible();
  await field(page).fill("How is a charge saved?");
  await field(page).press("Enter");
  await expect(answer(page)).toBeVisible();
  await expect(page.getByText(en.chat.past)).toBeHidden();
  await answer(page).click();
  await expect(page.locator("aside").getByText(en.panel.project, { exact: true })).toBeVisible();
});

test("a double click on the controls or the answer leaves the chat open", async ({ page }) => {
  await askAQuestion(page, "How is a charge saved?");
  await page.getByRole("button", { name: "Zoom in" }).dblclick();
  await expect(answer(page)).toBeVisible();
  await page.getByText(/^Line 1 of an answer/).dblclick();
  await expect(answer(page)).toBeVisible();
});

test("the past chats say there are none only once they have come, and do not show if they cannot", async ({
  page,
}) => {
  await page.goto(running.address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/api\/chats/, async (route) => {
    await held;
    await route.continue();
  });
  await field(page).focus();
  await expect(page.getByText(en.chat.past)).toBeVisible();
  await expect(page.getByText(en.chat.noPast)).toBeHidden();
  release();
  await expect(page.getByText(en.chat.noPast)).toBeVisible();

  await field(page).blur();
  await page.unroute(/\/api\/chats/);
  await page.route(/\/api\/chats/, (route) => route.fulfill({ status: 500 }));
  await field(page).focus();
  await expect(page.getByText(en.chat.past)).toBeHidden();
  await expect(page.locator("aside").getByText(en.panel.project, { exact: true })).toBeVisible();
});

test("the past chats are reached with the keys: down into them, Escape back, Enter opens one", async ({
  page,
}) => {
  await askAQuestion(page, "Where does billing save?");
  await answer(page).click();
  await field(page).focus();
  const past = page.getByRole("list", { name: en.chat.past });
  const row = past.getByRole("button").first();
  await expect(row).toBeVisible();
  await field(page).press("ArrowDown");
  await expect(row).toBeFocused();
  await expect(past).toBeVisible();
  // Back in the field, the list stays as it was: it is not read again.
  await page.route(/\/api\/chats/, () => {});
  await row.press("Escape");
  await expect(field(page)).toBeFocused();
  await expect(row).toBeVisible({ timeout: 1000 });
  await field(page).press("ArrowDown");
  await row.press("Enter");
  await expect(answer(page)).toBeVisible();
});

test("the past chats are kept across starts", async ({ page }) => {
  await askAQuestion(page, "What does save do?");
  await running.stop();
  running = await startCodemap(root, { answering: true });
  await page.goto(running.address);
  await field(page).focus();
  await expect(page.getByRole("list", { name: en.chat.past })).toContainText("What does save do?");
});

test("a long answer scrolls, over the map and in the panel", async ({ page }) => {
  await askAQuestion(page, "Tell me everything.");
  // Cast: this file is checked without the DOM types.
  const scrolls = (selector: string) =>
    page.evaluate(`(() => {
      const box = [...document.querySelectorAll(${JSON.stringify(selector)})].find(
        (e) => e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY === "auto",
      );
      if (!box) return false;
      box.scrollTop = 40;
      return box.scrollTop > 0;
    })()`);
  await expect.poll(() => scrolls("[data-map] div")).toBe(true);
  await page.locator("[data-map] [data-node][role=button]").first().click();
  await expect(page.getByRole("button", { name: en.chat.followUp })).toBeVisible();
  await expect.poll(() => scrolls("aside div")).toBe(true);
});

test("the panel is dragged wider, up to a third of the window, and no narrower than drawn", async ({
  page,
}) => {
  await page.goto(running.address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  const aside = page.locator("aside");
  const splitter = page.getByRole("separator", { name: en.chat.resizePanel });
  const width = async () => (await aside.boundingBox())?.width ?? 0;
  const drawn = await width();
  const box = await splitter.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error("no splitter");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(100, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(Math.round(await width())).toBe(Math.round(viewport.width / 3));
  const wide = await splitter.boundingBox();
  if (!wide) throw new Error("no splitter");
  await page.mouse.move(wide.x + wide.width / 2, wide.y + wide.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewport.width - 10, wide.y + wide.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(await width()).toBe(drawn);
});
