// SPDX-License-Identifier: Apache-2.0

import type { Analysis } from "./analyse.js";
import { live, shown } from "./design.js";
import { areaName, baseName, moduleName, symbolId } from "./panels.js";
import type { Session } from "./session.js";
import { en } from "./strings/en.js";
import type { PaletteRow, PaletteView } from "./view.js";

// The command palette (S9): functions, then modules and files, whose names
// contain what was typed, each saying where it is and which nodes open for it
// to be on the map; and the question the Ask group offers for it. Names that start
// with it come first, then the shorter ones.

function split(name: string, query: string) {
  const at = name.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return undefined;
  return {
    before: name.slice(0, at),
    match: name.slice(at, at + query.length),
    after: name.slice(at + query.length),
  };
}

const order = (a: PaletteRow, b: PaletteRow) =>
  Number(b.before === "") - Number(a.before === "") ||
  a.before.length +
    a.match.length +
    a.after.length -
    (b.before.length + b.match.length + b.after.length);

export function search(analysis: Analysis, query: string, session?: Session): PaletteView {
  const typed = query.trim();
  if (typed === "") return { query, functions: [], modulesAndFiles: [], ask: [] };
  const { graph, structure } = analysis;
  const around = (path: string) =>
    [structure.areaOf.get(path), structure.moduleOf.get(path)].filter(
      (id): id is string => id !== undefined,
    );
  // The file being written, looked up once: the session sorts every change
  // to find it, which would be done again for every row found.
  const latest = session?.files()[0];
  const writing =
    latest && Date.now() - latest.last < live.editingSeconds * 1000 ? latest.path : undefined;
  const editing = (path: string) => path === writing;

  const functions: PaletteRow[] = [];
  for (const file of graph.files.values())
    for (const symbol of file.symbols) {
      const parts = split(symbol.name, typed);
      if (!parts) continue;
      functions.push({
        id: `function:${symbolId(file.path, symbol.name)}`,
        kind: "function",
        ...parts,
        location: [areaName(analysis, structure.areaOf.get(file.path)), baseName(file.path)].join(
          en.meta.path,
        ),
        reveal: [...around(file.path), file.path],
        select: symbolId(file.path, symbol.name),
        ...(editing(file.path) ? { editing: true } : {}),
      });
    }

  const modulesAndFiles: PaletteRow[] = [];
  for (const area of structure.areas)
    for (const module of area.modules) {
      const parts = split(module.name, typed);
      if (parts)
        modulesAndFiles.push({
          id: `module:${module.id}`,
          kind: "module",
          ...parts,
          location: [area.name, en.meta.files(module.files.length)].join(en.meta.separator),
          reveal: [area.id],
          select: module.id,
        });
      for (const path of module.files) {
        const file = split(baseName(path), typed);
        if (!file) continue;
        modulesAndFiles.push({
          id: `file:${path}`,
          kind: "file",
          ...file,
          location: [area.name, moduleName(analysis, module.id)].join(en.meta.path),
          reveal: around(path),
          select: path,
          ...(editing(path) ? { editing: true } : {}),
        });
      }
    }

  return {
    query,
    functions: functions.sort(order).slice(0, shown.paletteRows),
    modulesAndFiles: modulesAndFiles.sort(order).slice(0, shown.paletteRows),
    ask: [{ id: "ask", name: en.palette.explainHow(typed) }],
  };
}
