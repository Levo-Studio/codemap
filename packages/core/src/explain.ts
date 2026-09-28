// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type { Analysis } from "./analyse.js";
import type { Explanation, ExplanationStore } from "./cache.js";
import type { SourceReader } from "./panels.js";
import type { Provider } from "./providers.js";

// Explanations in plain language, written bottom-up: every function from its
// code, every file from its functions, every module from its files, every
// area from its modules, the system from its areas. Each is kept by the hash
// of everything it was written from, so after a change only what changed is
// explained again, and the levels above it, which read it.

export type Explained = "function" | "file" | "module" | "area" | "system";

export interface ExplainProgress {
  done: number;
  total: number;
}

// How many requests go to the provider at once, and how much of a function's
// code one carries.
const parallel = 4;
const codeLimit = 8000;
const maxTokens = 400;

const system = [
  "You explain code to people who build software with an AI agent but may not read code.",
  'Answer with JSON only: {"simple": "...", "technical": "..."}.',
  "simple: one or two short sentences anyone understands, no jargon, no code.",
  "technical: one or two sentences for a developer; put identifiers, events and values in backticks.",
  "Say what it does and why it matters, not how each line works. Never invent what is not shown.",
].join("\n");

const hash = (...parts: string[]) =>
  createHash("sha256").update(JSON.stringify(parts)).digest("hex");

// The model's answer, read leniently: the first JSON object in it.
export function readAnswer(answer: string): Explanation | undefined {
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const value = JSON.parse(answer.slice(start, end + 1)) as Partial<Explanation>;
    if (typeof value.simple !== "string" || typeof value.technical !== "string") return undefined;
    return { simple: value.simple.trim(), technical: value.technical.trim() };
  } catch {
    return undefined;
  }
}

// One thing to explain: what it is, what it is written from, and the key
// that stands for all of it.
interface Task {
  kind: Explained;
  id: string;
  key: string;
  prompt: string;
}

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
  // it is now, level by level. A request that fails leaves that one
  // unexplained, and the levels above are written from what there is.
  async explain(
    analysis: Analysis,
    project: string,
    onProgress?: (progress: ExplainProgress) => void,
  ): Promise<void> {
    const { graph, structure } = analysis;
    const levels: Explained[] = ["function", "file", "module", "area", "system"];
    const known = (kind: Explained, id: string) => this.get(kind, id)?.simple ?? "";
    const total =
      [...graph.files.values()].reduce((n, f) => n + f.symbols.length, 0) +
      graph.files.size +
      structure.areas.reduce((n, a) => n + a.modules.length, 0) +
      structure.areas.length +
      1;
    let done = 0;
    const next = new Map<string, Explanation>();

    for (const level of levels) {
      const tasks: Task[] = [];
      if (level === "function")
        for (const file of graph.files.values()) {
          const lines = (this.read(file.path) ?? "").split("\n");
          for (const symbol of file.symbols) {
            const code = lines
              .slice(symbol.startLine - 1, symbol.endLine)
              .join("\n")
              .slice(0, codeLimit);
            tasks.push({
              kind: "function",
              id: `${file.path}#${symbol.name}`,
              key: hash("function", file.path, symbol.name, code),
              prompt: `Explain the ${symbol.kind} ${symbol.name} in ${file.path}:\n\n${code}`,
            });
          }
        }
      if (level === "file")
        for (const file of graph.files.values()) {
          const parts = file.symbols.map(
            (s) => `- ${s.name}: ${known("function", `${file.path}#${s.name}`)}`,
          );
          tasks.push({
            kind: "file",
            id: file.path,
            key: hash("file", file.path, ...parts, ...file.packages),
            prompt: `Explain the file ${file.path} from what its functions do:\n${parts.join("\n")}${file.packages.length > 0 ? `\nIt uses: ${file.packages.join(", ")}` : ""}`,
          });
        }
      if (level === "module")
        for (const area of structure.areas)
          for (const module of area.modules) {
            const parts = module.files.map((f) => `- ${f}: ${known("file", f)}`);
            tasks.push({
              kind: "module",
              id: module.id,
              key: hash("module", module.id, module.name, ...parts),
              prompt: `Explain the module ${module.name} (in ${area.name}) from its files:\n${parts.join("\n")}`,
            });
          }
      if (level === "area")
        for (const area of structure.areas) {
          const parts = area.modules.map((m) => `- ${m.name}: ${known("module", m.id)}`);
          tasks.push({
            kind: "area",
            id: area.id,
            key: hash("area", area.id, area.name, ...parts),
            prompt: `Explain the area ${area.name} of the app from its modules:\n${parts.join("\n")}`,
          });
        }
      if (level === "system") {
        const parts = structure.areas.map((a) => `- ${a.name}: ${known("area", a.id)}`);
        const services = structure.externals.map((e) => e.name);
        tasks.push({
          kind: "system",
          id: project,
          key: hash("system", project, ...parts, ...services),
          prompt: `Explain the app ${project} as a whole from its areas:\n${parts.join("\n")}${services.length > 0 ? `\nOutside services: ${services.join(", ")}` : ""}`,
        });
      }

      let index = 0;
      const worker = async () => {
        while (index < tasks.length) {
          const task = tasks[index++] as Task;
          let explanation = this.store.get(task.key);
          if (!explanation) {
            try {
              explanation = readAnswer(
                await this.provider.complete({
                  system,
                  prompt: task.prompt,
                  maxTokens,
                  effort: "fast",
                }),
              );
            } catch {
              explanation = undefined;
            }
            if (explanation) this.store.set(task.key, explanation);
          }
          if (explanation) {
            next.set(`${task.kind}:${task.id}`, explanation);
            this.current.set(`${task.kind}:${task.id}`, explanation);
          }
          done++;
          onProgress?.({ done, total });
        }
      };
      await Promise.all(Array.from({ length: parallel }, worker));
    }
    // What is gone from the code is gone from the explanations.
    for (const key of [...this.current.keys()]) if (!next.has(key)) this.current.delete(key);
  }
}
