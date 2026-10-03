// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Cache, contentHash } from "./cache.js";
import { buildGraph, type Graph, type ParsedFile } from "./graph.js";
import type { LanguageId } from "./languages.js";
import { parse } from "./parse.js";
import { createResolver } from "./resolve.js";
import { defaultIgnoredPaths, type SourceFile, scan } from "./scan.js";
import { type Structure, structure } from "./structure.js";

export type Phase = "scan" | "parse" | "resolve" | "group";

export interface PhaseReport {
  phase: Phase;
  done: boolean;
  count: number;
  total?: number;
  languages?: LanguageId[];
  modules?: number;
  milliseconds: number;
}

export interface Analysis {
  files: SourceFile[];
  parsed: ParsedFile[];
  graph: Graph;
  structure: Structure;
}

interface AnalyseOptions {
  ignoredPaths?: readonly string[];
  onProgress?: (report: PhaseReport) => void;
  read?: (path: string) => Promise<string>;
  cache?: Cache;
  previous?: Analysis;
  changed?: ReadonlySet<string>;
  env?: NodeJS.ProcessEnv;
  repository?: string;
}

// A last line without a newline still counts.
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
    ...(options.env ? { env: options.env } : {}),
    ...(options.repository ? { repository: options.repository } : {}),
  });
  report({ phase: "scan", done: true, count: files.length, milliseconds: clock() - start });

  start = clock();
  const languages: LanguageId[] = [];
  const parsed: ParsedFile[] = [];
  const before = new Map(options.previous?.parsed.map((p) => [p.path, p]));
  for (const file of files) {
    const unchanged = options.changed?.has(file.path) ? undefined : before.get(file.path);
    if (unchanged) {
      if (!languages.includes(file.language.id)) languages.push(file.language.id);
      parsed.push(unchanged);
      continue;
    }
    let source: string;
    try {
      source = await read(file.path);
    } catch {
      continue;
    }
    if (!languages.includes(file.language.id)) languages.push(file.language.id);
    const hash = contentHash(source);
    let facts = options.cache?.facts(file.path, hash);
    if (!facts) {
      facts = await parse(file.language.id, source);
      options.cache?.store(file.path, hash, facts);
    }
    parsed.push({
      ...file,
      lines: lineCount(source),
      facts,
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

  options.cache?.keepOnly(parsed.map((f) => f.path));

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

  return { files, parsed, graph, structure: grouped };
}
