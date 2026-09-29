// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { type Analysis, lineCount } from "./analyse.js";
import type { Explanation, ExplanationStore } from "./cache.js";
import type { SourceReader } from "./panels.js";
import { type Provider, ProviderError } from "./providers.js";

// Explanations in plain language, written bottom-up: every function and
// every file from its code, every module from its files, every area from its
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
// code one carries, and how much a request carries in all; how many things
// one request asks for at most, and how long an answer may be for each.
const parallel = 4;
const codeLimit = 8000;
const requestLimit = 24000;
const perRequest = 12;
const tokensEach = 200;
// Failures in a row after which a run sends no more requests.
const giveUpAfter = 5;

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

// The model's answer, read leniently: the first JSON object in it, and in it
// an explanation by name. A name missing or malformed is left out.
export function readAnswer(answer: string): Map<string, Explanation> {
  const found = new Map<string, Explanation>();
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start < 0 || end <= start) return found;
  try {
    const value = JSON.parse(answer.slice(start, end + 1)) as Record<string, unknown>;
    for (const [name, entry] of Object.entries(value)) {
      const explanation = readOne(entry);
      if (explanation) found.set(name, explanation);
    }
  } catch {
    // Not JSON: nothing is explained by it.
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
function requests(group: Group): Group[] {
  const out: Group[] = [];
  let tasks: Task[] = [];
  let size = 0;
  for (const task of group.tasks) {
    if (
      tasks.length > 0 &&
      (tasks.length >= perRequest || size + task.body.length > requestLimit)
    ) {
      out.push({ intro: group.intro, tasks });
      tasks = [];
      size = 0;
    }
    tasks.push(task);
    size += task.body.length;
  }
  if (tasks.length > 0) out.push({ intro: group.intro, tasks });
  return out;
}

const promptOf = (group: Group) =>
  [group.intro, ...group.tasks.map((t) => `### ${t.name}\n${t.body}`)].join("\n\n");

export class Explainer {
  // The explanations of the current analysis, by kind and id.
  private readonly current = new Map<string, Explanation>();

  constructor(
    private readonly provider: Provider,
    private readonly store: ExplanationStore,
    private readonly read: SourceReader,
  ) {}

  get(kind: Explained, id: string): Explanation | undefined {
    return this.current.get(`${kind}:${id}`);
  }

  // Explains everything in the analysis that has no explanation yet for what
  // it is now, level by level, several at a time. A request that fails leaves
  // what it asked for unexplained, and the levels above are written from what
  // there is. When the provider refuses the key, or fails five times in a
  // row, no more requests go out in this run: what is cached is still used,
  // and the answer says why the rest is missing. Each explanation is there to
  // read as soon as its request is answered.
  async explain(
    analysis: Analysis,
    project: string,
    onProgress?: (progress: ExplainProgress) => void,
  ): Promise<{ stopped?: string }> {
    let failures = 0;
    let stopped: string | undefined;
    const { graph, structure } = analysis;
    const known = (kind: Explained, id: string) => this.get(kind, id)?.simple ?? "";
    const total =
      [...graph.files.values()].reduce((n, f) => n + f.symbols.length, 0) +
      graph.files.size +
      structure.areas.reduce((n, a) => n + a.modules.length, 0) +
      structure.areas.length +
      1;
    let done = 0;
    const next = new Map<string, Explanation>();
    const keep = (task: Task, explanation: Explanation) => {
      next.set(`${task.kind}:${task.id}`, explanation);
      this.current.set(`${task.kind}:${task.id}`, explanation);
    };

    const levels: (() => Group[])[] = [
      // Every file with its functions, from its code.
      () => {
        const groups: Group[] = [];
        for (const file of graph.files.values()) {
          const source = this.read(file.path) ?? "";
          // A file changed again since it was read: it is explained with the
          // next read, from lines that match its functions.
          if (lineCount(source) !== file.lines) {
            done += file.symbols.length + 1;
            continue;
          }
          const lines = source.split("\n");
          const functions: Task[] = [];
          const names = new Set<string>();
          for (const symbol of file.symbols) {
            // Two of one name are one node on the map, and one explanation.
            if (names.has(symbol.name)) {
              done++;
              continue;
            }
            names.add(symbol.name);
            const code = lines
              .slice(symbol.startLine - 1, symbol.endLine)
              .join("\n")
              .slice(0, codeLimit);
            functions.push({
              kind: "function",
              id: `${file.path}#${symbol.name}`,
              key: hash("function", file.path, symbol.name, code),
              name: symbol.name,
              body: `The ${symbol.kind} ${symbol.name}:\n${code}`,
            });
          }
          const uses = file.packages.length > 0 ? ` It uses: ${file.packages.join(", ")}.` : "";
          const whole: Task = {
            kind: "file",
            id: file.path,
            key: hash("file", file.path, ...functions.map((f) => f.key), ...file.packages),
            name: file.path,
            body: `The file as a whole, from its functions${functions.length > 0 ? ` (${functions.map((f) => f.name).join(", ")})` : ""}.${uses}`,
          };
          groups.push({
            intro: `Explain the file ${file.path} and each of its functions.`,
            tasks: [whole, ...functions],
          });
        }
        return groups;
      },
      // Every area's modules, from their files.
      () =>
        structure.areas.map((area) => ({
          intro: `Explain each module of the area ${area.name} from its files.`,
          tasks: area.modules.map((module) => {
            const parts = module.files.map((f) => `- ${f}: ${known("file", f)}`);
            return {
              kind: "module" as const,
              id: module.id,
              key: hash("module", module.id, module.name, ...parts),
              name: module.id,
              body: `The module ${module.name}:\n${parts.join("\n")}`,
            };
          }),
        })),
      // The areas, from their modules.
      () => [
        {
          intro: `Explain each area of the app ${project} from its modules.`,
          tasks: structure.areas.map((area) => {
            const parts = area.modules.map((m) => `- ${m.name}: ${known("module", m.id)}`);
            return {
              kind: "area" as const,
              id: area.id,
              key: hash("area", area.id, area.name, ...parts),
              name: area.id,
              body: `The area ${area.name}:\n${parts.join("\n")}`,
            };
          }),
        },
      ],
      // The system, from its areas.
      () => {
        const parts = structure.areas.map((a) => `- ${a.name}: ${known("area", a.id)}`);
        const services = structure.externals.map((e) => e.name);
        return [
          {
            intro: `Explain the app ${project} as a whole.`,
            tasks: [
              {
                kind: "system",
                id: project,
                key: hash("system", project, ...parts, ...services),
                name: project,
                body: `The app ${project}, from its areas:\n${parts.join("\n")}${services.length > 0 ? `\nOutside services: ${services.join(", ")}` : ""}`,
              },
            ],
          },
        ];
      },
    ];

    for (const level of levels) {
      // What is cached is used at once; the rest is asked for in requests.
      const pending: Group[] = [];
      for (const group of level()) {
        const missing: Task[] = [];
        for (const task of group.tasks) {
          const cached = this.store.get(task.key);
          if (cached) {
            keep(task, cached);
            done++;
          } else missing.push(task);
        }
        if (missing.length > 0) pending.push(...requests({ ...group, tasks: missing }));
      }
      onProgress?.({ done, total });

      let index = 0;
      const worker = async () => {
        while (index < pending.length) {
          const request = pending[index++] as Group;
          if (!stopped) {
            try {
              const answered = readAnswer(
                await this.provider.complete({
                  system,
                  prompt: promptOf(request),
                  maxTokens: tokensEach * request.tasks.length,
                  effort: "fast",
                }),
              );
              failures = 0;
              for (const task of request.tasks) {
                const explanation = answered.get(task.name);
                if (!explanation) continue;
                this.store.set(task.key, explanation);
                keep(task, explanation);
              }
            } catch (error) {
              failures++;
              const refused =
                error instanceof ProviderError && (error.status === 401 || error.status === 403);
              if (refused || failures >= giveUpAfter)
                stopped = error instanceof Error ? error.message : "";
            }
          }
          done += request.tasks.length;
          onProgress?.({ done, total });
        }
      };
      await Promise.all(Array.from({ length: parallel }, worker));
    }
    // What is gone from the code is gone from the explanations.
    for (const key of [...this.current.keys()]) if (!next.has(key)) this.current.delete(key);
    return stopped === undefined ? {} : { stopped };
  }
}
