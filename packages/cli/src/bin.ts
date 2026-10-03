#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { supported } from "./node-version.js";
import { en } from "./strings/en.js";

function fail(message: string, code: number): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

// Older Node.js cannot load the imports below, so check first.
function refuseOldNode(): void {
  if (!supported(process.versions.node)) fail(en.errors.oldNode(process.versions.node), 1);
}

// Hides node:sqlite's warning before the dynamic imports load it.
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

const provider = await explanationProvider({
  explain: !args.includes("--no-explain"),
  terminal,
  store,
});

const restoreCursor = cursorRestorer(process.stdout);
let running: Awaited<ReturnType<typeof run>> | undefined;
// Restores the cursor, even when Ctrl+C interrupts the read.
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
    // q quits as promised; raw mode turns Ctrl+C into keys.
    const typed = key.toString();
    if (typed === "q" || typed.startsWith(ctrlC)) void quit(0);
  });
}
