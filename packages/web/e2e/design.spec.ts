// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "@playwright/test";

// Every part and screen of the design, in both themes and every mode, against
// its render in docs/design-screenshots/. The fixture page renders them with
// the demo data; motion=reduce stops each loop in the first frame, the frame
// the references show.

type Case = [reference: string, query: string];

const themes = ["dark", "light"] as const;
const cases: Case[] = [];

for (const theme of themes) {
  for (const status of ["live", "offline", "indexing"]) {
    cases.push([`topbar--${theme}--${status}`, `part=topbar&theme=${theme}&status=${status}`]);
  }
  cases.push([`legend--${theme}`, `part=legend&theme=${theme}`]);
  for (const level of [0, 1, 2, 3]) {
    cases.push([`zoomctl--${theme}--level-${level}`, `part=zoomctl&theme=${theme}&level=${level}`]);
  }
  for (const kind of ["editing", "idle", "offline"]) {
    cases.push([`chatbar--${theme}--${kind}`, `part=chatbar&theme=${theme}&kind=${kind}`]);
  }
  for (const mode of ["default", "ask", "changes", "palette", "onboarding", "offline"]) {
    cases.push([`map-system--${theme}--${mode}`, `screen=map-system&mode=${mode}&theme=${theme}`]);
  }
  for (const screen of ["map-area", "map-file", "map-function"]) {
    cases.push([`${screen}--${theme}`, `screen=${screen}&theme=${theme}`]);
  }
  for (const mode of ["loading", "empty", "settings"]) {
    cases.push([`app-states--${theme}--${mode}`, `screen=app-states&mode=${mode}&theme=${theme}`]);
  }
}

for (const [reference, query] of cases) {
  test(reference, async ({ page }) => {
    await page.goto(`/fixtures.html?${query}&motion=reduce`);
    await page.evaluate("document.fonts.ready");
    await expect(page).toHaveScreenshot(`${reference}--1440x900.png`);
  });
}
