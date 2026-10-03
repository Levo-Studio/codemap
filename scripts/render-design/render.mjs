// SPDX-License-Identifier: Apache-2.0

// Renders every page of design/ and every theme and mode its components offer
// into docs/design-screenshots/, the references of the visual tests. Run it
// in the Playwright container, with the design tool's runtime from the
// original export, which is not part of this repository:
//
//   CODEMAP_SUPPORT_JS=/path/to/support.js \
//     scripts/in-container.sh node scripts/render-design/render.mjs
//
// Text is rendered without subpixel antialiasing, as in the visual tests:
// Chrome never uses it for text above the map's WebGL canvas.

import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { chromium } from "@playwright/test";

const DESIGN = "design";
const SUPPORT = "/support/support.js";
const OUT = "docs/design-screenshots";
const PORT = 8765;

/** @param {string} s */
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/\.dc\.html$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// A component page with props is rendered through a small wrapper page, the
// way 06 Screens imports them. Numbers go through the wrapper's own logic so
// the component receives a number, as the screens pass it, not a string.
/** @type {Map<string, string>} */
const wrappers = new Map();
/**
 * @param {string} name
 * @param {Record<string, string | number>} props
 * @param {string} width
 * @param {string} height
 * @param {string} pageBackground
 */
function wrap(name, props, width, height, pageBackground) {
  const numbers = Object.entries(props).filter(([, v]) => typeof v === "number");
  const attributes = Object.entries(props)
    .map(([k, v]) => (typeof v === "number" ? `${k}="{{ n_${k} }}"` : `${k}="${v}"`))
    .join(" ");
  const logic = numbers.length
    ? `<script type="text/x-dc" data-dc-script>class Component extends DCLogic { renderVals() { return { ${numbers
        .map(([k, v]) => `n_${k}: ${v}`)
        .join(", ")} }; } }</script>`
    : "";
  const file = `_render_${slug(name)}_${Object.values(props).join("_")}.dc.html`;
  wrappers.set(
    file,
    `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="./support.js"></script></head><body><x-dc><helmet><style>body{margin:0;background:${pageBackground}}</style></helmet><div style="width:${width};height:${height}"><dc-import name="${name}" ${attributes} hint-size="${width},${height}"></dc-import></div></x-dc>${logic}</body></html>`,
  );
  return file;
}

const background = { dark: "#0b0c0e", light: "#f7f7f5" };
/** @type {{ name: string, url: string, fullPage?: boolean }[]} */
const jobs = [];
for (const page of [
  "Index",
  "Codemap Directions",
  "Modern Dark",
  "01 Brand",
  "02 Brand Sheet",
  "03 Foundations",
  "04 Map Language",
  "05 Components",
  "06 Screens",
]) {
  jobs.push({ name: slug(page), url: `${page}.dc.html`, fullPage: true });
}
for (const theme of /** @type {const} */ (["dark", "light"])) {
  const bg = background[theme];
  for (const mode of ["default", "ask", "changes", "palette", "onboarding", "offline"]) {
    jobs.push({
      name: `map-system--${theme}--${mode}`,
      url: wrap("Map System", { theme, mode }, "1440px", "900px", bg),
    });
  }
  for (const screen of ["Map Area", "Map File", "Map Function"]) {
    jobs.push({
      name: `${slug(screen)}--${theme}`,
      url: wrap(screen, { theme }, "1440px", "900px", bg),
    });
  }
  for (const mode of ["loading", "empty", "settings"]) {
    jobs.push({
      name: `app-states--${theme}--${mode}`,
      url: wrap("App States", { theme, mode }, "1440px", "900px", bg),
    });
  }
  for (const status of ["live", "offline", "indexing"]) {
    jobs.push({
      name: `topbar--${theme}--${status}`,
      url: wrap("Topbar", { theme, status }, "1440px", "56px", bg),
    });
  }
  for (const kind of ["editing", "idle", "offline"]) {
    jobs.push({
      name: `chatbar--${theme}--${kind}`,
      url: wrap("ChatBar", { theme, kind }, "580px", "96px", bg),
    });
  }
  jobs.push({ name: `legend--${theme}`, url: wrap("Legend", { theme }, "120px", "130px", bg) });
  for (const level of [0, 1, 2, 3]) {
    jobs.push({
      name: `zoomctl--${theme}--level-${level}`,
      url: wrap("ZoomCtl", { theme, level }, "140px", "110px", bg),
    });
  }
}

/** @type {Record<string, string>} */
const types = { ".html": "text/html", ".js": "text/javascript" };
const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname).slice(
    1,
  );
  try {
    const body =
      wrappers.get(path) ?? (await readFile(path === "support.js" ? SUPPORT : join(DESIGN, path)));
    response.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(undefined)));

// Without the runtime every page renders empty, and the references would be
// replaced by blank images. Stop before anything is removed.
try {
  await access(SUPPORT);
} catch {
  process.stderr.write(
    `No design runtime at ${SUPPORT}. Set CODEMAP_SUPPORT_JS to support.js from the export.\n`,
  );
  process.exit(1);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--disable-lcd-text"] });
/** @type {[number, number][]} */
const viewports = [
  [1440, 900],
  [1920, 1080],
];
for (const [width, height] of viewports) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (const job of jobs) {
    await page.goto(`http://127.0.0.1:${PORT}/${encodeURI(job.url)}`, { waitUntil: "networkidle" });
    await page.evaluate("document.fonts.ready");
    await page.waitForTimeout(1200);
    await writeFile(
      `${OUT}/${job.name}--${width}x${height}.png`,
      await page.screenshot({ fullPage: !!job.fullPage, animations: "disabled" }),
    );
  }
  await context.close();
}
await browser.close();
server.close();
process.stdout.write(`${jobs.length * 2} renders in ${OUT}\n`);
