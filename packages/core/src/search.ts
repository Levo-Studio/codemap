// SPDX-License-Identifier: Apache-2.0

import type { Analysis } from "./analyse.js";
import { shown } from "./design.js";
import { kindId, symbolId } from "./ids.js";
import { areaName, moduleName } from "./panels.js";
import { baseName } from "./paths.js";
import { editingFile, type Session } from "./session.js";
import { en } from "./strings/en.js";
import type { PaletteRow, PaletteView } from "./view.js";

// The command palette: functions, then modules and files, whose names contain
// the typed text. Each row says where it is and which nodes must open to show
// it on the map; the Ask group offers a question about the text. Names that
// start with the text come first, then shorter names.

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
  // Looked up once, because finding the file being edited sorts every change
  // in the session and would otherwise run again for every row.
  const writing = session ? editingFile(session, Date.now())?.path : undefined;
  const editing = (path: string) => path === writing;

  const functions: PaletteRow[] = [];
  for (const file of graph.files.values())
    for (const symbol of file.symbols) {
      const parts = split(symbol.name, typed);
      if (!parts) continue;
      functions.push({
        id: kindId("function", symbolId(file.path, symbol.name)),
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
          id: kindId("module", module.id),
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
          id: kindId("file", path),
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
