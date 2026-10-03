// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { type Analysis, lineCount } from "./analyse.js";
import type { Explanation, ExplanationStore } from "./cache.js";
import { kindId, symbolId } from "./ids.js";
import type { SourceReader } from "./panels.js";
import { jsonObjectIn, type Provider, ProviderError } from "./providers.js";
import { redact } from "./redact.js";
import { en } from "./strings/en.js";
import { seconds } from "./time.js";

// Writes plain-language explanations bottom-up: each file and its functions
// from their code, each module from its files, each area from its modules,
// and the system from its areas. Each explanation is cached by the hash of
// everything it was written from, so after a change only what changed is
// explained again, plus the levels above that read it. One request asks for
// several things (a file with its functions, an area's modules, all areas),
// because a codebase has thousands of functions and one request each would
// take too long.

export type Explained = "function" | "file" | "module" | "area" | "system";

export interface ExplainProgress {
  done: number;
  total: number;
}

// Requests in flight at once, the most characters of one function's code that
// are sent, and the answer tokens allowed per thing asked for.
const parallel = 4;
const codeLimit = 8000;
const tokensEach = 400;
// The most things one request asks for, and the most characters it carries.
// A local model has a short context and is slow, so it is asked for less.
const sizes = {
  ollama: { things: 4, characters: 6000 },
  other: { things: 12, characters: 24000 },
} as const;
interface Size {
  things: number;
  characters: number;
}
// Failures in a row after which a run sends no more requests.
const giveUpAfter = 5;
// How many retry rounds a run gives to things an answer left out, things that
// stayed busy, and things in failed requests.
const retries = 2;
// A provider that reports it is busy (429 too many requests, 529 overloaded)
// is asked again after these pauses, which together last longer than the
// one-minute window most rate limits count in. With thousands of things to
// explain, hitting a limit is ordinary, so a request still busy after the last
// pause goes into the next retry round and does not count as a failure.
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

// The model may write a name back in backticks, with the "### " heading it
// was asked under, both nested either way, or with spaces around it. A "#"
// with no space after it is part of the name, as in a private method.
const unquoted = (text: string) =>
  text
    .trim()
    .replace(/^`(.*)`$/, "$1")
    .trim();
const nameOf = (key: string) => unquoted(unquoted(key).replace(/^#+\s+/, ""));

// Reads the model's answer leniently: the first JSON object in it, with one
// explanation per name. Missing or malformed entries are skipped. An entry
// whose key is exactly the name asked for wins over one whose key matches only
// after the backticks or heading are removed.
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
    // The answer does not parse as a whole, for example because it was cut
    // off at its length limit: each complete entry is read on its own.
    for (const m of answer.matchAll(/"((?:[^"\\]|\\.)*)"\s*:\s*(\{[^{}]*\})/g)) {
      try {
        const explanation = readOne(JSON.parse(m[2] as string));
        if (explanation) add(JSON.parse(`"${m[1]}"`) as string, explanation);
      } catch {
        // This entry is not whole either.
      }
    }
  }
  return found;
}

// One thing to explain: its kind and id, the name it is asked for by, the
// text it is explained from, and the cache key for all of it.
interface Task {
  kind: Explained;
  id: string;
  key: string;
  name: string;
  body: string;
}

// Tasks asked for together: those of one file, of one area, or all areas.
interface Group {
  intro: string;
  tasks: Task[];
}

// Splits a group into requests within the size limits; a single task over the
// limit gets a request of its own.
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

// One run of explain(): its progress, why it stopped if it did, and the
// explanations it has for the analysis.
interface Run {
  done: number;
  readonly total: number;
  // Failures in a row, and the reason no more requests go out.
  failures: number;
  stopped: string | undefined;
  readonly next: Map<string, Explanation>;
  progress(): void;
}

// Why a request failed: the provider was still busy; the model gave up on a
// retried thing (a refusal or an answer cut off at its length, which says
// nothing about the provider); the key was refused; or something else failed.
type Failure = "busy" | "givenUp" | "refused" | "failed";

function classifyFailure(error: unknown, round: number): Failure {
  if (error instanceof Busy) return "busy";
  // Only the client's own errors (no HTTP status) count, never an HTTP error
  // whose body happens to say the same.
  const aboutAnswer =
    error instanceof ProviderError &&
    error.status === undefined &&
    (error.message === en.provider.declined || error.message === en.provider.cutOff);
  if (aboutAnswer && round > 0) return "givenUp";
  const refused = error instanceof ProviderError && (error.status === 401 || error.status === 403);
  return refused ? "refused" : "failed";
}

const promptOf = (group: Group) =>
  [group.intro, ...group.tasks.map((t) => `### ${t.name}\n${t.body}`)].join("\n\n");

export class Explainer {
  // The explanations of the current analysis, by kind and id.
  private readonly current = new Map<string, Explanation>();
  // Set once the explanations are no longer wanted; no more requests go out.
  private cancelled = false;

  constructor(
    private readonly provider: Provider,
    private readonly store: ExplanationStore,
    private readonly read: SourceReader,
    // Waits out the pause before a retry; tests pass one that does not wait.
    private readonly wait: (ms: number) => Promise<void> = sleep,
  ) {}

  cancel() {
    this.cancelled = true;
  }

  get(kind: Explained, id: string): Explanation | undefined {
    return this.current.get(kindId(kind, id));
  }

  // Explains everything in the analysis whose explanation is missing or out
  // of date, level by level, several requests at a time. Things an answer
  // left out, things that stayed busy and things in failed requests are
  // retried before the level above; whatever is still missing then stays
  // unexplained, and the levels above are written from what exists. When the
  // provider refuses the key or fails giveUpAfter times in a row, no more
  // requests go out in this run: cached explanations are still used, and the
  // result says why the rest is missing. Each explanation can be read as soon
  // as its request is answered.
  async explain(
    analysis: Analysis,
    project: string,
    onProgress?: (progress: ExplainProgress) => void,
  ): Promise<{ explained: number; stopped?: string }> {
    const { graph, structure } = analysis;
    const run: Run = {
      done: 0,
      total:
        [...graph.files.values()].reduce((n, f) => n + f.symbols.length, 0) +
        graph.files.size +
        structure.areas.reduce((n, a) => n + a.modules.length, 0) +
        structure.areas.length +
        1,
      failures: 0,
      stopped: undefined,
      next: new Map(),
      progress: () => onProgress?.({ done: run.done, total: run.total }),
    };
    // Each level's groups are built only after the level below is written,
    // because they read its explanations.
    const levels: (() => Group[])[] = [
      () => this.fileGroups(analysis, run),
      () => this.moduleGroups(analysis),
      () => this.areaGroups(analysis, project),
      () => this.systemGroup(analysis, project),
    ];
    const size: Size = this.provider.kind === "ollama" ? sizes.ollama : sizes.other;
    for (const level of levels) await this.runLevel(run, level(), size);
    // Explanations of things no longer in the code are dropped.
    for (const key of [...this.current.keys()]) if (!run.next.has(key)) this.current.delete(key);
    return run.stopped === undefined
      ? { explained: run.next.size }
      : { explained: run.next.size, stopped: run.stopped };
  }

  private known(kind: Explained, id: string): string {
    return this.get(kind, id)?.simple ?? "";
  }

  private keep(run: Run, task: Task, explanation: Explanation) {
    run.next.set(kindId(task.kind, task.id), explanation);
    this.current.set(kindId(task.kind, task.id), explanation);
  }

  // Every file with its functions, from its code.
  private fileGroups({ graph }: Analysis, run: Run): Group[] {
    const groups: Group[] = [];
    for (const file of graph.files.values()) {
      const source = this.read(file.path) ?? "";
      // A file that changed again since it was analysed is explained on the
      // next run, when its lines match its functions again.
      if (lineCount(source) !== file.lines) {
        run.done += file.symbols.length + 1;
        // Until then the file and its functions keep their previous
        // explanations.
        const kept = [
          kindId("file", file.path),
          ...file.symbols.map((symbol) => kindId("function", symbolId(file.path, symbol.name))),
        ];
        for (const key of kept) {
          const had = this.current.get(key);
          if (had) run.next.set(key, had);
        }
        continue;
      }
      const lines = source.split("\n");
      const functions: Task[] = [];
      const names = new Set<string>();
      for (const symbol of file.symbols) {
        // Two symbols of one name are one node on the map, so they get one
        // explanation.
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
      const uses = file.packages.length > 0 ? ` It uses: ${file.packages.join(", ")}.` : "";
      // Functions already explained are listed with their explanation; the
      // rest are marked "below" and asked for in the same request, with their
      // code.
      const parts = functions.map((f) => {
        const was = this.store.get(f.key)?.simple;
        return was ? `- ${f.name}: ${was}` : `- ${f.name}: below`;
      });
      const listed = parts.length > 0 ? ` Its functions:\n${parts.join("\n")}` : "";
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

  // Every area's modules, from their files.
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

  // The areas, from their modules.
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

  // The system, from its areas.
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

  // Explains one level: cached explanations are used at once, the rest are
  // requested.
  private async runLevel(run: Run, groups: Group[], size: Size): Promise<void> {
    let pending: Group[] = [];
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

    // Things an answer left out (a name it skipped, or the end of an answer a
    // local model cut off), things still busy after every pause, and things in
    // failed requests (including the Anthropic client's refusals and cut-off
    // answers) are asked for again once the rest of the level is done, before
    // the level above is written from them. Each round halves the request
    // size; after the last round they are left for the next run. Each thing is
    // counted once, when it is written or given up.
    //
    // All retry rounds together send no more requests than the first round
    // did, so a repository that steers the model to answer only part of each
    // request cannot multiply what the user pays for.
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

  // Sends one round of requests, several at a time, and returns what is to be
  // asked for again.
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
                // An answer cut off at its length would be cut off the same
                // way again, so each round doubles the room.
                maxTokens: tokensEach * 2 ** round * request.tasks.length,
                effort: "fast",
              },
              wanted,
            ),
          );
          // In the first round, an answer with nothing readable counts as a
          // failure. In a retry round, the model may refuse one thing every
          // time; that gives up the thing and says nothing about the
          // provider.
          if (answered.size > 0) run.failures = 0;
          else if (round === 0 && ++run.failures >= giveUpAfter)
            run.stopped = en.provider.unreadable;
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
          const failure = classifyFailure(error, round);
          if (failure === "refused" || failure === "failed") {
            run.failures++;
            // run.stopped must be a non-empty reason: an empty string is
            // falsy and would not stop the run.
            if (failure === "refused" || run.failures >= giveUpAfter)
              run.stopped =
                (error instanceof Error && error.message) ||
                (failure === "refused" ? en.provider.refused : en.provider.failedSilently);
          }
          // Whatever the failure, the request's tasks are retried with the
          // rest, unless the run has stopped or this was the last round.
          leave(request, request.tasks);
        }
        run.progress();
      }
    };
    await Promise.all(Array.from({ length: parallel }, worker));
    return again;
  }

  // Sends one request, retrying while the provider says it is busy and the
  // answer is still wanted.
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
