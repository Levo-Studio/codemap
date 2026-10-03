#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { supported } from "./node-version.js";
import { en } from "./strings/en.js";

function fail(message: string, code: number): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

// The version check runs before the imports below, which an older Node.js
// cannot load.
function refuseOldNode(): void {
  if (!supported(process.versions.node)) fail(en.errors.oldNode(process.versions.node), 1);
}

// node:sqlite, which the cache uses, announces itself as experimental on
// every start. The terminal output is designed line by line, and the warning
// says nothing the user can act on, so that one warning is not printed.
// Everything else is imported after this filter is in place: static
// imports would load node:sqlite, and warn, before this file's first line runs.
function hideSqliteWarning(): void {
  const emitWarning = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === "string" ? warning : warning.message;
    if (/SQLite/i.test(text)) return;
    (emitWarning as (...args: unknown[]) => void)(warning, ...rest);
  }) as typeof process.emitWarning;
}

refuseOldNode();
hideSqliteWarning();

const { refusal, run } = await import("./run.js");
const { isDirectory } = await import("./folder.js");
const { ctrlC, cursorRestorer, detectStyle, versionText } = await import("./terminal.js");
const { mappable } = await import("./repository.js");
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
  const isTerminal = !!process.stdout.isTTY;
  process.stdout.write(
    `${versionText(detectStyle(process.env, isTerminal), version, isTerminal)}\n`,
  );
  process.exit(0);
}
const knownFlags = ["--no-open", "--no-explain"];
const unknown = args.find((a) => a.startsWith("-") && !knownFlags.includes(a));
if (unknown) fail(en.errors.unknownOption(unknown), 2);
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
if (!(await isDirectory(root))) fail(en.errors.notADirectory(root), 2);
const refused = refusal(await mappable(root), root);
if (refused) fail(refused, 2);

// The opt-in question is asked once, at the first start in a terminal; until
// it is answered, explanations stay off. --no-explain keeps them off for this
// run, whatever the settings say.
const provider = await explanationProvider({
  explain: !args.includes("--no-explain"),
  terminal,
  store,
});

// The cursor restorer is installed before the project is read, so Ctrl+C
// during reading also leaves the terminal's cursor as it was.
const restoreCursor = cursorRestorer(process.stdout);
let running: Awaited<ReturnType<typeof run>> | undefined;
const quit = async (code: number) => {
  await running?.stop();
  restoreCursor();
  process.exit(code);
};
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => void quit(0));

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
  fail(en.errors.failed(error instanceof Error ? error.message : ""), 1);
}

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (key: Buffer) => {
    // q quits, as the last line says; Ctrl+C still quits in raw mode.
    const typed = key.toString();
    if (typed === "q" || typed.startsWith(ctrlC)) void quit(0);
  });
}
