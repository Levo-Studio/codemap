#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";

// node:sqlite, which the cache uses, announces itself as experimental on
// every start. The terminal output is designed line by line, and the warning
// says nothing the user can act on, so that one warning is not printed.
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const text = typeof warning === "string" ? warning : warning.message;
  if (/SQLite/i.test(text)) return;
  (emitWarning as (...args: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;

// Everything else is imported after the filter above is in place: static
// imports would load node:sqlite, and warn, before this file's first line runs.
const { isDirectory, run } = await import("./run.js");
const { en } = await import("./strings/en.js");

const version = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;

const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write(`${version}\n`);
  process.exit(0);
}
const unknown = args.find((a) => a.startsWith("-") && a !== "--no-open");
if (unknown) {
  process.stderr.write(`${en.errors.unknownOption(unknown)}\n`);
  process.exit(2);
}
const root = args.find((a) => !a.startsWith("-")) ?? process.cwd();
if (!(await isDirectory(root))) {
  process.stderr.write(`${en.errors.notADirectory(root)}\n`);
  process.exit(2);
}

const running = await run({
  root,
  open: !args.includes("--no-open"),
  version,
  out: process.stdout,
  env: process.env,
});

const quit = async () => {
  await running.stop();
  process.exit(0);
};
process.on("SIGINT", quit);
process.on("SIGTERM", quit);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (key: Buffer) => {
    // q quits, as the last line says; Ctrl+C still quits in raw mode.
    if (key.toString() === "q" || key[0] === 3) void quit();
  });
}
