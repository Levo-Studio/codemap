// SPDX-License-Identifier: Apache-2.0

import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

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
