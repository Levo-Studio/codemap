// SPDX-License-Identifier: Apache-2.0

// Tries codemapkit the way a user gets it: packed, which assembles it, installed
// from the tarball into an empty folder (its dependencies from the npm
// registry), and run from there on a small project. It must print its
// version, serve the map with the session cookie, and serve the web app.
//
//   node scripts/test-package.mjs

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const work = mkdtempSync(join(tmpdir(), "codemapkit-"));
/** @param {boolean} ok @param {string} what */
const check = (ok, what) => {
  if (!ok) throw new Error(`codemapkit: ${what}`);
  process.stdout.write(`ok  ${what}\n`);
};

try {
  // Packing assembles the package first, through its prepack script, as
  // publishing does.
  execFileSync("pnpm", ["pack", "--pack-destination", work], {
    cwd: join(root, "packages/cli"),
    stdio: "inherit",
  });
  const tarball = readdirSync(work).find((f) => f.endsWith(".tgz"));
  if (!tarball) throw new Error("codemapkit: no tarball");

  const user = join(work, "user");
  mkdirSync(user);
  writeFileSync(
    join(user, "package.json"),
    JSON.stringify({ name: "trying-codemapkit", private: true }),
  );
  // As a user runs it: without the npm_config_* settings pnpm hands its
  // scripts, which npm does not know.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith("npm_config_")),
  );
  execFileSync("npm", ["install", "--no-audit", "--no-fund", join(work, tarball)], {
    cwd: user,
    stdio: "inherit",
    env,
  });
  const installed = join(user, "node_modules/codemapkit");
  const notices = readFileSync(join(installed, "licenses/THIRD-PARTY-NOTICES.txt"), "utf8");
  check(
    ["react ", "react-dom ", "pixi.js ", "motion ", "earcut "].every((n) =>
      notices.includes(`\n${n}`),
    ),
    "the notices of what the web app bundles ship with it",
  );
  const bin = join(user, "node_modules/.bin/codemap");
  const version = JSON.parse(readFileSync(join(root, "packages/cli/package.json"), "utf8")).version;
  check(
    execFileSync(bin, ["--version"]).toString().trim() === version,
    `codemap --version prints ${version}`,
  );

  // Node.js 20 as it would present itself: the command says what it needs,
  // before it loads anything Node.js 20 does not have.
  const older = join(work, "node-20.mjs");
  writeFileSync(older, 'Object.defineProperty(process.versions, "node", { value: "20.15.1" });\n');
  const refused = spawnSync(process.execPath, [
    "--import",
    pathToFileURL(older).href,
    bin,
    "--version",
  ]);
  check(
    refused.status === 1 && refused.stderr.toString().includes("needs Node.js 22.13 or newer"),
    "an older Node.js is told what Codemap needs",
  );

  const project = join(work, "project");
  mkdirSync(join(project, "lib/billing"), { recursive: true });
  writeFileSync(join(project, "lib/billing/charge.ts"), "export function charge() {}\n");
  const cli = spawn(bin, ["--no-open", "--no-explain", project], {
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  try {
    const address = await new Promise((resolve, reject) => {
      let output = "";
      cli.stdout.on("data", (chunk) => {
        output += chunk;
        const found = output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/);
        if (found) resolve(new URL(found[0]));
      });
      const timer = setTimeout(
        () => reject(new Error(`codemap printed no address:\n${output}`)),
        60_000,
      );
      timer.unref();
      cli.on("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`codemap exited with ${code}:\n${output}`));
      });
    });
    const first = await fetch(address, { redirect: "manual" });
    const cookie = first.headers.get("set-cookie")?.split(";")[0] ?? "";
    check(first.status === 302 && cookie.startsWith("codemap_"), "the token becomes a cookie");
    const map = /** @type {{ kind: string, map: { nodes: { label: string }[] } }} */ (
      await (await fetch(`${address.origin}/api/map`, { headers: { cookie } })).json()
    );
    check(
      map.kind === "map" && map.map.nodes.some((n) => n.label === "Billing"),
      "the map of the project is served",
    );
    const page = await (await fetch(`${address.origin}/`, { headers: { cookie } })).text();
    const script = page.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
    check(!!script, "the web app is served");
    const asset = await fetch(`${address.origin}${script}`, { headers: { cookie } });
    check(asset.status === 200, "its assets are served");
  } finally {
    cli.kill("SIGTERM");
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
