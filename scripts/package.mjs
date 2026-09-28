// SPDX-License-Identifier: Apache-2.0

// Assembles codemapkit, the package users install, in packages/cli: the web
// app built, the CLI bundled with the workspace's core and server, and beside
// them what the bundle reads at runtime (the grammars, the web app) and what
// has to ship with it (the licence texts of the fonts and grammars, the
// project's LICENSE, NOTICE and README). Nothing it copies is committed.
//
//   node scripts/package.mjs

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
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
