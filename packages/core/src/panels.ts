// SPDX-License-Identifier: Apache-2.0

import type { Analysis } from "./analyse.js";
import type { CodeSymbol } from "./parse.js";
import { en } from "./strings/en.js";
import type { FilePanel, FunctionPanel, ModulePanel, Named, Panel, Relation } from "./view.js";

// The detail panel for one thing on the map: an area, a module, a file or a
// function, with what calls it and what it calls. The map's default panel
// for a place and the panel of a selected node are the same panels.

// Reads a file of the project, for the signature of a function.
export type SourceReader = (path: string) => string | undefined;

export const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export function areaName(analysis: Analysis, id: string | undefined): string {
  return analysis.structure.areas.find((a) => a.id === id)?.name ?? "";
}

export function moduleName(analysis: Analysis, id: string): string {
  for (const area of analysis.structure.areas) {
    const module = area.modules.find((m) => m.id === id);
    if (module) return module.name;
  }
  return id;
}

const relations = (items: Map<string, string>): Relation[] =>
  [...items].map(([id, name]) => ({ id, name }));
const named = (items: Map<string, string>): Named[] =>
  [...items].map(([id, name]) => ({ id, name }));

// Who calls into a group of files and what it calls, each named by how the
// outside is grouped: by module inside the same area, by area elsewhere, and
// the services the group's files use.
function around(
  analysis: Analysis,
  files: ReadonlySet<string>,
  groupOutside: (path: string) => { id: string; name: string } | undefined,
) {
  const calledBy = new Map<string, string>();
  const calls = new Map<string, string>();
  for (const call of analysis.graph.calls) {
    const from = files.has(call.from.file);
    const to = files.has(call.to.file);
    if (!from && to) {
      const group = groupOutside(call.from.file);
      if (group) calledBy.set(group.id, group.name);
    }
    if (from && !to) {
      const group = groupOutside(call.to.file);
      if (group) calls.set(group.id, group.name);
    }
  }
  for (const path of files)
    for (const name of analysis.graph.files.get(path)?.packages ?? []) {
      const external = analysis.structure.externals.find((e) => e.packages.includes(name));
      if (external) calls.set(external.id, external.name);
    }
  return { calledBy, calls };
}

export function areaPanel(analysis: Analysis, areaId: string): ModulePanel | undefined {
  const area = analysis.structure.areas.find((a) => a.id === areaId);
  if (!area) return undefined;
  const { structure } = analysis;
  const { calledBy, calls } = around(analysis, new Set(area.files), (path) => {
    const id = structure.areaOf.get(path);
    return id ? { id, name: areaName(analysis, id) } : undefined;
  });
  return {
    kind: "module",
    eyebrow: [en.topbar.crumbs.system, en.panel.kind.area].join(en.meta.separator),
    name: area.name,
    badges: {},
    explanation: "simple",
    text: "",
    calledBy: relations(calledBy),
    calls: relations(calls),
    recent: [],
  };
}

export function modulePanel(analysis: Analysis, moduleId: string): ModulePanel | undefined {
  const { structure } = analysis;
  const area = structure.areas.find((a) => a.modules.some((m) => m.id === moduleId));
  const module = area?.modules.find((m) => m.id === moduleId);
  if (!area || !module) return undefined;
  const { calledBy, calls } = around(analysis, new Set(module.files), (path) => {
    if (structure.areaOf.get(path) === area.id) {
      const id = structure.moduleOf.get(path);
      return id ? { id, name: moduleName(analysis, id) } : undefined;
    }
    const id = structure.areaOf.get(path);
    return id ? { id, name: areaName(analysis, id) } : undefined;
  });
  return {
    kind: "module",
    eyebrow: [area.name, en.panel.kind.module].join(en.meta.separator),
    name: module.name,
    badges: {},
    explanation: "simple",
    text: "",
    calledBy: relations(calledBy),
    calls: relations(calls),
    recent: [],
  };
}

export const symbolId = (path: string, symbol: string) => `${path}#${symbol}`;

export function filePanel(analysis: Analysis, path: string): FilePanel | undefined {
  const { graph, structure } = analysis;
  const file = graph.files.get(path);
  if (!file) return undefined;
  const calledBy = new Map<string, string>();
  const calls = new Map<string, string>();
  for (const call of graph.calls) {
    if (call.to.file === path && call.from.file !== path)
      calledBy.set(call.from.file, baseName(call.from.file));
    if (call.from.file === path && call.to.file !== path)
      calls.set(call.to.file, baseName(call.to.file));
  }
  return {
    kind: "file",
    eyebrow: [
      [
        areaName(analysis, structure.areaOf.get(path)),
        moduleName(analysis, structure.moduleOf.get(path) ?? ""),
      ].join(en.meta.path),
      en.panel.kind.file,
    ].join(en.meta.separator),
    name: baseName(path),
    meta: [en.meta.lines(file.lines), en.meta.functions(file.symbols.length)].join(
      en.meta.separator,
    ),
    explanation: "simple",
    text: "",
    functions: file.symbols.map((s) => ({ id: symbolId(path, s.name), name: s.name })),
    calledBy: named(calledBy),
    calls: named(calls),
  };
}

// The declaration of a function as written, up to where its body begins:
// what comes before the name is the keyword (export dropped), the rest is
// the name, its parameters and its return type, line by line.
export function signatureOf(
  symbol: CodeSymbol,
  source: string | undefined,
): FunctionPanel["signature"] {
  const fallback = { keyword: "", lines: [symbol.name] };
  if (!source) return fallback;
  const lines = source.split("\n").slice(symbol.startLine - 1, symbol.endLine);
  const header: string[] = [];
  let depth = 0;
  for (const line of lines) {
    let cut = line.length;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === "(" || c === "[" || c === "<") depth++;
      else if (c === ")" || c === "]" || c === ">") depth = Math.max(0, depth - 1);
      else if (depth === 0 && (c === "{" || (c === ":" && /^\s*$/.test(line.slice(i + 1))))) {
        cut = i;
        break;
      }
    }
    header.push(line.slice(0, cut).replace(/\s+$/, ""));
    if (cut < line.length || header.length >= 6) break;
  }
  const first = header[0] ?? "";
  const at = first.search(new RegExp(`\\b${symbol.name.replace(/[$]/g, "\\$")}\\b`));
  if (at < 0) return fallback;
  const keyword = first
    .slice(0, at)
    .replace(/^\s*(export\s+(default\s+)?)?/, "")
    .trim();
  const rest = [` ${first.slice(at)}`, ...header.slice(1)].filter((l) => l.trim() !== "");
  return { keyword, lines: rest };
}

export function functionPanel(
  analysis: Analysis,
  path: string,
  name: string,
  read?: SourceReader,
): FunctionPanel | undefined {
  const symbol = analysis.graph.files.get(path)?.symbols.find((s) => s.name === name);
  if (!symbol) return undefined;
  const calledBy = new Map<string, string>();
  const calls = new Map<string, string>();
  for (const call of analysis.graph.calls) {
    if (call.to.file === path && call.to.symbol === name && call.from.symbol)
      calledBy.set(symbolId(call.from.file, call.from.symbol), call.from.symbol);
    if (call.from.file === path && call.from.symbol === name)
      calls.set(symbolId(call.to.file, call.to.symbol), call.to.symbol);
  }
  return {
    kind: "function",
    eyebrow: [baseName(path), en.panel.kind.function].join(en.meta.separator),
    name,
    explanation: "simple",
    text: [],
    signature: signatureOf(symbol, read?.(path)),
    calledBy: named(calledBy),
    calls: named(calls),
    recent: [],
  };
}

// The panel of a node on a level, its neighbours ("in:", "out:") included.
// Ids alone can be ambiguous, a module and its area may share one, so the
// level says what a node there is: an area on the system map, a module in an
// area and an area beside it, a file in a module and a module or area beside
// it, a function in a file.
export function panelOf(
  analysis: Analysis,
  level: "system" | "area" | "file" | "function",
  nodeId: string,
  read?: SourceReader,
): Panel | undefined {
  const outside = /^(in|out):/.test(nodeId);
  const id = nodeId.replace(/^(in|out):/, "");
  switch (level) {
    case "system":
      return areaPanel(analysis, id);
    case "area":
      return outside ? areaPanel(analysis, id) : modulePanel(analysis, id);
    case "file":
      return outside
        ? (modulePanel(analysis, id) ?? areaPanel(analysis, id))
        : filePanel(analysis, id);
    case "function": {
      const hash = id.lastIndexOf("#");
      return hash > 0
        ? functionPanel(analysis, id.slice(0, hash), id.slice(hash + 1), read)
        : undefined;
    }
  }
}
