// SPDX-License-Identifier: Apache-2.0

// Assembles codemapkit, the package users install, in packages/cli: the web
// app built, the CLI bundled with the workspace's core and server, and beside
// them what the bundle reads at runtime (the grammars, the web app) and what
// has to ship with it (the licence texts of the fonts, the grammars and what
// the web app bundles, the project's LICENSE, NOTICE and README). Nothing it
// copies is committed.
//
//   node scripts/package.mjs

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const cli = `${root}packages/cli/`;
/** @param {string[]} args */
const run = (...args) => execFileSync("pnpm", args, { cwd: root, stdio: "inherit" });

run("--filter", "@codemap/web", "build");
run("--filter", "codemapkit", "bundle");

for (const folder of ["web", "grammars", "licenses"])
  rmSync(`${cli}${folder}`, { recursive: true, force: true });
cpSync(`${root}packages/web/dist`, `${cli}web`, { recursive: true });
mkdirSync(`${cli}grammars`);
mkdirSync(`${cli}licenses`);
const grammars = `${root}packages/core/grammars/`;
for (const file of readdirSync(grammars))
  cpSync(
    `${grammars}${file}`,
    file.endsWith(".wasm") ? `${cli}grammars/${file}` : `${cli}licenses/${file}`,
  );
const fonts = `${root}packages/web/src/design/fonts/`;
for (const file of readdirSync(fonts).filter((f) => f.startsWith("OFL-")))
  cpSync(`${fonts}${file}`, `${cli}licenses/${file}`);
for (const file of ["LICENSE", "NOTICE", "README.md"]) cpSync(`${root}${file}`, `${cli}${file}`);

// A package published without its licence text: under MIT the licence is
// the standard text with its author's notice, taken from its manifest. Any
// other licence without its text stops the assembly.
/** @param {string} name @param {string} license @param {string} folder */
function mitWithout(name, license, folder) {
  const author = /** @type {{ author?: string | { name?: string } }} */ (
    JSON.parse(readFileSync(`${folder}/package.json`, "utf8"))
  ).author;
  const holder = typeof author === "string" ? author : author?.name;
  if (license !== "MIT" || !holder)
    throw new Error(`No licence text in ${name}; its notice cannot ship.`);
  return [
    "MIT License",
    "",
    `Copyright (c) ${holder}`,
    "",
    'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:',
    "",
    "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.",
    "",
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.',
  ].join("\n");
}

// The web app bundles its dependencies into its assets, and their licences
// ask for their notices to travel with every copy: each one's licence text,
// from the package itself. Packages of types only are not in the bundle.
const report =
  /** @type {Record<string, { name: string, versions: string[], paths: string[], homepage?: string }[]>} */ (
    JSON.parse(
      execFileSync("pnpm", ["--filter", "@codemap/web", "licenses", "list", "--prod", "--json"], {
        cwd: root,
      }).toString(),
    )
  );
const notices = [
  "Third-party software bundled into the Codemap web app (web/assets), with the",
  "licence each is distributed under.",
  "",
];
const shipped = Object.entries(report)
  .flatMap(([license, packages]) => packages.map((p) => ({ ...p, license })))
  .filter((p) => !p.name.startsWith("@types/") && p.name !== "@webgpu/types")
  .sort((a, b) => a.name.localeCompare(b.name));
for (const p of shipped) {
  const folder = p.paths[0] ?? "";
  const file = readdirSync(folder).find((f) => /^(licen[cs]e|copying)/i.test(f));
  notices.push(
    "-".repeat(78),
    `${p.name} ${p.versions.join(", ")} (${p.license})${p.homepage ? `\n${p.homepage}` : ""}`,
    "",
    file ? readFileSync(`${folder}/${file}`, "utf8").trim() : mitWithout(p.name, p.license, folder),
    "",
  );
}
writeFileSync(`${cli}licenses/THIRD-PARTY-NOTICES.txt`, `${notices.join("\n")}\n`);
