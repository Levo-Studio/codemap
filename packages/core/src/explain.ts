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

// Explanations in plain language, written bottom-up: every function from its
// code, every file with its functions, from their code and what the others
// are known to do, every module from its files, every area from its
// modules, the system from its areas. Each is kept by the hash of everything
// it was written from, so after a change only what changed is explained
// again, and the levels above it, which read it. Several are asked for in one
// request: a file with its functions, an area's modules, the areas together.
// A codebase has thousands of functions, and a request each would take long.

export type Explained = "function" | "file" | "module" | "area" | "system";

export interface ExplainProgress {
  done: number;
  total: number;
}

// How many requests go to the provider at once; how much of a function's
// code one carries; how long an answer may be for each thing asked for.
const parallel = 4;
const codeLimit = 8000;
const tokensEach = 400;
// How many things one request asks for at most, and how much it carries in
// all. A local model has a short context and is slow: it is asked for less.
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
// How many more times what an answer left out, what stayed busy and what a
// failed request asked for is asked for in one run.
const retries = 2;
// A provider that says it is busy (too many requests, or overloaded) is asked
// again after these pauses, longer together than the minute most limits
// count in. With thousands to explain, a limit is reached in the ordinary
// way; still busy after the last, what it asked for is asked again with what
// answers left out, and it is not counted as a failure.
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

// A name as the model may write it back: in backticks, with the "### "
// heading it was asked under, the one around the other, or with spaces
// around it. A "#" with no space after it is part of the name, as in a
// private method.
const unquoted = (text: string) =>
  text
    .trim()
    .replace(/^`(.*)`$/, "$1")
    .trim();
const nameOf = (key: string) => unquoted(unquoted(key).replace(/^#+\s+/, ""));

// The model's answer, read leniently: the first JSON object in it, and in it
// an explanation by name. A name missing or malformed is left out. A name
// written back as asked always wins over one only read as it.
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
    // Not JSON as a whole, an answer cut off at its length for one: each
    // entry that is whole is read on its own.
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

// One thing to explain: what it is, the name it is asked for by, what it is
// written from, and the key that stands for all of it.
interface Task {
  kind: Explained;
  id: string;
  key: string;
  name: string;
  body: string;
}

// Tasks asked for together: those of one file, one area, or the areas.
interface Group {
  intro: string;
  tasks: Task[];
}

// A group in requests of no more than the limits; a task alone over the
// limit is its own request.
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

// One run of explain(): how far it is, why it stopped if it did, and what
// it has for the analysis it explains.
interface Run {
  done: number;
  readonly total: number;
  // Failures in a row, and the reason no more requests go out.
  failures: number;
  stopped: string | undefined;
  readonly next: Map<string, Explanation>;
  progress(): void;
}

// What a failed request says: the provider was still busy; the model gave
// up on what it was asked again (a refusal, or an answer cut off at its
// length, which says nothing of the provider); the key was refused; or the
// request failed another way.
type Failure = "busy" | "givenUp" | "refused" | "failed";

function classifyFailure(error: unknown, round: number): Failure {
  if (error instanceof Busy) return "busy";
  // Told by the client, never by an HTTP error whose body says the same.
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
  // Set once the explanations are no longer wanted: nothing more is asked.
  private cancelled = false;

  constructor(
    private readonly provider: Provider,
    private readonly store: ExplanationStore,
    private readonly read: SourceReader,
    // How a pause before asking again is waited out; the tests do not wait.
    private readonly wait: (ms: number) => Promise<void> = sleep,
  ) {}

  cancel() {
    this.cancelled = true;
  }

  get(kind: Explained, id: string): Explanation | undefined {
    return this.current.get(kindId(kind, id));
  }

  // Explains everything in the analysis that has no explanation yet for what
  // it is now, level by level, several at a time. What an answer left out,
  // what stayed busy and what a failed request asked for is asked for again
  // before the level above; what is still missing then is left unexplained,
  // and the levels above are written from what there is. When the provider
  // refuses the key, or fails five times in a row, no more requests go out
  // in this run: what is cached is still used, and the answer says why the
  // rest is missing. Each explanation is there to read as soon as its
  // request is answered.
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
    // Each level is read when the one below it is written, which it reads.
    const levels: (() => Group[])[] = [
      () => this.fileGroups(analysis, run),
      () => this.moduleGroups(analysis),
      () => this.areaGroups(analysis, project),
      () => this.systemGroup(analysis, project),
    ];
    const size: Size = this.provider.kind === "ollama" ? sizes.ollama : sizes.other;
    for (const level of levels) await this.runLevel(run, level(), size);
    // What is gone from the code is gone from the explanations.
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
      // A file changed again since it was read: it is explained with the
      // next read, from lines that match its functions.
      if (lineCount(source) !== file.lines) {
        run.done += file.symbols.length + 1;
        // What it and its functions still in it had stays until then.
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
        // Two of one name are one node on the map, and one explanation.
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
      // What the functions already explained do; the rest are asked for
      // beside the file, with their code.
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

  // One level: what is cached is used at once; the rest is asked for in
  // requests.
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

    // What an answer left out (a name it did not keep, or the end of an
    // answer a local model cut off), what stayed busy after every pause and
    // what a failed request asked for (the Anthropic client's refusals and
    // cut-off answers among them) is asked for again once the rest of the
    // level is done, before the level above is written from it, in requests
    // halved each round. After the last round it is left for the next run.
    // Each thing is counted once, when it is written or given up.
    // The rounds after the first together send no more requests than it
    // did, so a repository that steers the model to answer only part of
    // each cannot multiply what the user pays for.
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

  // One round of requests, several at a time. Returns what is to be asked
  // for again.
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
                // An answer cut off at its length would be cut off the
                // same way again: each round gives it twice the room.
                maxTokens: tokensEach * 2 ** round * request.tasks.length,
                effort: "fast",
              },
              wanted,
            ),
          );
          // An answer with nothing in it that can be read is a failure,
          // when first asked. Asked again for what one answer left out,
          // the model may refuse that one thing every time; that gives it
          // up, and says nothing about the provider.
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
            // Stopped needs a reason, or it would not stop anything.
            if (failure === "refused" || run.failures >= giveUpAfter)
              run.stopped =
                (error instanceof Error && error.message) ||
                (failure === "refused" ? en.provider.refused : en.provider.failedSilently);
          }
          // Busy, or failed another way: asked again with the rest, unless
          // the run has stopped.
          leave(request, request.tasks);
        }
        run.progress();
      }
    };
    await Promise.all(Array.from({ length: parallel }, worker));
    return again;
  }

  // One request, asked again while the provider says it is busy and the
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
