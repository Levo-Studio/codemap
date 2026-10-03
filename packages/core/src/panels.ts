// SPDX-License-Identifier: Apache-2.0

import type { Analysis } from "./analyse.js";
import type { Explanation } from "./cache.js";
import { shown } from "./design.js";
import type { Explained } from "./explain.js";
import type { CodeSymbol } from "./parse.js";
import { en } from "./strings/en.js";
import type {
  CodeView,
  Explanation as ExplanationMode,
  FilePanel,
  FunctionPanel,
  ModulePanel,
  Named,
  NodeKind,
  Panel,
  Relation,
  RichText,
} from "./view.js";

// The detail panel for one thing on the map: an area, a module, a file or a
// function, with what calls it and what it calls, shown for the selected
// node.

// Reads a file of the project, for the signature of a function and the code
// a panel shows.
export type SourceReader = (path: string) => string | undefined;

// The explanations there are, and which of the two the user reads.
export interface Words {
  get(kind: Explained, id: string): Explanation | undefined;
  mode: ExplanationMode;
}

// Technical text keeps code in backticks, drawn as inline code; the plain
// panels and Simple text show it as words.
export function richText(text: string): RichText {
  return text
    .split(/(`[^`]*`)/)
    .filter((part) => part !== "")
    .map((part) =>
      part.startsWith("`") && part.endsWith("`") ? { code: part.slice(1, -1) } : part,
    );
}

export function plainText(words: Words | undefined, kind: Explained, id: string): string {
  const explanation = words?.get(kind, id);
  if (!explanation) return "";
  return (words?.mode === "technical" ? explanation.technical : explanation.simple).replace(
    /`([^`]*)`/g,
    "$1",
  );
}

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

function areaPanel(analysis: Analysis, areaId: string, words?: Words): ModulePanel | undefined {
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
    explanation: words?.mode ?? "simple",
    text: plainText(words, "area", area.id),
    calledBy: relations(calledBy),
    calls: relations(calls),
    recent: [],
  };
}

function modulePanel(analysis: Analysis, moduleId: string, words?: Words): ModulePanel | undefined {
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
    explanation: words?.mode ?? "simple",
    text: plainText(words, "module", module.id),
    calledBy: relations(calledBy),
    calls: relations(calls),
    recent: [],
  };
}

export const symbolId = (path: string, symbol: string) => `${path}#${symbol}`;

function filePanel(analysis: Analysis, path: string, words?: Words): FilePanel | undefined {
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
    explanation: words?.mode ?? "simple",
    text: plainText(words, "file", path),
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
  // The last character that was not a space: a brace after a colon, a bar
  // or an opening bracket starts a type, not the body.
  let before = "";
  for (const line of lines) {
    let cut = line.length;
    for (let i = 0; i < line.length; i++) {
      const c = line[i] as string;
      const typeBrace = c === "{" && /[:|&,(<[]/.test(before);
      if (c === "(" || c === "[" || c === "<" || typeBrace) depth++;
      else if (c === ")" || c === "]" || c === ">" || (c === "}" && depth > 0))
        depth = Math.max(0, depth - 1);
      else if (depth === 0 && (c === "{" || (c === ":" && /^\s*$/.test(line.slice(i + 1))))) {
        cut = i;
        break;
      }
      if (!/\s/.test(c)) before = c;
    }
    header.push(line.slice(0, cut).replace(/\s+$/, ""));
    if (cut < line.length || header.length >= shown.signatureLines) break;
  }
  const first = header[0] ?? "";
  const name = symbol.name.replace(/[$]/g, "\\$");
  const found = new RegExp(`(^|[^\\w$])${name}(?![\\w$])`).exec(first);
  const at = found ? found.index + (found[1] ?? "").length : -1;
  if (at < 0) return fallback;
  const keyword = first
    .slice(0, at)
    .replace(/^\s*(export\s+(default\s+)?)?/, "")
    .trim();
  const rest = [` ${first.slice(at)}`, ...header.slice(1)].filter((l) => l.trim() !== "");
  return { keyword, lines: rest };
}

function functionPanel(
  analysis: Analysis,
  path: string,
  name: string,
  read?: SourceReader,
  words?: Words,
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
    explanation: words?.mode ?? "simple",
    text: (() => {
      const explanation = words?.get("function", symbolId(path, name));
      if (!explanation) return [];
      return words?.mode === "technical"
        ? richText(explanation.technical)
        : [explanation.simple.replace(/`([^`]*)`/g, "$1")];
    })(),
    signature: signatureOf(symbol, read?.(path)),
    calledBy: named(calledBy),
    calls: named(calls),
    recent: [],
  };
}

// The panel of a node, by what kind of node it is.
export function panelOf(
  analysis: Analysis,
  kind: NodeKind,
  id: string,
  read?: SourceReader,
  words?: Words,
): Panel | undefined {
  switch (kind) {
    case "area":
      return areaPanel(analysis, id, words);
    case "module":
      return modulePanel(analysis, id, words);
    case "file":
      return filePanel(analysis, id, words);
    case "function": {
      const hash = id.lastIndexOf("#");
      return hash > 0
        ? functionPanel(analysis, id.slice(0, hash), id.slice(hash + 1), read, words)
        : undefined;
    }
    case "external":
      return undefined;
  }
}

// The code of a function, or of a whole file, as the project has it now.
// Only a file the analysis knows is read, so nothing else can be asked for.
export function codeOf(
  analysis: Analysis,
  path: string,
  symbol: string | undefined,
  read: SourceReader,
): CodeView | undefined {
  const file = analysis.graph.files.get(path);
  if (!file) return undefined;
  const source = read(path);
  if (source === undefined) return undefined;
  const all = source.replace(/\n$/, "").split("\n");
  const found = symbol ? file.symbols.find((s) => s.name === symbol) : undefined;
  if (symbol && !found) return undefined;
  const from = found ? found.startLine : 1;
  const to = found ? found.endLine : all.length;
  const lines = all.slice(from - 1, Math.min(to, from - 1 + shown.codeLines));
  return { path, startLine: from, lines, cut: to - from + 1 > lines.length };
}
