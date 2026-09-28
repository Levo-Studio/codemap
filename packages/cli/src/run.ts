// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyse,
  emptyScreen,
  type LanguageId,
  type LiveProject,
  loadingScreen,
  openCache,
  type Phase,
  type PhaseReport,
  phaseWeight,
  startLive,
  watchEarly,
} from "@codemap/core";
import { type MapSource, startServer } from "@codemap/server";
import { en } from "./strings/en.js";
import {
  addressLine,
  banner,
  cursor,
  detectStyle,
  type Line,
  phaseLine,
  progressBar,
  type Style,
  watchingLine,
} from "./terminal.js";

// What `codemap` does: read the project phase by phase while the terminal
// shows each phase, start the local server, open the browser, and wait.

export interface RunOptions {
  root: string;
  open: boolean;
  version: string;
  out: NodeJS.WriteStream;
  env: NodeJS.ProcessEnv;
}

// How much of the whole run each phase stands for, for the progress bar: the
// same shares as the browser's indexing screen. The server is up before the
// read starts and adds nothing.
const weight = { ...phaseWeight, serve: 0 } as const;
type Step = keyof typeof weight | "explain";
const steps: Step[] = ["scan", "parse", "resolve", "group", "explain", "serve"];

// The browser follows the first read on its indexing screen; it is told of
// progress at most this often, in milliseconds, not once per file.
const progressEvery = 250;

// A folder as the empty screen names it: under the home folder with ~.
function shown(folder: string): string {
  const home = homedir();
  return folder === home || folder.startsWith(home + sep)
    ? `~${folder.slice(home.length)}`
    : folder;
}

// A block of lines at the bottom of the terminal, redrawn in place while it
// changes. Where output is not a terminal, only the finished block is written.
function liveBlock(out: NodeJS.WriteStream) {
  let drawn = 0;
  return {
    draw(lines: string[], final = false) {
      if (!out.isTTY && !final) return;
      if (out.isTTY && drawn > 0) out.write(`\u001b[${drawn}F`);
      for (const line of lines) out.write(`${out.isTTY ? "\u001b[2K" : ""}${line}\n`);
      drawn = out.isTTY ? lines.length : 0;
    },
  };
}

function openBrowser(url: string): boolean {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export async function projectKind(root: string, languages: LanguageId[]): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as Record<
      string,
      Record<string, string> | undefined
    >;
    if (pkg.dependencies?.next || pkg.devDependencies?.next) return en.kind.nextjs;
  } catch {
    // No package.json: not a JavaScript project, or not one at the root.
  }
  return en.kind.list([...new Set(languages.map((l) => en.kind.languages[l]))]);
}

export async function run(options: RunOptions): Promise<{ stop(): Promise<void> }> {
  const style: Style = detectStyle(options.env, !!options.out.isTTY);
  const root = resolve(options.root);
  const project = basename(root);
  const out = options.out;

  out.write(options.out.isTTY ? cursor.blinking : "");
  out.write(`\n${banner(style, options.version, project).join("\n")}\n\n`);

  const lines = new Map<Step, Line>(
    steps.map((step) => [step, { state: "pending", label: en.phase[step] }]),
  );
  const labelWidth = Math.max(...steps.map((s) => en.phase[s].length));
  const fractions = new Map<Step, number>();
  const block = liveBlock(out);
  const render = (final = false) => {
    const progress = steps.reduce(
      (sum, s) => sum + (s === "explain" ? 0 : weight[s] * (fractions.get(s) ?? 0)),
      0,
    );
    block.draw(
      [
        ...steps.map((s) => phaseLine(style, lines.get(s) as Line, labelWidth)),
        "",
        progressBar(style, progress),
      ],
      final,
    );
  };
  render();

  // The server starts first, so the browser can show the first read as it
  // happens (S1); until it is done the source answers the indexing screen,
  // then the empty screen if there is no code, and the live map after that.
  const reports = new Map<Phase, PhaseReport>();
  const listeners = new Set<(version: number) => void>();
  let version = 0;
  let live: LiveProject | undefined;
  const announce = () => {
    version++;
    for (const listener of listeners) listener(version);
  };
  let announced = 0;
  const cache = await openCache(root).catch(() => undefined);
  // The project's kind is known once its languages are; the server reads it
  // from this object on every map it builds.
  const described = { name: project, kind: "" };
  const source: MapSource = {
    screen: () => {
      if (!live) return loadingScreen(project, reports);
      return live.current().files.length === 0 ? emptyScreen(project, shown(root)) : undefined;
    },
    current: () => (live as LiveProject).current(),
    get session() {
      return live?.session;
    },
    version: () => version,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ...(cache ? { layouts: cache.layouts } : {}),
    read: projectReader(root),
  };
  const started = performance.now();
  const webRoot = fileURLToPath(new URL("../../web/dist", import.meta.url));
  const server = await startServer({ source, project: described, webRoot });
  const serving = performance.now() - started;
  const opened = options.open && openBrowser(server.url);

  let languages: LanguageId[] = [];
  const onProgress = (report: PhaseReport) => {
    const done = report.done;
    const line: Line = { state: done ? "done" : "running", label: en.phase[report.phase] };
    if (report.phase === "scan")
      line.result = en.result.files(report.count, done ? report.milliseconds : undefined);
    if (report.phase === "parse") {
      languages = report.languages ?? languages;
      line.result = en.result.languages(languages, done ? report.milliseconds : undefined);
      fractions.set("parse", report.total ? report.count / report.total : 0);
    }
    if (report.phase === "resolve")
      line.result = en.result.links(report.count, report.milliseconds);
    if (report.phase === "group") line.result = en.result.areas(report.count, report.modules ?? 0);
    if (done) fractions.set(report.phase, 1);
    lines.set(report.phase, line);
    render();
    const phaseChanged = reports.get(report.phase)?.done !== report.done;
    reports.set(report.phase, report);
    if (phaseChanged || performance.now() - announced > progressEvery) {
      announced = performance.now();
      announce();
    }
  };

  // The cache only saves time. In a folder Codemap may not write to, the
  // project is read in full without one.
  // Watched from before the first read, so what the agent changes while
  // the project is read is taken in once the map is live.
  const early = await watchEarly(root);
  const analysis = await analyse(root, { ...(cache ? { cache } : {}), onProgress });
  described.kind = await projectKind(root, languages);
  live = await startLive(root, analysis, {
    ...(cache ? { cache } : {}),
    changes: early.changes,
  });
  live.subscribe(announce);
  announce();

  lines.set("explain", {
    state: "pending",
    label: en.phase.explain,
    result: en.result.explanationsOff,
  });
  lines.set("serve", {
    state: "done",
    label: en.phase.serve,
    result: en.result.time(serving),
  });
  fractions.set("serve", 1);
  render(true);

  out.write(`\n${addressLine(style, server.url, opened)}\n${watchingLine(style)}\n`);
  out.write(options.out.isTTY ? cursor.steady : "");

  return {
    async stop() {
      await server.close();
      await live?.close();
      cache?.close();
    },
  };
}

// Puts the terminal's own cursor back, once, whether Codemap quits, is
// interrupted while it reads, or fails.
export function cursorRestorer(out: NodeJS.WriteStream): () => void {
  let restored = false;
  return () => {
    if (restored || !out.isTTY) return;
    restored = true;
    out.write(cursor.restore);
  };
}

// Reads files of the project for what a panel shows of the code; a path
// that leaves the project is never read.
export function projectReader(root: string): (path: string) => string | undefined {
  const base = resolve(root);
  return (path) => {
    const file = resolve(base, path);
    if (!file.startsWith(base + sep)) return undefined;
    try {
      return readFileSync(file, "utf8");
    } catch {
      return undefined;
    }
  };
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
