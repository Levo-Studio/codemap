// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyse, type LanguageId, openCache, type PhaseReport } from "@codemap/core";
import { startServer } from "@codemap/server";
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

// How much of the whole run each phase stands for, for the progress bar.
const weight = { scan: 0.1, parse: 0.6, resolve: 0.15, group: 0.1, serve: 0.05 } as const;
type Step = keyof typeof weight | "explain";
const steps: Step[] = ["scan", "parse", "resolve", "group", "explain", "serve"];

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
    if (pkg.dependencies?.next || pkg.devDependencies?.next) return "Next.js";
  } catch {
    // No package.json: not a JavaScript project, or not one at the root.
  }
  const names: Record<LanguageId, string> = {
    typescript: "TypeScript",
    tsx: "TypeScript",
    javascript: "JavaScript",
    python: "Python",
    go: "Go",
  };
  return [...new Set(languages.map((l) => names[l]))].join(", ");
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
  };

  const cache = await openCache(root);
  const analysis = await analyse(root, { cache, onProgress });
  cache.close();

  lines.set("explain", {
    state: "pending",
    label: en.phase.explain,
    result: en.result.explanationsOff,
  });
  lines.set("serve", { state: "running", label: en.phase.serve });
  render();
  const started = performance.now();
  const webRoot = fileURLToPath(new URL("../../web/dist", import.meta.url));
  const server = await startServer({
    analysis,
    project: { name: project, kind: await projectKind(root, languages) },
    webRoot,
  });
  lines.set("serve", {
    state: "done",
    label: en.phase.serve,
    result: en.result.time(performance.now() - started),
  });
  fractions.set("serve", 1);
  render(true);

  const opened = options.open && openBrowser(server.url);
  out.write(`\n${addressLine(style, server.url, opened)}\n${watchingLine(style)}\n`);
  out.write(options.out.isTTY ? cursor.steady : "");

  return {
    async stop() {
      await server.close();
      out.write(options.out.isTTY ? cursor.restore : "");
    },
  };
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
