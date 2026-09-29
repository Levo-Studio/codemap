// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { type Running, startCodemap } from "./codemap.js";

// The app as a user gets it: the built CLI reads this repository, starts the
// server and prints the address; the browser opens it. Nothing the page loads
// may be refused or missing, and a node opens in place and closes again.

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

// The first area on the map, as a card, and the box it becomes when opened.
const firstArea = async (page: Page) => {
  const card = page.locator("[data-node][role=button]").first();
  await expect(card).toBeVisible();
  const label = (await card.locator("span").first().textContent()) ?? "";
  const box = page.locator("[data-opened]").filter({ has: page.getByText(label, { exact: true }) });
  return { card, label, box };
};

test("the map loads without errors, opens a node in place and closes it again", async ({
  page,
}) => {
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
  const { card, label, box } = await firstArea(page);
  // Waits for the fonts, so a refused one is reported before the end. A string,
  // because this file is checked without the DOM types.
  await page.evaluate("document.fonts.ready.then(() => true)");
  const others = await page.locator("[data-node][role=button]").count();

  // Opened, the area is a box on the same map, the rest of the map around it.
  await card.dblclick();
  await expect(box).toBeVisible();
  await expect(page).toHaveURL(/#open=/);
  expect(await page.locator("[data-node][role=button]").count()).toBeGreaterThan(others);
  // The box is selected, so the panel is the area's.
  await expect(page.locator("aside").getByText(label, { exact: true })).toBeVisible();
  // A double click on its title closes it again.
  await box.locator("[data-node]").dblclick();
  await expect(box).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("[data-node][role=button]")).toHaveCount(others);

  expect(errors).toEqual([]);
});

// The transform the camera puts on the map's nodes; "none" at 1:1 and unmoved.
// The last node is a card in the camera's layer, never an opened box's title.
const nodesTransform = (page: Page) =>
  page
    .locator("[data-map] [data-node]")
    .last()
    .evaluate(
      // Cast: this file is checked without the DOM types.
      (node) => {
        const { style } = node.parentNode as unknown as {
          style: { transform: string; zoom: string };
        };
        return `${style.transform || "none"}${style.zoom ? ` zoom(${style.zoom})` : ""}`;
      },
    );

// Opens or closes a node from the keyboard, wherever on the map it is.
const toggleByKeyboard = async (page: Page, id: string | null) => {
  await page.locator(`[data-node="${id}"]`).first().focus();
  await page.keyboard.press("Enter");
};

test("opening a node closes what else was open, but not what holds it", async ({ page }) => {
  await page.goto(address);
  const cards = page.locator("[data-map] [data-node][aria-expanded=false]");
  await expect(cards.first()).toBeVisible();
  const first = await cards.first().getAttribute("data-node");
  const second = await cards.nth(1).getAttribute("data-node");
  const box = (id: string | null) => page.locator(`[data-opened="${id}"]`);
  await toggleByKeyboard(page, first);
  await expect(box(first)).toBeVisible();
  // A module inside it opens, and the area stays open around it.
  const module = page.locator(`[data-node^="${first}/"][aria-expanded=false]`).first();
  const moduleId = await module.getAttribute("data-node");
  await toggleByKeyboard(page, moduleId);
  await expect(box(moduleId)).toBeVisible();
  await expect(box(first)).toBeVisible();
  // Another area opens, and both close.
  await toggleByKeyboard(page, second);
  await expect(box(second)).toBeVisible();
  await expect(box(first)).toBeHidden();
  await expect(box(moduleId)).toBeHidden();
});

test("an opened node's title fits in its box, whichever node is opened", async ({ page }) => {
  await page.goto(address);
  await expect(page.locator("[data-node][aria-expanded=false]").first()).toBeVisible();
  const ids = await page.$$eval("[data-node][aria-expanded=false]", (nodes) =>
    nodes.map((n) => (n as unknown as { dataset: { node: string } }).dataset.node),
  );
  for (const id of ids) {
    await toggleByKeyboard(page, id);
    const title = page.locator(`[data-opened="${id}"] [data-node]`);
    await expect(title).toBeVisible();
    // The name and the count each fit: the count would be cut with an
    // ellipsis, which the row as a whole does not show. Cast: this file is
    // checked without the DOM types.
    const cut = await title.evaluate((row) =>
      [...(row as unknown as { children: Iterable<unknown> }).children].map((span) => {
        const { scrollWidth, clientWidth } = span as { scrollWidth: number; clientWidth: number };
        return scrollWidth - clientWidth;
      }),
    );
    expect(Math.max(...cut), id).toBeLessThanOrEqual(0);
  }
});

test("a function on the map shows its name and line, and its explanation only in the panel", async ({
  page,
}) => {
  const open = ["packages/cli", "packages/cli/run", "packages/cli/src/run.ts"];
  await page.goto(`${address}#${open.map((id) => `open=${encodeURIComponent(id)}`).join("&")}`);
  const card = page.locator('[data-node="packages/cli/src/run.ts#findWebRoot"]');
  await expect(card).toBeVisible();
  // One line: the name and the line it starts on, nothing more.
  expect((await card.locator("span").allTextContents()).length).toBe(2);
  // Cast: this file is checked without the DOM types.
  const fits = await card.evaluate((node) => {
    const n = node as unknown as { scrollHeight: number; clientHeight: number };
    return n.scrollHeight <= n.clientHeight;
  });
  expect(fits).toBe(true);
});

test("focusing a node outside the view does not slide the map under its controls", async ({
  page,
}) => {
  // run.ts opened on the map as first shown reaches past the right of the view.
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  const open = ["packages/cli", "packages/cli/run", "packages/cli/src/run.ts"];
  await page.evaluate(
    `location.hash = ${JSON.stringify(open.map((id) => `open=${encodeURIComponent(id)}`).join("&"))}`,
  );
  const far = page.locator('[data-node="packages/cli/src/run.ts#findWebRoot"]');
  await expect(far).toBeVisible();
  await far.focus();
  // Cast: this file is checked without the DOM types.
  const scrolled = await page.locator("[data-map]").evaluate((map) => {
    const m = map as unknown as { scrollLeft: number; scrollTop: number };
    return m.scrollLeft + m.scrollTop;
  });
  expect(scrolled).toBe(0);
});

test("from the keyboard, Enter opens a node and closes it, the focus going along", async ({
  page,
}) => {
  await page.goto(address);
  const { card, box } = await firstArea(page);
  await expect(card).toHaveAttribute("aria-expanded", "false");
  await card.focus();
  await page.keyboard.press("Enter");
  const title = box.locator("[data-node]");
  await expect(title).toBeFocused();
  await expect(title).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Enter");
  await expect(box).toBeHidden();
  await expect(page.locator("[data-node][role=button]").first()).toBeFocused();
});

test("what is open stays open when the page is loaded again", async ({ page }) => {
  await page.goto(address);
  const { card, box } = await firstArea(page);
  await card.dblclick();
  await expect(box).toBeVisible();
  await page.reload();
  await expect(box).toBeVisible();
  // Something inside it, selected, has the area in its crumbs; the crumb of
  // the system selects nothing again.
  const aside = page.locator("aside");
  await page.locator("[data-map] [data-node][role=button]").last().click();
  await expect(aside.getByText("Project", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "System" }).click();
  await expect(aside.getByText("Project", { exact: true })).toBeVisible();
  await expect(box).toBeVisible();
});

test("the connections are drawn under the server's content security policy", async ({ page }) => {
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  await expect(page.locator("[data-map] canvas")).toHaveCount(1);
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

test("the panel switches between Simple and Technical", async ({ page }) => {
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  const technical = page.waitForRequest((r) => r.url().includes("explain=technical"));
  await page.locator("aside").getByRole("button", { name: "Technical" }).click();
  await technical;
  const simple = page.waitForRequest(
    (r) => r.url().includes("/api/map") && !r.url().includes("explain="),
  );
  await page.locator("aside").getByRole("button", { name: "Simple" }).click();
  await simple;
});

test("a question without a provider says how to set one up, and closes", async ({ page }) => {
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  const field = page.getByRole("textbox", { name: /Ask anything/ });
  await field.fill("How does the map get drawn?");
  await field.press("Enter");
  await expect(page.getByText("How does the map get drawn?")).toBeVisible();
  await expect(page.getByText(/Ask needs a provider of your own/)).toBeVisible();
  await page.getByRole("button", { name: "Close the answer" }).click();
  await expect(page.getByText("How does the map get drawn?")).toBeHidden();
  await expect(page.getByRole("textbox", { name: /Ask anything/ })).toBeVisible();
});

test("Enter that confirms a composed word does not send the question", async ({ page }) => {
  await page.goto(address);
  const field = page.getByRole("textbox", { name: /Ask anything/ });
  await field.click();
  let sent = false;
  page.on("request", (r) => {
    if (r.url().includes("/api/ask")) sent = true;
  });
  // An input method composing a word, as Japanese or Chinese input does.
  const session = await page.context().newCDPSession(page);
  await session.send("Input.imeSetComposition", { text: "か", selectionStart: 1, selectionEnd: 1 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  expect(sent).toBe(false);
});

test("an answer that arrives after it was closed stays closed", async ({ page }) => {
  // The server's own answer, held back until the test lets it through.
  let release: () => void = () => {};
  const arrived = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = false;
  await page.route("**/api/ask**", async (route) => {
    const response = await route.fetch();
    held = true;
    await arrived;
    await route.fulfill({ response });
  });
  await page.goto(address);
  const field = page.getByRole("textbox", { name: /Ask anything/ });
  await field.fill("First question");
  await field.press("Enter");
  await expect(page.getByText("First question")).toBeVisible();
  // On its way, the answer is the drawn thinking row: three dots and the words.
  const thinking = page.getByText("Reading the code…");
  await expect(thinking).toBeVisible();
  expect(await thinking.locator("span").count()).toBe(3);
  await page.getByRole("button", { name: "Close the answer" }).click();
  await expect.poll(() => held).toBe(true);
  release();
  await page.waitForResponse("**/api/ask**");
  await page.waitForTimeout(300);
  await expect(page.getByText("First question")).toBeHidden();
  await expect(page.getByText(/Ask needs a provider of your own/)).toBeHidden();
});

test("the search finds a function and opens it on the map, selected", async ({ page }) => {
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  await page.getByRole("button", { name: "Search functions, modules and files" }).click();
  const field = page.getByRole("textbox", { name: "Search functions, modules and files" });
  await expect(field).toBeFocused();
  await field.fill("findWebRoot");
  await expect(page.getByText("run.ts", { exact: false }).first()).toBeVisible();
  await field.press("Enter");
  // Everything it is in opens, down to its file, and it is drawn selected.
  await expect(page).toHaveURL(/open=packages%2Fcli%2Fsrc%2Frun\.ts/);
  await expect(field).toBeHidden();
  await expect(page.locator("aside").getByText("findWebRoot", { exact: true })).toBeVisible();
  await expect(
    page
      .locator("[data-map] [data-node]")
      .filter({ has: page.getByText("findWebRoot", { exact: true }) }),
  ).toBeVisible();

  // ⌘K (Ctrl+K elsewhere) opens it again, Escape closes it.
  await page.keyboard.press("ControlOrMeta+k");
  await expect(field).toBeFocused();
  await field.press("Escape");
  await expect(field).toBeHidden();
});

test("the panel shows the code of the selected function on request", async ({ page }) => {
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  await page.getByRole("button", { name: "Search functions, modules and files" }).click();
  const field = page.getByRole("textbox", { name: "Search functions, modules and files" });
  await field.fill("findWebRoot");
  await expect(page.getByText("run.ts", { exact: false }).first()).toBeVisible();
  await field.press("Enter");
  const panel = page.locator("aside");
  const toggle = panel.getByRole("button", { name: "Show code" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(panel.getByRole("button", { name: "Hide code" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  const code = panel.getByRole("region", { name: "packages/cli/src/run.ts" });
  await expect(code).toContainText("function findWebRoot");
  await panel.getByRole("button", { name: "Hide code" }).click();
  await expect(code).toBeHidden();
});

test("the palette fades in and out", async ({ page }) => {
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  // The palette's opacity over the next 300 ms, frame by frame. A string:
  // this file is checked without the DOM types.
  const sample = `new Promise((resolve) => {
    const seen = [];
    const start = performance.now();
    const frame = () => {
      const palette = document.querySelector("[data-palette]");
      seen.push(palette ? Number(getComputedStyle(palette).opacity) : -1);
      if (performance.now() - start < 300) requestAnimationFrame(frame);
      else resolve(seen);
    };
    frame();
  })`;
  await page.keyboard.press("ControlOrMeta+k");
  const opening = (await page.evaluate(sample)) as number[];
  expect(opening.some((o) => o > 0 && o < 1)).toBe(true);
  expect(opening.at(-1)).toBe(1);
  await page.keyboard.press("Escape");
  const closing = (await page.evaluate(sample)) as number[];
  expect(closing.some((o) => o > 0 && o < 1)).toBe(true);
  expect(closing.at(-1)).toBe(-1);
});

test("the code shown is the selected function's, even before its panel has arrived", async ({
  page,
}) => {
  const open = ["packages/cli", "packages/cli/run", "packages/cli/src/run.ts"];
  await page.goto(`${address}#${open.map((id) => `open=${encodeURIComponent(id)}`).join("&")}`);
  // The file selected: its panel, with its Show code button.
  await page.locator('[data-opened="packages/cli/src/run.ts"] [data-node]').click();
  const panel = page.locator("aside");
  const show = panel.getByRole("button", { name: "Show code" });
  await expect(show).toBeVisible();
  // A function selected, and Show code pressed while the file's panel is
  // still there.
  await page.route("**/api/map?*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.locator('[data-node="packages/cli/src/run.ts#findWebRoot"]').click();
  await show.click();
  await expect(panel.getByRole("region")).toContainText("function findWebRoot");
});

test("Enter right after typing opens what the search finds, once it has found it", async ({
  page,
}) => {
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  const field = page.getByRole("textbox", { name: "Search functions, modules and files" });
  await field.pressSequentially("findWebRoot");
  await field.press("Enter");
  await expect(page).toHaveURL(/open=packages%2Fcli%2Fsrc%2Frun\.ts/);
  // Closed, the palette gives the focus back to the search field it came from.
  await expect(
    page.getByRole("button", { name: "Search functions, modules and files" }),
  ).toBeFocused();
});

test("Enter pressed before the results waits for them only while the query stays", async ({
  page,
}) => {
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  await page.route("**/api/search?*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await page.getByRole("button", { name: "Search functions, modules and files" }).click();
  const field = page.getByRole("textbox", { name: "Search functions, modules and files" });
  await field.fill("findWeb");
  await field.press("Enter");
  await field.pressSequentially("Root");
  await expect(page.getByText("run.ts", { exact: false }).first()).toBeVisible();
  await page.waitForTimeout(600);
  await expect(field).toBeVisible();
  await expect(page).not.toHaveURL(/#open=/);
});

test("a search that fails shows no results from before", async ({ page }) => {
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  await page.getByRole("button", { name: "Search functions, modules and files" }).click();
  const field = page.getByRole("textbox", { name: "Search functions, modules and files" });
  await field.fill("findWebRoot");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("run.ts", { exact: false }).first()).toBeVisible();
  await page.route("**/api/search?*", (route) => route.abort());
  await field.fill("findWebRootX");
  await expect(dialog.getByText("run.ts", { exact: false })).toHaveCount(0);
});

test("the palette's Ask row asks what it says", async ({ page }) => {
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  const field = page.getByRole("textbox", { name: "Search functions, modules and files" });
  await field.fill("the map");
  await page.getByText("Explain how the map works").click();
  // Once the palette has faded out, the question is the one asked.
  await expect(page.locator("[data-palette]")).toHaveCount(0);
  await expect(page.getByText("Explain how the map works")).toBeVisible();
  await expect(page.getByText(/Ask needs a provider of your own/)).toBeVisible();
});

test("zooming lays the map out again at its size, so its text stays sharp", async ({ page }) => {
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  await page.getByRole("button", { name: "Zoom in" }).click();
  // CSS zoom, not a scaled picture: no scale() in the transform.
  await expect.poll(() => nodesTransform(page)).toMatch(/zoom\(/);
  expect(await nodesTransform(page)).not.toMatch(/scale/);
});

test("what an opened node holds enters to the end, however much the map moves meanwhile", async ({
  page,
}) => {
  await page.goto(address);
  const { card, box } = await firstArea(page);
  const map = await page.locator("[data-map]").boundingBox();
  if (!map) throw new Error("no map");
  await card.dblclick();
  await expect(box).toBeVisible();
  // Dragging the map renders it again on every step while the nodes enter.
  await page.mouse.move(map.x + map.width - 10, map.y + 10);
  await page.mouse.down();
  await page.mouse.move(map.x + map.width - 110, map.y + 60, { steps: 20 });
  await page.mouse.up();
  // Every node ends fully there, or dimmed by the selection: none halfway.
  // Cast: this file is checked without the DOM types.
  const opacities = () =>
    page.$$eval("[data-map] [data-node][role=button]", (nodes) =>
      nodes.map(
        (node) =>
          (
            globalThis as unknown as { getComputedStyle(n: unknown): { opacity: string } }
          ).getComputedStyle(node).opacity,
      ),
    );
  await expect
    .poll(async () => (await opacities()).every((o) => o === "1" || o === "0.32"))
    .toBe(true);
});

// Zoomed in far enough that an opened area no longer fits where the map is
// shown; the first area is then opened from the keyboard, wherever it is.
const openZoomedIn = async (page: Page) => {
  const { card, box } = await firstArea(page);
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Zoom in" }).click();
  await card.focus();
  await page.keyboard.press("Enter");
  return box;
};

test("an opened node that fits where the map is shown leaves the camera where it is", async ({
  page,
}) => {
  await page.goto(address);
  const { card, box } = await firstArea(page);
  // Zoomed out far enough for the opened area to fit.
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zoom out" }).click();
  const before = await nodesTransform(page);
  await card.dblclick();
  await expect(box).toBeVisible();
  await page.waitForTimeout(600);
  expect(await nodesTransform(page)).toBe(before);
});

test("an opened node that does not fit is flown to, and the camera comes to rest", async ({
  page,
}) => {
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  const zoomed = await nodesTransform(page);
  const box = await openZoomedIn(page);
  await expect(box).toBeVisible();
  await expect.poll(() => nodesTransform(page)).not.toBe(zoomed);
  let last = "";
  await expect
    .poll(async () => {
      const now = await nodesTransform(page);
      const resting = now === last;
      last = now;
      return resting;
    })
    .toBe(true);
});

test("moving the map during the camera's flight ends the flight", async ({ page }) => {
  await page.goto(address);
  const map = await page.locator("[data-map]").boundingBox();
  if (!map) throw new Error("no map");
  const box = await openZoomedIn(page);
  await expect(box).toBeVisible();
  await page.mouse.move(map.x + map.width - 10, map.y + 10);
  await page.mouse.wheel(0, 200);
  const moved = await nodesTransform(page);
  await page.waitForTimeout(600);
  expect(await nodesTransform(page)).toBe(moved);
});

test("under reduced motion the camera is where it goes at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(address);
  const { card, box } = await firstArea(page);
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Zoom in" }).click();
  const zoomed = await nodesTransform(page);
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(box).toBeVisible();
  // The camera has moved to the opened node, and does not move on.
  await expect.poll(() => nodesTransform(page)).not.toBe(zoomed);
  const framed = await nodesTransform(page);
  await page.waitForTimeout(600);
  expect(await nodesTransform(page)).toBe(framed);
});

test("zoomed out, the map is a scaled picture, so no text keeps a size its box has not", async ({
  page,
}) => {
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect.poll(() => nodesTransform(page)).toMatch(/scale\(/);
  expect(await nodesTransform(page)).not.toMatch(/zoom\(/);
  // Back in past 1:1, it is laid out again at its size.
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(() => nodesTransform(page)).toMatch(/zoom\(/);
});

test("dragging the panel wider leaves the camera where the user moved it", async ({ page }) => {
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Zoom in" }).click();
  const zoomed = await nodesTransform(page);
  await page.getByRole("separator").focus();
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(300);
  expect(await nodesTransform(page)).toBe(zoomed);
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
  expect(await nodesTransform(page)).toMatch(/zoom/);
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

test("a map that cannot be built with its nodes open is shown with none open", async ({ page }) => {
  await page.route("**/api/map?*open=*", (route) => route.fulfill({ status: 500, body: "{}" }));
  await page.goto(`${address}#open=packages%2Fcli`);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("an address opening nothing there is shows the map with nothing open", async ({ page }) => {
  await page.goto(address);
  await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
  for (const hash of ["#open=%E0", "#open=no-such-area", "#area:packages%2Fcli"]) {
    await page.evaluate(`location.hash = ${JSON.stringify(hash)}`);
    await page.reload();
    await expect(page.locator("[data-node][role=button]").first()).toBeVisible();
    await expect(page.locator("[data-opened]")).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
  }
});

test("while an opened node's map is on its way, a bar across the top shows it is coming", async ({
  page,
}) => {
  await page.goto(address);
  const { card, box } = await firstArea(page);
  const bar = page.getByRole("progressbar");
  await expect(bar).toBeHidden();

  // The map for the opened node is held back until the bar has been seen.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/api\/map\?/, async (route) => {
    await held;
    await route.continue();
  });
  await card.dblclick();
  await expect(bar).toBeVisible();
  // Rounded as the indexing bar: the track, which clips what runs in it.
  // A string, because this file is checked without the DOM types.
  const [radius, overflow] = await page.evaluate<[string, string]>(`(() => {
    const track = document.querySelector("[role=progressbar]");
    const style = getComputedStyle(track);
    return [style.borderRadius, style.overflow];
  })()`);
  expect(radius).not.toBe("0px");
  expect(overflow).toBe("hidden");
  release();
  await expect(box).toBeVisible();
  await expect(bar).toBeHidden();
});

test("a panel taller than the window scrolls", async ({ page }) => {
  // Short enough that a selected area's panel does not fit.
  await page.setViewportSize({ width: 1440, height: 420 });
  await page.goto(address);
  const { card } = await firstArea(page);
  await card.click();
  const aside = page.locator("aside");
  await expect
    .poll(() => aside.evaluate((a) => a.scrollHeight - a.clientHeight))
    .toBeGreaterThan(0);
  await aside.hover();
  await page.mouse.wheel(0, 400);
  await expect.poll(() => aside.evaluate((a) => a.scrollTop)).toBeGreaterThan(0);
});
