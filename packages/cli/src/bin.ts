#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { supported } from "./node-version.js";
import { en } from "./strings/en.js";

// An older Node.js cannot load what follows; it is told so in one sentence.
if (!supported(process.versions.node)) {
  process.stderr.write(`${en.errors.oldNode(process.versions.node)}\n`);
  process.exit(1);
}

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
const { cursorRestorer, isDirectory, run } = await import("./run.js");
const { keychain } = await import("./settings.js");
const { explanationProvider, setup } = await import("./setup.js");

const version = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`${en.usage}\n`);
  process.exit(0);
}
if (args.includes("--version")) {
  const { detectStyle, versionText } = await import("./terminal.js");
  const terminal = !!process.stdout.isTTY;
  process.stdout.write(`${versionText(detectStyle(process.env, terminal), version, terminal)}\n`);
  process.exit(0);
}
const options = ["--no-open", "--no-explain"];
const unknown = args.find((a) => a.startsWith("-") && !options.includes(a));
if (unknown) {
  process.stderr.write(`${en.errors.unknownOption(unknown)}\n`);
  process.exit(2);
}
const terminal = { input: process.stdin, out: process.stdout };
const store = keychain();

// codemap setup: choose the provider for explanations and Ask, then end.
if (args[0] === "setup") {
  try {
    await setup(terminal, store);
  } catch {
    process.stdout.write(`${en.setup.noKeychain}\n`);
    process.exit(1);
  }
  process.exit(0);
}

const root = args.find((a) => !a.startsWith("-")) ?? process.cwd();
if (!(await isDirectory(root))) {
  process.stderr.write(`${en.errors.notADirectory(root)}\n`);
  process.exit(2);
}

// Asked once, at the first start in a terminal; without one it stays off.
// --no-explain keeps explanations off for this run, whatever the settings.
const provider = await explanationProvider({
  explain: !args.includes("--no-explain"),
  terminal,
  store,
});

// Installed before reading starts: Ctrl+C while the project is read has to
// leave the terminal as it found it too.
const restoreCursor = cursorRestorer(process.stdout);
let running: Awaited<ReturnType<typeof run>> | undefined;
const quit = async (code: number) => {
  await running?.stop();
  restoreCursor();
  process.exit(code);
};
process.on("SIGINT", () => void quit(0));
process.on("SIGTERM", () => void quit(0));

try {
  running = await run({
    root,
    open: !args.includes("--no-open"),
    version,
    out: process.stdout,
    ...(provider ? { provider } : {}),
    env: process.env,
  });
} catch (error) {
  restoreCursor();
  process.stderr.write(`${en.errors.failed(error instanceof Error ? error.message : "")}\n`);
  process.exit(1);
}

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (key: Buffer) => {
    // q quits, as the last line says; Ctrl+C still quits in raw mode.
    if (key.toString() === "q" || key[0] === 3) void quit(0);
  });
}
