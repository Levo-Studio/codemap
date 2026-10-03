// SPDX-License-Identifier: Apache-2.0

import type { Analysis } from "./analyse.js";
import { live } from "./design.js";
import { kindId, linkId, symbolId } from "./ids.js";
import type { FileFacts } from "./parse.js";
import { seconds } from "./time.js";

export interface FileChange {
  path: string;
  first: number;
  last: number;
  added: boolean;
  removed: boolean;
  symbolsAdded: string[];
  symbolsRemoved: string[];
  symbolsChanged: string[];
  minor: boolean;
}

export interface Arrival {
  kind: "area" | "module" | "service";
  id: string;
  name: string;
  at: number;
}

// Facts without line numbers, so moved lines are not changes.
function shape(facts: FileFacts | undefined): string {
  if (!facts) return "";
  return JSON.stringify(facts, (key, value) =>
    key === "line" || key === "startLine" || key === "endLine" ? undefined : value,
  );
}

function symbolsOf(analysis: Analysis, path: string) {
  const file = analysis.graph.files.get(path);
  const calls = new Map<string, string[]>();
  for (const call of analysis.parsed.find((p) => p.path === path)?.facts.calls ?? [])
    if (call.caller) calls.set(call.caller, [...(calls.get(call.caller) ?? []), call.name]);
  return new Map(
    (file?.symbols ?? []).map((s) => [
      s.name,
      `${s.endLine - s.startLine}:${(calls.get(s.name) ?? []).join(",")}`,
    ]),
  );
}

// A renamed folder may arrive as its name alone.
function changedFiles(paths: readonly string[], before: Analysis, after: Analysis): Set<string> {
  const files = new Set<string>();
  for (const path of paths) {
    files.add(path);
    for (const analysis of [before, after])
      for (const file of analysis.graph.files.keys())
        if (file.startsWith(`${path}/`)) files.add(file);
  }
  return files;
}

export class Session {
  readonly startedAt: number;
  private readonly baseline: {
    files: Set<string>;
    symbols: Set<string>;
    areas: Set<string>;
    modules: Set<string>;
    services: Set<string>;
    fileCalls: Set<string>;
    symbolCalls: Set<string>;
  };
  private readonly changes = new Map<string, FileChange>();
  private readonly arrivals = new Map<string, Arrival>();
  private readonly symbolTimes = new Map<string, { changed: number; added: boolean }>();

  constructor(start: Analysis, startedAt = Date.now()) {
    this.startedAt = startedAt;
    const { graph, structure } = start;
    this.baseline = {
      files: new Set(graph.files.keys()),
      symbols: new Set(
        [...graph.files.values()].flatMap((f) => f.symbols.map((s) => symbolId(f.path, s.name))),
      ),
      areas: new Set(structure.areas.map((a) => a.id)),
      modules: new Set(structure.areas.flatMap((a) => a.modules.map((m) => m.id))),
      services: new Set(structure.externals.map((e) => e.id)),
      fileCalls: new Set(graph.calls.map((c) => linkId(c.from.file, c.to.file))),
      symbolCalls: new Set(
        graph.calls.flatMap((c) =>
          c.from.symbol
            ? [linkId(symbolId(c.from.file, c.from.symbol), symbolId(c.to.file, c.to.symbol))]
            : [],
        ),
      ),
    };
  }

  record(before: Analysis, after: Analysis, paths: readonly string[], at: number): void {
    const facts = (analysis: Analysis, path: string) =>
      analysis.parsed.find((p) => p.path === path)?.facts;
    for (const path of changedFiles(paths, before, after)) {
      const was = before.graph.files.has(path);
      const is = after.graph.files.has(path);
      if (!was && !is) continue;
      const old = symbolsOf(before, path);
      const now = symbolsOf(after, path);
      const added = [...now.keys()].filter((s) => !old.has(s));
      const removed = [...old.keys()].filter((s) => !now.has(s));
      const changed = [...now]
        .filter(([s, sig]) => old.has(s) && old.get(s) !== sig)
        .map(([s]) => s);
      const minor = was && is && shape(facts(before, path)) === shape(facts(after, path));
      const entry = this.changes.get(path);
      const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];
      this.changes.set(path, {
        path,
        first: entry?.first ?? at,
        last: at,
        added: !this.baseline.files.has(path) && is,
        removed: !is && this.baseline.files.has(path),
        symbolsAdded: union(entry?.symbolsAdded ?? [], added).filter((s) => now.has(s)),
        symbolsRemoved: union(entry?.symbolsRemoved ?? [], removed).filter((s) => !now.has(s)),
        symbolsChanged: union(entry?.symbolsChanged ?? [], changed).filter((s) => now.has(s)),
        minor: (entry?.minor ?? true) && minor,
      });
      for (const s of [...added, ...changed])
        this.symbolTimes.set(symbolId(path, s), {
          changed: at,
          added: !this.baseline.symbols.has(symbolId(path, s)),
        });
    }
    // Arrives when something absent at the start is first seen.
    const arrive = (
      kind: Arrival["kind"],
      atStart: Set<string>,
      { id, name }: { id: string; name: string },
    ) => {
      if (!atStart.has(id) && !this.arrivals.has(kindId(kind, id)))
        this.arrivals.set(kindId(kind, id), { kind, id, name, at });
    };
    for (const area of after.structure.areas) {
      arrive("area", this.baseline.areas, area);
      for (const module of area.modules) arrive("module", this.baseline.modules, module);
    }
    for (const external of after.structure.externals)
      arrive("service", this.baseline.services, external);
  }

  files(): FileChange[] {
    return [...this.changes.values()].sort((a, b) => b.last - a.last);
  }

  arrived(): Arrival[] {
    return [...this.arrivals.values()].sort((a, b) => b.at - a.at);
  }

  changeOf(path: string): FileChange | undefined {
    return this.changes.get(path);
  }

  symbol(path: string, name: string) {
    return this.symbolTimes.get(symbolId(path, name));
  }

  arrivalOf(kind: Arrival["kind"], id: string): number | undefined {
    return this.arrivals.get(kindId(kind, id))?.at;
  }

  hadFileCall(from: string, to: string): boolean {
    return this.baseline.fileCalls.has(linkId(from, to));
  }

  hadSymbolCall(from: string, to: string): boolean {
    return this.baseline.symbolCalls.has(linkId(from, to));
  }
}

export function editingFile(session: Session, now: number): FileChange | undefined {
  const first = session.files()[0];
  return first && !first.removed && now - first.last < seconds(live.editingSeconds)
    ? first
    : undefined;
}
