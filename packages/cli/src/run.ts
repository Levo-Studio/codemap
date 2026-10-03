// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Analysis,
  analyse,
  type Explained,
  Explainer,
  type ExplainProgress,
  type Explanation,
  type ExplanationStore,
  emptyScreen,
  type LanguageId,
  type LiveProject,
  live as liveTimes,
  loadingScreen,
  openCache,
  type Phase,
  type PhaseReport,
  type Provider,
  phaseWeight,
  type SourceReader,
  startLive,
  watchEarly,
} from "@codemap/core";
import { type MapSource, startServer } from "@codemap/server";
import { projectReader } from "./folder.js";
import { type Mappable, mappable } from "./repository.js";
import { cacheSecret } from "./secret.js";
import { en } from "./strings/en.js";
import {
  addressLine,
  banner,
  cursor,
  detectStyle,
  type Line,
  liveBlock,
  phaseLine,
  progressBar,
  type Style,
  watchingLine,
} from "./terminal.js";

export interface RunOptions {
  root: string;
  open: boolean;
  version: string;
  out: NodeJS.WriteStream;
  env: NodeJS.ProcessEnv;
  provider?: Provider;
}

const weight = { ...phaseWeight, serve: 0 } as const;
type Step = keyof typeof weight | "explain";
const steps: Step[] = ["scan", "parse", "resolve", "group", "explain", "serve"];

const progressEvery = 250;
const explanationsEvery = 2000;

// The code's path decides: the workspace copy may be stale.
export function findWebRoot(from = import.meta.url): string {
  const bundled = /\/bundle\/[^/]+$/.test(new URL(from).pathname);
  return fileURLToPath(new URL(bundled ? "../web" : "../../web/dist", from));
}

function explanationsInMemory(): ExplanationStore {
  const kept = new Map<string, Explanation>();
  return { get: (key) => kept.get(key), set: (key, value) => void kept.set(key, value) };
}

export interface FirstExplanations {
  onProgress: (progress: ExplainProgress) => void;
  onDone: (result: { explained: number; stopped?: string }) => void;
}

function explainFirstRead(
  explainer: Explainer,
  first: Analysis,
  project: string,
  firstRun: FirstExplanations,
  announce: () => void,
  isHalted: () => boolean,
): Promise<void> {
  return explainer
    .explain(first, project, (progress) => {
      if (!isHalted()) firstRun.onProgress(progress);
    })
    .catch((error: unknown) => ({
      explained: 0,
      stopped: error instanceof Error ? error.message : "",
    }))
    .then((result) => {
      if (isHalted()) return;
      firstRun.onDone(result);
      announce();
    })
    .catch(() => {});
}

// Explains the first read, then changes once the agent pauses.
export function followWithExplanations(
  live: LiveProject,
  explainer: Explainer,
  project: string,
  first: Analysis,
  announce: () => void,
  firstRun: FirstExplanations,
): { stop(): void } {
  let explainedFor = first;
  let timer: NodeJS.Timeout | undefined;
  let halted = false;
  let running: Promise<void> = explainFirstRead(
    explainer,
    first,
    project,
    firstRun,
    announce,
    () => halted,
  );
  let waitingFor: Analysis | undefined;
  live.subscribe(() => {
    const now = live.current();
    // A timer's new version of one analysis keeps the wait.
    if (now === explainedFor || now === waitingFor) return;
    waitingFor = now;
    clearTimeout(timer);
    timer = setTimeout(() => {
      running = running.then(async () => {
        const analysis = live.current();
        if (analysis === explainedFor) return;
        explainedFor = analysis;
        await explainer.explain(analysis, project).catch(() => undefined);
        if (!halted) announce();
      });
    }, liveTimes.editingSeconds * 1000);
    timer.unref();
  });
  return {
    stop() {
      halted = true;
      clearTimeout(timer);
      explainer.cancel();
    },
  };
}

function homeAsTilde(folder: string): string {
  const home = homedir();
  return folder === home || folder.startsWith(home + sep)
    ? `~${folder.slice(home.length)}`
    : folder;
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

async function projectKind(root: string, languages: LanguageId[]): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as Record<
      string,
      Record<string, string> | undefined
    >;
    if (pkg.dependencies?.next || pkg.devDependencies?.next) return en.kind.nextjs;
  } catch {
    // No package.json at the root: not a JavaScript project.
  }
  return en.kind.list([...new Set(languages.map((l) => en.kind.languages[l]))]);
}

export function refusal(found: Mappable, path: string): string | undefined {
  if ("root" in found) return undefined;
  return found.refused === "hidden" ? en.errors.hidden(path) : en.errors.notARepository(path);
}

// Weights match the browser's indexing screen; serving counts zero.
function progressOf(fractions: ReadonlyMap<Step, number>): number {
  return steps.reduce(
    (sum, s) => sum + (s === "explain" ? 0 : weight[s] * (fractions.get(s) ?? 0)),
    0,
  );
}

function phaseView(style: Style, out: NodeJS.WriteStream) {
  const lines = Object.fromEntries(
    steps.map((step) => [step, { state: "pending", label: en.phase[step] }]),
  ) as Record<Step, Line>;
  const labelWidth = Math.max(...steps.map((s) => en.phase[s].length));
  const fractions = new Map<Step, number>();
  const block = liveBlock(out);
  let served: string[] = [];
  const line = (step: Step) => phaseLine(style, lines[step], labelWidth);
  return {
    lines,
    fractions,
    line,
    serve(below: string[]) {
      served = below;
    },
    render(final = false) {
      block.draw(
        [...steps.map(line), "", progressBar(style, progressOf(fractions)), ...served],
        final,
      );
    },
  };
}

type PhaseView = ReturnType<typeof phaseView>;

// Resolve reports only when done, so its time always exists.
function phaseResult(report: PhaseReport, languages: LanguageId[]): string {
  const time = report.done ? report.milliseconds : undefined;
  switch (report.phase) {
    case "scan":
      return en.result.files(report.count, time);
    case "parse":
      return en.result.languages(languages, time);
    case "resolve":
      return en.result.links(report.count, report.milliseconds);
    case "group":
      return en.result.areas(report.count, report.modules ?? 0);
  }
}

function lineFor(report: PhaseReport, languages: LanguageId[]): Line {
  return {
    state: report.done ? "done" : "running",
    label: en.phase[report.phase],
    result: phaseResult(report, languages),
  };
}

function mapVersions() {
  const listeners = new Set<(version: number) => void>();
  let version = 0;
  let announced = 0;
  const announce = () => {
    version++;
    for (const listener of listeners) listener(version);
  };
  return {
    current: () => version,
    subscribe(listener: (version: number) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    announce,
    // Throttled, so the browser is not told of every file.
    announceAtMost(every: number, now = false) {
      if (!now && performance.now() - announced <= every) return;
      announced = performance.now();
      announce();
    },
  };
}

type Versions = ReturnType<typeof mapVersions>;

// Indexing screen until the first read, empty screen without code.
function mapSource(
  project: string,
  root: string,
  from: {
    reports: ReadonlyMap<Phase, PhaseReport>;
    live: () => LiveProject | undefined;
    versions: Versions;
    cache: Awaited<ReturnType<typeof openCache>> | undefined;
    read: SourceReader;
    explainer: Explainer | undefined;
    provider: Provider | undefined;
  },
): MapSource {
  const { live, cache, explainer } = from;
  return {
    screen: () => {
      const now = live();
      if (!now) return loadingScreen(project, from.reports);
      return now.current().files.length === 0 ? emptyScreen(project, homeAsTilde(root)) : undefined;
    },
    current: () => (live() as LiveProject).current(),
    get session() {
      return live()?.session;
    },
    version: from.versions.current,
    subscribe: from.versions.subscribe,
    ...(cache ? { layouts: cache.layouts } : {}),
    read: from.read,
    provider: () => from.provider,
    ...(cache ? { chats: cache.chats } : {}),
    words: (mode) =>
      explainer && { mode, get: (kind: Explained, id: string) => explainer.get(kind, id) },
  };
}

function explainStep(
  view: PhaseView,
  out: NodeJS.WriteStream,
  versions: Versions,
  follow: { explainer: Explainer | undefined; live: LiveProject; project: string; first: Analysis },
): { stop(): void } | undefined {
  const { explainer } = follow;
  if (!explainer) {
    view.lines.explain = {
      state: "pending",
      label: en.phase.explain,
      result: en.result.explanationsOff,
    };
    return undefined;
  }
  const started = performance.now();
  view.lines.explain = { state: "running", label: en.phase.explain };
  return followWithExplanations(
    follow.live,
    explainer,
    follow.project,
    follow.first,
    versions.announce,
    {
      onProgress: (progress) => {
        view.lines.explain = {
          state: "running",
          label: en.phase.explain,
          result: en.result.explaining(progress.done, progress.total),
        };
        view.render();
        versions.announceAtMost(explanationsEvery);
      },
      onDone: (result) => {
        view.lines.explain = {
          state: "done",
          label: en.phase.explain,
          result: result.stopped
            ? en.result.explanationsStopped(result.stopped)
            : en.result.explained(result.explained, performance.now() - started),
        };
        if (out.isTTY) view.render();
        else out.write(`${view.line("explain")}\n`);
      },
    },
  );
}

// Refused folders are rejected before anything is read or served.
async function repositoryOf(root: string, given: string): Promise<string> {
  const found = await mappable(root);
  if (!("root" in found)) throw new Error(refusal(found, given));
  return found.root;
}

// Watching starts first, so changes during the read are kept.
async function readAndGoLive(
  root: string,
  described: { kind: string },
  languagesRead: () => LanguageId[],
  read: {
    cached: { cache?: NonNullable<Awaited<ReturnType<typeof openCache>>> };
    onProgress: (report: PhaseReport) => void;
    env: NodeJS.ProcessEnv;
    repository: string;
  },
): Promise<{ analysis: Analysis; live: LiveProject }> {
  const { cached, onProgress, env, repository } = read;
  const early = await watchEarly(root);
  const analysis = await analyse(root, { ...cached, onProgress, env, repository });
  described.kind = await projectKind(root, languagesRead());
  const live = await startLive(root, analysis, {
    ...cached,
    changes: early.changes,
    env,
    repository,
  });
  return { analysis, live };
}

export async function run(options: RunOptions): Promise<{ stop(): Promise<void> }> {
  const { out, env } = options;
  const style = detectStyle(env, !!out.isTTY);
  const root = resolve(options.root);
  const repository = await repositoryOf(root, options.root);
  const project = basename(root);

  out.write(out.isTTY ? cursor.blinking : "");
  out.write(`\n${banner(style, options.version, project).join("\n")}\n\n`);
  const view = phaseView(style, out);
  view.render();

  // The server starts first, so the browser shows the read.
  const reports = new Map<Phase, PhaseReport>();
  const versions = mapVersions();
  let live: LiveProject | undefined;
  const secret = await cacheSecret(env);
  const cache = await openCache(root, { secret }).catch(() => undefined);
  const cached = cache ? { cache } : {};
  const read = projectReader(root);
  const explainer =
    options.provider &&
    new Explainer(options.provider, cache?.explanations ?? explanationsInMemory(), read);
  const described = { name: project, kind: "" };
  const source = mapSource(project, root, {
    reports,
    live: () => live,
    versions,
    cache,
    read,
    explainer,
    provider: options.provider,
  });
  const startedServing = performance.now();
  const server = await startServer({ source, project: described, webRoot: findWebRoot() });
  const serving = performance.now() - startedServing;
  const opened = options.open && openBrowser(server.url);

  let languages: LanguageId[] = [];
  const onProgress = (report: PhaseReport) => {
    if (report.phase === "parse") {
      languages = report.languages ?? languages;
      view.fractions.set("parse", report.total ? report.count / report.total : 0);
    }
    if (report.done) view.fractions.set(report.phase, 1);
    view.lines[report.phase] = lineFor(report, languages);
    view.render();
    const phaseChanged = reports.get(report.phase)?.done !== report.done;
    reports.set(report.phase, report);
    versions.announceAtMost(progressEvery, phaseChanged);
  };

  const first = await readAndGoLive(root, described, () => languages, {
    cached,
    onProgress,
    env,
    repository,
  });
  const analysis = first.analysis;
  live = first.live;
  live.subscribe(versions.announce);
  versions.announce();

  view.lines.serve = { state: "done", label: en.phase.serve, result: en.result.time(serving) };
  view.fractions.set("serve", 1);
  view.serve(["", addressLine(style, server.url, opened), watchingLine(style)]);
  const explanations = explainStep(view, out, versions, {
    explainer,
    live,
    project,
    first: analysis,
  });
  view.render(true);
  out.write(out.isTTY ? cursor.steady : "");

  return {
    async stop() {
      explanations?.stop();
      await server.close();
      await live?.close();
      cache?.close();
    },
  };
}
