// SPDX-License-Identifier: Apache-2.0

import type { Analysis } from "./analyse.js";
import type { Explanation } from "./cache.js";
import { shown } from "./design.js";
import type { Explained } from "./explain.js";
import { splitSymbolId, symbolId } from "./ids.js";
import type { CodeSymbol } from "./parse.js";
import { baseName } from "./paths.js";
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
  RichText,
} from "./view.js";

export type SourceReader = (path: string) => string | undefined;

export interface Words {
  get(kind: Explained, id: string): Explanation | undefined;
  mode: ExplanationMode;
}

// Technical text shows backticked code as inline code.
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

const listOf = (items: Map<string, string>): Named[] =>
  [...items].map(([id, name]) => ({ id, name }));

// Outside callers group by module in this area, else area.
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

function groupPanel(
  kind: "area" | "module",
  id: string,
  eyebrow: string,
  name: string,
  { calledBy, calls }: ReturnType<typeof around>,
  words: Words | undefined,
): ModulePanel {
  return {
    kind: "module",
    eyebrow,
    name,
    badges: {},
    explanation: words?.mode ?? "simple",
    text: plainText(words, kind, id),
    calledBy: listOf(calledBy),
    calls: listOf(calls),
    recent: [],
  };
}

function areaPanel(analysis: Analysis, areaId: string, words?: Words): ModulePanel | undefined {
  const area = analysis.structure.areas.find((a) => a.id === areaId);
  if (!area) return undefined;
  const { structure } = analysis;
  const relations = around(analysis, new Set(area.files), (path) => {
    const id = structure.areaOf.get(path);
    return id ? { id, name: areaName(analysis, id) } : undefined;
  });
  return groupPanel(
    "area",
    area.id,
    [en.topbar.crumbs.system, en.panel.kind.area].join(en.meta.separator),
    area.name,
    relations,
    words,
  );
}

function modulePanel(analysis: Analysis, moduleId: string, words?: Words): ModulePanel | undefined {
  const { structure } = analysis;
  const area = structure.areas.find((a) => a.modules.some((m) => m.id === moduleId));
  const module = area?.modules.find((m) => m.id === moduleId);
  if (!area || !module) return undefined;
  const relations = around(analysis, new Set(module.files), (path) => {
    if (structure.areaOf.get(path) === area.id) {
      const id = structure.moduleOf.get(path);
      return id ? { id, name: moduleName(analysis, id) } : undefined;
    }
    const id = structure.areaOf.get(path);
    return id ? { id, name: areaName(analysis, id) } : undefined;
  });
  return groupPanel(
    "module",
    module.id,
    [area.name, en.panel.kind.module].join(en.meta.separator),
    module.name,
    relations,
    words,
  );
}

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
    calledBy: listOf(calledBy),
    calls: listOf(calls),
  };
}

const braceAfterStartsType = (lastNonSpace: string) => /[:|&,(<[]/.test(lastNonSpace);

// The declaration up to its body: keyword, then name, types.
export function signatureOf(
  symbol: CodeSymbol,
  source: string | undefined,
): FunctionPanel["signature"] {
  const fallback = { keyword: "", lines: [symbol.name] };
  if (!source) return fallback;
  const lines = source.split("\n").slice(symbol.startLine - 1, symbol.endLine);
  const header: string[] = [];
  let depth = 0;
  let lastNonSpace = "";
  for (const line of lines) {
    let cut = line.length;
    for (let i = 0; i < line.length; i++) {
      const c = line[i] as string;
      const typeBrace = c === "{" && braceAfterStartsType(lastNonSpace);
      if (c === "(" || c === "[" || c === "<" || typeBrace) depth++;
      else if (c === ")" || c === "]" || c === ">" || (c === "}" && depth > 0))
        depth = Math.max(0, depth - 1);
      else if (depth === 0 && (c === "{" || (c === ":" && /^\s*$/.test(line.slice(i + 1))))) {
        cut = i;
        break;
      }
      if (!/\s/.test(c)) lastNonSpace = c;
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

function functionText(words: Words | undefined, id: string): RichText {
  const explanation = words?.get("function", id);
  if (!explanation) return [];
  return words?.mode === "technical"
    ? richText(explanation.technical)
    : [plainText(words, "function", id)];
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
    text: functionText(words, symbolId(path, name)),
    signature: signatureOf(symbol, read?.(path)),
    calledBy: listOf(calledBy),
    calls: listOf(calls),
    recent: [],
  };
}

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
      const fn = splitSymbolId(id);
      return fn ? functionPanel(analysis, fn.path, fn.symbol, read, words) : undefined;
    }
    case "external":
      return undefined;
  }
}

// Only files the analysis knows are read, never other paths.
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
