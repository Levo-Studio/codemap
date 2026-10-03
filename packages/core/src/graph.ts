// SPDX-License-Identifier: Apache-2.0

import { linkId, symbolId } from "./ids.js";
import type { Language } from "./languages.js";
import type { CodeSymbol, FileFacts } from "./parse.js";
import type { Resolver, Target } from "./resolve.js";

export interface FileNode {
  path: string;
  language: Language;
  lines: number;
  symbols: CodeSymbol[];
  directives: string[];
  packages: string[];
}

export interface ImportEdge {
  from: string;
  to: Target;
  names: string[];
}

export type Confidence = "resolved" | "name";

export interface SymbolRef {
  file: string;
  symbol?: string;
}

export interface CallEdge {
  from: SymbolRef;
  to: Required<SymbolRef>;
  confidence: Confidence;
  count: number;
}

export interface PackageCall {
  from: SymbolRef;
  name: string;
  count: number;
}

export interface Graph {
  files: Map<string, FileNode>;
  imports: ImportEdge[];
  calls: CallEdge[];
  packageCalls: PackageCall[];
}

export interface ParsedFile {
  path: string;
  language: Language;
  lines: number;
  facts: FileFacts;
}

const refId = (ref: SymbolRef) => symbolId(ref.file, ref.symbol ?? "");
const directoryOf = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

export function tally<T extends { count: number }>(
  entries: Map<string, T>,
  key: string,
  entry: T,
): void {
  const existing = entries.get(key);
  if (existing) existing.count += entry.count;
  else entries.set(key, entry);
}

function exportedByNameOf(parsed: ParsedFile[]): Map<string, SymbolRef[]> {
  const exportedByName = new Map<string, SymbolRef[]>();
  for (const file of parsed) {
    for (const symbol of file.facts.symbols) {
      if (!symbol.exported) continue;
      const list = exportedByName.get(symbol.name) ?? [];
      list.push({ file: file.path, symbol: symbol.name });
      exportedByName.set(symbol.name, list);
    }
  }
  return exportedByName;
}

// With two candidates, a name match would be a guess.
function uniqueExported(
  exportedByName: Map<string, SymbolRef[]>,
  name: string,
  callerFile: string,
): Required<SymbolRef> | undefined {
  const candidates = (exportedByName.get(name) ?? []).filter((c) => c.file !== callerFile);
  return candidates.length === 1 ? (candidates[0] as Required<SymbolRef>) : undefined;
}

interface ImportScope {
  importedName: Map<string, Required<SymbolRef>>;
  namespaceOf: Map<string, string[]>;
  packageOf: Map<string, string>;
  importedFiles: string[];
}

async function importScope(
  file: ParsedFile,
  files: Map<string, FileNode>,
  resolver: Resolver,
  imports: ImportEdge[],
): Promise<ImportScope> {
  const importedName = new Map<string, Required<SymbolRef>>();
  const namespaceOf = new Map<string, string[]>();
  const packageOf = new Map<string, string>();
  const importedFiles: string[] = [];

  for (const entry of file.facts.imports) {
    const to = await resolver.resolve(file.path, file.language.id, entry.specifier);
    imports.push({ from: file.path, to, names: entry.bindings.map((b) => b.imported) });
    if (to.kind === "file" || to.kind === "directory") {
      const targets =
        to.kind === "file"
          ? [to.path]
          : [...files.keys()].filter((p) => directoryOf(p) === to.path);
      importedFiles.push(...targets);
      for (const { local, imported } of entry.bindings) {
        if (imported === "*" || imported === "default") {
          namespaceOf.set(local, targets);
          continue;
        }
        const target = targets.find((t) => files.get(t)?.symbols.some((s) => s.name === imported));
        if (target) importedName.set(local, { file: target, symbol: imported });
      }
    }
    if (to.kind === "package") {
      for (const { local } of entry.bindings) packageOf.set(local, to.name);
      const node = files.get(file.path);
      if (node && !node.packages.includes(to.name)) node.packages.push(to.name);
    }
  }
  return { importedName, namespaceOf, packageOf, importedFiles };
}

export async function buildGraph(parsed: ParsedFile[], resolver: Resolver): Promise<Graph> {
  const files = new Map<string, FileNode>();
  for (const file of parsed) {
    files.set(file.path, {
      path: file.path,
      language: file.language,
      lines: file.lines,
      symbols: file.facts.symbols,
      directives: file.facts.directives,
      packages: [],
    });
  }

  const exportedByName = exportedByNameOf(parsed);
  const imports: ImportEdge[] = [];
  const calls = new Map<string, CallEdge>();
  const packageCalls = new Map<string, PackageCall>();

  for (const file of parsed) {
    const { importedName, namespaceOf, packageOf, importedFiles } = await importScope(
      file,
      files,
      resolver,
      imports,
    );
    const local = new Set(file.facts.symbols.map((s) => s.name));

    for (const call of file.facts.calls) {
      const from: SymbolRef = { file: file.path, ...(call.caller ? { symbol: call.caller } : {}) };
      let to: Required<SymbolRef> | undefined;
      let confidence: Confidence = "resolved";
      const root = call.receiver?.split(".")[0];

      if (!call.receiver && local.has(call.name)) to = { file: file.path, symbol: call.name };
      else if (!call.receiver && importedName.has(call.name)) to = importedName.get(call.name);
      else if (root && namespaceOf.has(root)) {
        const target = namespaceOf
          .get(root)
          ?.find((t) => files.get(t)?.symbols.some((s) => s.name === call.name));
        if (target) to = { file: target, symbol: call.name };
      } else if ((root && packageOf.has(root)) || (!call.receiver && packageOf.has(call.name))) {
        // stripe.x.create() and new Stripe() both reach the package.
        const name = packageOf.get(root ?? call.name) as string;
        tally(packageCalls, linkId(refId(from), name), { from, name, count: 1 });
        continue;
      } else if (!call.receiver) {
        const unique = uniqueExported(exportedByName, call.name, file.path);
        if (unique) {
          to = unique;
          confidence = importedFiles.includes(to.file) ? "resolved" : "name";
        }
      }
      if (!to || (to.file === from.file && to.symbol === from.symbol)) continue;

      tally(calls, linkId(refId(from), refId(to)), { from, to, confidence, count: 1 });
    }
  }

  return { files, imports, calls: [...calls.values()], packageCalls: [...packageCalls.values()] };
}
