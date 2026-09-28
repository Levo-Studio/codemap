// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildGraph, type Graph, type ParsedFile } from "./graph.js";
import type { LanguageId } from "./languages.js";
import { parse } from "./parse.js";
import { createResolver } from "./resolve.js";
import { defaultIgnoredPaths, type SourceFile, scan } from "./scan.js";
import { type Structure, structure } from "./structure.js";

// The analysis as the terminal shows it: one phase after another, each
// reporting what it has done so far and how long it took.

export type Phase = "scan" | "parse" | "resolve" | "group";

export interface PhaseReport {
  phase: Phase;
  done: boolean;
  // Phase-specific counters: files found, files parsed, links resolved,
  // areas and modules grouped.
  count: number;
  total?: number;
  // The languages seen, for the parse line: "TypeScript, TSX".
  languages?: LanguageId[];
  modules?: number;
  milliseconds: number;
}

export interface Analysis {
  files: SourceFile[];
  graph: Graph;
  structure: Structure;
}

export interface AnalyseOptions {
  ignoredPaths?: readonly string[];
  onProgress?: (report: PhaseReport) => void;
  // Reads a file's contents; the cache replaces it with a lookup.
  read?: (path: string) => Promise<string>;
}

// A file ending in a newline has as many lines as newlines; one without has
// one more.
export function lineCount(source: string): number {
  if (source === "") return 0;
  const breaks = source.split("\n").length - 1;
  return source.endsWith("\n") ? breaks : breaks + 1;
}

export async function analyse(root: string, options: AnalyseOptions = {}): Promise<Analysis> {
  const report = options.onProgress ?? (() => {});
  const read = options.read ?? ((path: string) => readFile(join(root, path), "utf8"));
  const clock = () => performance.now();

  let start = clock();
  const files = await scan(root, options.ignoredPaths ?? defaultIgnoredPaths, {
    onFile: (count) => report({ phase: "scan", done: false, count, milliseconds: clock() - start }),
  });
  report({ phase: "scan", done: true, count: files.length, milliseconds: clock() - start });

  start = clock();
  const languages: LanguageId[] = [];
  const parsed: ParsedFile[] = [];
  for (const file of files) {
    let source: string;
    try {
      source = await read(file.path);
    } catch {
      continue;
    }
    if (!languages.includes(file.language.id)) languages.push(file.language.id);
    parsed.push({
      ...file,
      lines: lineCount(source),
      facts: await parse(file.language.id, source),
    });
    report({
      phase: "parse",
      done: false,
      count: parsed.length,
      total: files.length,
      languages,
      milliseconds: clock() - start,
    });
  }
  report({
    phase: "parse",
    done: true,
    count: parsed.length,
    total: files.length,
    languages,
    milliseconds: clock() - start,
  });

  start = clock();
  const resolver = await createResolver(
    root,
    files.map((f) => f.path),
  );
  const graph = await buildGraph(parsed, resolver);
  const links =
    graph.imports.filter((i) => i.to.kind === "file" || i.to.kind === "directory").length +
    graph.calls.length;
  report({ phase: "resolve", done: true, count: links, milliseconds: clock() - start });

  start = clock();
  const grouped = structure(graph);
  const modules = grouped.areas.reduce((n, a) => n + a.modules.length, 0);
  report({
    phase: "group",
    done: true,
    count: grouped.areas.length,
    modules,
    milliseconds: clock() - start,
  });

  return { files, graph, structure: grouped };
}
