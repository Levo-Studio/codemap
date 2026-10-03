// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { type Analysis, lineCount } from "./analyse.js";
import type { Explanation, ExplanationStore } from "./cache.js";
import type { FileNode } from "./graph.js";
import { kindId, symbolId } from "./ids.js";
import type { SourceReader } from "./panels.js";
import { jsonObjectIn, type Provider, ProviderError } from "./providers.js";
import { redact } from "./redact.js";
import { en } from "./strings/en.js";
import { seconds } from "./time.js";

export type Explained = "function" | "file" | "module" | "area" | "system";

export interface ExplainProgress {
  done: number;
  total: number;
}

const parallel = 4;
const codeLimit = 8000;
const tokensEach = 400;
const sizes = {
  ollama: { things: 4, characters: 6000 },
  other: { things: 12, characters: 24000 },
} as const;
interface Size {
  things: number;
  characters: number;
}
const giveUpAfter = 5;
const retries = 2;
const busy = new Set([429, 529]);
const pauses = [seconds(5), seconds(15), seconds(30), seconds(60)];

class Busy extends Error {}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const system = [
  "You explain code to people who build software with an AI agent but may not read code.",
  'Each thing to explain starts with a line "### name". Answer with JSON only: one entry per thing, keyed by its name exactly as written: {"name": {"simple": "...", "technical": "..."}}.',
  "simple: one or two short sentences anyone understands, no jargon, no code.",
  "technical: one or two sentences for a developer; put identifiers, events and values in backticks.",
  "Say what it does and why it matters, not how each line works. Never invent what is not shown.",
].join("\n");

const hash = (...parts: string[]) =>
  createHash("sha256").update(JSON.stringify(parts)).digest("hex");

const readOne = (value: unknown): Explanation | undefined => {
  const v = value as Partial<Explanation> | undefined;
  if (typeof v?.simple !== "string" || typeof v.technical !== "string") return undefined;
  return { simple: v.simple.trim(), technical: v.technical.trim() };
};

// The model may wrap names in backticks or a heading.
const unquoted = (text: string) =>
  text
    .trim()
    .replace(/^`(.*)`$/, "$1")
    .trim();
const nameOf = (key: string) => unquoted(unquoted(key).replace(/^#+\s+/, ""));

// An exact key wins over one matched after unquoting.
export function readAnswer(answer: string): Map<string, Explanation> {
  const found = new Map<string, Explanation>();
  const read = new Set<string>();
  const add = (key: string, explanation: Explanation) => {
    const name = nameOf(key);
    if (name === key) {
      found.set(key, explanation);
      read.add(key);
    } else if (!read.has(name)) found.set(name, explanation);
  };
  const json = jsonObjectIn(answer);
  if (json === undefined) return found;
  try {
    const value = JSON.parse(json) as Record<string, unknown>;
    for (const [name, entry] of Object.entries(value)) {
      const explanation = readOne(entry);
      if (explanation) add(name, explanation);
    }
  } catch {
    readEachWholeEntry(answer, add);
  }
  return found;
}

// A cut-off answer keeps only its whole entries.
function readEachWholeEntry(
  answer: string,
  add: (key: string, explanation: Explanation) => void,
): void {
  for (const m of answer.matchAll(/"((?:[^"\\]|\\.)*)"\s*:\s*(\{[^{}]*\})/g)) {
    const entry = readWholeEntry(m[1] as string, m[2] as string);
    if (entry) add(...entry);
  }
}

function readWholeEntry(key: string, body: string): [string, Explanation] | undefined {
  try {
    const explanation = readOne(JSON.parse(body));
    return explanation ? [JSON.parse(`"${key}"`) as string, explanation] : undefined;
  } catch {
    return undefined;
  }
}

interface Task {
  kind: Explained;
  id: string;
  key: string;
  name: string;
  body: string;
}

interface Group {
  intro: string;
  tasks: Task[];
}

// A single task over the limit gets its own request.
function requests(group: Group, size: Size): Group[] {
  const out: Group[] = [];
  let tasks: Task[] = [];
  let carried = 0;
  for (const task of group.tasks) {
    const full = tasks.length >= size.things || carried + task.body.length > size.characters;
    if (tasks.length > 0 && full) {
      out.push({ intro: group.intro, tasks });
      tasks = [];
      carried = 0;
    }
    tasks.push(task);
    carried += task.body.length;
  }
  if (tasks.length > 0) out.push({ intro: group.intro, tasks });
  return out;
}

interface Run {
  done: number;
  readonly total: number;
  failures: number;
  stopped: string | undefined;
  readonly next: Map<string, Explanation>;
  progress(): void;
}

type Failure = "busy" | "givenUp" | "refused" | "failed";

function classifyFailure(error: unknown, round: number): Failure {
  if (error instanceof Busy) return "busy";
  // Only the client's own errors count, not HTTP bodies.
  const aboutAnswer =
    error instanceof ProviderError &&
    error.status === undefined &&
    (error.message === en.provider.declined || error.message === en.provider.cutOff);
  if (aboutAnswer && round > 0) return "givenUp";
  const refused = error instanceof ProviderError && (error.status === 401 || error.status === 403);
  return refused ? "refused" : "failed";
}

// Symbols sharing a name are one node, so one explanation.
function functionTasks(file: FileNode, lines: string[], run: Run): Task[] {
  const functions: Task[] = [];
  const names = new Set<string>();
  for (const symbol of file.symbols) {
    if (names.has(symbol.name)) {
      run.done++;
      continue;
    }
    names.add(symbol.name);
    const code = lines
      .slice(symbol.startLine - 1, symbol.endLine)
      .join("\n")
      .slice(0, codeLimit);
    functions.push({
      kind: "function",
      id: symbolId(file.path, symbol.name),
      key: hash("function", file.path, symbol.name, code),
      name: symbol.name,
      body: `The ${symbol.kind} ${symbol.name}:\n${redact(code)}`,
    });
  }
  return functions;
}

const roomFor = (request: Group, round: number) => tokensEach * 2 ** round * request.tasks.length;

function countAnswer(run: Run, answered: Map<string, Explanation>, round: number) {
  if (answered.size > 0) run.failures = 0;
  else if (round === 0 && ++run.failures >= giveUpAfter) run.stopped = en.provider.unreadable;
}

// An empty message would leave run.stopped falsy.
function countFailure(run: Run, error: unknown, round: number) {
  const failure = classifyFailure(error, round);
  if (failure === "refused" || failure === "failed") {
    run.failures++;
    if (failure === "refused" || run.failures >= giveUpAfter)
      run.stopped =
        (error instanceof Error && error.message) ||
        (failure === "refused" ? en.provider.refused : en.provider.failedSilently);
  }
}

const thingsToExplain = ({ graph, structure }: Analysis) =>
  [...graph.files.values()].reduce((n, f) => n + f.symbols.length, 0) +
  graph.files.size +
  structure.areas.reduce((n, a) => n + a.modules.length, 0) +
  structure.areas.length +
  1;

const promptOf = (group: Group) =>
  [group.intro, ...group.tasks.map((t) => `### ${t.name}\n${t.body}`)].join("\n\n");

export class Explainer {
  private readonly current = new Map<string, Explanation>();
  private cancelled = false;

  constructor(
    private readonly provider: Provider,
    private readonly store: ExplanationStore,
    private readonly read: SourceReader,
    private readonly wait: (ms: number) => Promise<void> = sleep,
  ) {}

  cancel() {
    this.cancelled = true;
  }

  get(kind: Explained, id: string): Explanation | undefined {
    return this.current.get(kindId(kind, id));
  }

  // A refused key or repeated failures stop further requests.
  async explain(
    analysis: Analysis,
    project: string,
    onProgress?: (progress: ExplainProgress) => void,
  ): Promise<{ explained: number; stopped?: string }> {
    const run: Run = {
      done: 0,
      total: thingsToExplain(analysis),
      failures: 0,
      stopped: undefined,
      next: new Map(),
      progress: () => onProgress?.({ done: run.done, total: run.total }),
    };
    const size: Size = this.provider.kind === "ollama" ? sizes.ollama : sizes.other;
    for (const level of this.levels(analysis, project, run))
      await this.runLevel(run, level(), size);
    this.dropAllBut(run.next);
    return run.stopped === undefined
      ? { explained: run.next.size }
      : { explained: run.next.size, stopped: run.stopped };
  }

  // Each level reads the one below, so it waits.
  private levels(analysis: Analysis, project: string, run: Run): (() => Group[])[] {
    return [
      () => this.fileGroups(analysis, run),
      () => this.moduleGroups(analysis),
      () => this.areaGroups(analysis, project),
      () => this.systemGroup(analysis, project),
    ];
  }

  private dropAllBut(stillInCode: Map<string, Explanation>) {
    for (const key of [...this.current.keys()]) if (!stillInCode.has(key)) this.current.delete(key);
  }

  private known(kind: Explained, id: string): string {
    return this.get(kind, id)?.simple ?? "";
  }

  private keep(run: Run, task: Task, explanation: Explanation) {
    run.next.set(kindId(task.kind, task.id), explanation);
    this.current.set(kindId(task.kind, task.id), explanation);
  }

  private fileGroups({ graph }: Analysis, run: Run): Group[] {
    const groups: Group[] = [];
    for (const file of graph.files.values()) {
      const source = this.read(file.path) ?? "";
      if (lineCount(source) !== file.lines) {
        this.keepUntilNextRun(run, file);
        continue;
      }
      const functions = functionTasks(file, source.split("\n"), run);
      const uses = file.packages.length > 0 ? ` It uses: ${file.packages.join(", ")}.` : "";
      const listed = this.listed(functions);
      const whole: Task = {
        kind: "file",
        id: file.path,
        key: hash("file", file.path, ...functions.map((f) => f.key), ...file.packages),
        name: file.path,
        body: `The file as a whole.${uses}${listed}`,
      };
      groups.push({
        intro: `Explain the file ${file.path} and each of its functions.`,
        tasks: [whole, ...functions],
      });
    }
    return groups;
  }

  // A file changed since analysis keeps its old explanations.
  private keepUntilNextRun(run: Run, file: FileNode) {
    run.done += file.symbols.length + 1;
    const kept = [
      kindId("file", file.path),
      ...file.symbols.map((symbol) => kindId("function", symbolId(file.path, symbol.name))),
    ];
    for (const key of kept) {
      const had = this.current.get(key);
      if (had) run.next.set(key, had);
    }
  }

  // Explained functions are listed; the rest are asked for below.
  private listed(functions: Task[]): string {
    const parts = functions.map((f) => {
      const was = this.store.get(f.key)?.simple;
      return was ? `- ${f.name}: ${was}` : `- ${f.name}: below`;
    });
    return parts.length > 0 ? ` Its functions:\n${parts.join("\n")}` : "";
  }

  private moduleGroups({ structure }: Analysis): Group[] {
    return structure.areas.map((area) => ({
      intro: `Explain each module of the area ${area.name} from its files.`,
      tasks: area.modules.map((module) => {
        const parts = module.files.map((f) => `- ${f}: ${this.known("file", f)}`);
        return {
          kind: "module" as const,
          id: module.id,
          key: hash("module", module.id, module.name, ...parts),
          name: module.id,
          body: `The module ${module.name}:\n${parts.join("\n")}`,
        };
      }),
    }));
  }

  private areaGroups({ structure }: Analysis, project: string): Group[] {
    return [
      {
        intro: `Explain each area of the app ${project} from its modules.`,
        tasks: structure.areas.map((area) => {
          const parts = area.modules.map((m) => `- ${m.name}: ${this.known("module", m.id)}`);
          return {
            kind: "area" as const,
            id: area.id,
            key: hash("area", area.id, area.name, ...parts),
            name: area.id,
            body: `The area ${area.name}:\n${parts.join("\n")}`,
          };
        }),
      },
    ];
  }

  private systemGroup({ structure }: Analysis, project: string): Group[] {
    const parts = structure.areas.map((a) => `- ${a.name}: ${this.known("area", a.id)}`);
    const services = structure.externals.map((e) => e.name);
    const outside = services.length > 0 ? `\nOutside services: ${services.join(", ")}` : "";
    return [
      {
        intro: `Explain the app ${project} as a whole.`,
        tasks: [
          {
            kind: "system",
            id: project,
            key: hash("system", project, ...parts, ...services),
            name: project,
            body: `The app ${project}, from its areas:\n${parts.join("\n")}${outside}`,
          },
        ],
      },
    ];
  }

  private async runLevel(run: Run, groups: Group[], size: Size): Promise<void> {
    const pending: Group[] = [];
    for (const group of groups) {
      const missing: Task[] = [];
      for (const task of group.tasks) {
        const cached = this.store.get(task.key);
        if (cached) {
          this.keep(run, task, cached);
          run.done++;
        } else missing.push(task);
      }
      if (missing.length > 0) pending.push(...requests({ ...group, tasks: missing }, size));
    }
    run.progress();
    await this.retryRounds(run, pending, size);
  }

  // Capped, so a repository cannot multiply what the user pays.
  private async retryRounds(run: Run, first: Group[], size: Size): Promise<void> {
    let pending = first;
    let budget = pending.length;
    for (let round = 0; pending.length > 0; round++) {
      const again = await this.runRound(run, pending, round);
      const smaller = { ...size, things: Math.max(1, Math.ceil(size.things / 2 ** (round + 1))) };
      const asked = again.flatMap((group) => requests(group, smaller));
      pending = asked.slice(0, budget);
      budget -= pending.length;
      for (const request of asked.slice(pending.length)) run.done += request.tasks.length;
      run.progress();
    }
  }

  private async runRound(run: Run, pending: Group[], round: number): Promise<Group[]> {
    const last = round === retries;
    const again: Group[] = [];
    const wanted = () => !run.stopped && !this.cancelled;
    const leave = (request: Group, tasks: Task[]) => {
      if (tasks.length === 0) return;
      if (last || !wanted()) run.done += tasks.length;
      else again.push({ ...request, tasks });
    };
    let index = 0;
    const worker = async () => {
      while (index < pending.length) {
        const request = pending[index++] as Group;
        if (!wanted()) {
          run.done += request.tasks.length;
          run.progress();
          continue;
        }
        try {
          const answered = readAnswer(
            await this.ask(
              {
                system,
                prompt: promptOf(request),
                maxTokens: roomFor(request, round),
                effort: "fast",
              },
              wanted,
            ),
          );
          countAnswer(run, answered, round);
          const missing: Task[] = [];
          for (const task of request.tasks) {
            const explanation = answered.get(task.name);
            if (!explanation) {
              missing.push(task);
              continue;
            }
            this.store.set(task.key, explanation);
            this.keep(run, task, explanation);
            run.done++;
          }
          leave(request, missing);
        } catch (error) {
          countFailure(run, error, round);
          leave(request, request.tasks);
        }
        run.progress();
      }
    };
    await Promise.all(Array.from({ length: parallel }, worker));
    return again;
  }

  // Busy answers are retried after each pause.
  private async ask(
    completion: Parameters<Provider["complete"]>[0],
    wanted: () => boolean,
  ): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.provider.complete(completion);
      } catch (error) {
        if (!(error instanceof ProviderError && busy.has(error.status ?? 0))) throw error;
        const pause = pauses[attempt];
        if (pause === undefined) throw new Busy(error.message);
        await this.wait(pause);
        if (!wanted()) throw new Busy(error.message);
      }
    }
  }
}
