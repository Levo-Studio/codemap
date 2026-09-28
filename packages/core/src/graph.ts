// SPDX-License-Identifier: Apache-2.0

import type { Language } from "./languages.js";
import type { CodeSymbol, FileFacts } from "./parse.js";
import type { Resolver, Target } from "./resolve.js";

// The project as a graph: files with their symbols, what each file imports,
// and which symbol calls which. The map's areas, modules and columns are
// grouped from this; nothing in it knows about the map.

export interface FileNode {
  path: string;
  language: Language;
  lines: number;
  symbols: CodeSymbol[];
  directives: string[];
  // The packages this file imports, by package name.
  packages: string[];
}

export interface ImportEdge {
  from: string;
  to: Target;
  names: string[];
}

// How sure a call edge is. "resolved": the name reaches the callee through an
// import or is defined in the same file. "name": the only exported symbol of
// that name in the project, matched by name alone; the map draws it as
// uncertain.
export type Confidence = "resolved" | "name";

export interface SymbolRef {
  file: string;
  // Absent for code at the top level of a file.
  symbol?: string;
}

export interface CallEdge {
  from: SymbolRef;
  to: Required<SymbolRef>;
  confidence: Confidence;
  // How many calls this edge stands for.
  count: number;
}

// A call into a package the project depends on, as far as it can be told
// from the call's receiver: `stripe.checkout.sessions.create` where `stripe`
// was imported from "stripe".
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

const key = (ref: SymbolRef) => `${ref.file}#${ref.symbol ?? ""}`;
const directoryOf = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

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

  // Exported symbols by name, for calls that can only be matched by name.
  const exportedByName = new Map<string, SymbolRef[]>();
  for (const file of parsed) {
    for (const symbol of file.facts.symbols) {
      if (!symbol.exported) continue;
      const list = exportedByName.get(symbol.name) ?? [];
      list.push({ file: file.path, symbol: symbol.name });
      exportedByName.set(symbol.name, list);
    }
  }

  const imports: ImportEdge[] = [];
  const calls = new Map<string, CallEdge>();
  const packageCalls = new Map<string, PackageCall>();

  for (const file of parsed) {
    // What each local name refers to, from this file's imports: a symbol in
    // another file, a whole file or package directory, or a package.
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
          const target = targets.find((t) =>
            files.get(t)?.symbols.some((s) => s.name === imported),
          );
          if (target) importedName.set(local, { file: target, symbol: imported });
        }
      }
      if (to.kind === "package") {
        for (const { local } of entry.bindings) packageOf.set(local, to.name);
        const node = files.get(file.path);
        if (node && !node.packages.includes(to.name)) node.packages.push(to.name);
      }
    }

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
        // stripe.checkout.sessions.create(…) and new Stripe(…) both reach the package.
        const name = packageOf.get(root ?? call.name) as string;
        const id = `${key(from)}>${name}`;
        const existing = packageCalls.get(id);
        if (existing) existing.count++;
        else packageCalls.set(id, { from, name, count: 1 });
        continue;
      } else if (!call.receiver) {
        // Only a unique exported name counts; two candidates are a guess.
        const candidates = (exportedByName.get(call.name) ?? []).filter(
          (c) => c.file !== file.path,
        );
        if (candidates.length === 1) {
          to = candidates[0] as Required<SymbolRef>;
          confidence = importedFiles.includes(to.file) ? "resolved" : "name";
        }
      }
      if (!to || (to.file === from.file && to.symbol === from.symbol)) continue;

      const id = `${key(from)}>${key(to)}`;
      const existing = calls.get(id);
      if (existing) existing.count++;
      else calls.set(id, { from, to, confidence, count: 1 });
    }
  }

  return { files, imports, calls: [...calls.values()], packageCalls: [...packageCalls.values()] };
}
