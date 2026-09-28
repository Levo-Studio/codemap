// SPDX-License-Identifier: Apache-2.0

import type { Analysis } from "./analyse.js";
import { containerPadding, margin, size } from "./design.js";
import type { FileNode } from "./graph.js";
import { type LayoutEdge, type LayoutNode, layout } from "./layout.js";
import { en } from "./strings/en.js";
import type { Column } from "./structure.js";
import type {
  ColumnLabel,
  Container,
  MapEdge,
  MapNode,
  MapScreen,
  MapView,
  Named,
  NodeKind,
  Panel,
  PlaceRef,
  Rect,
  TopbarView,
} from "./view.js";

// Builds what the interface draws for one place on the map, from the
// analysis: the nodes of that level with their size, the connections between
// them, their layout, the panel and the topbar. The sizes are the design's
// (04 Map Language); where the layout puts things is elk's.

export type Place =
  | { level: "system" }
  | { level: "area"; area: string }
  | { level: "file"; module: string }
  | { level: "function"; file: string };

export interface Project {
  name: string;
  // "Next.js", or the languages when no framework is recognised.
  kind: string;
}

const columns: Column[] = ["entry", "api", "features", "data"];
const columnLabel: Record<Column, string> = {
  entry: en.columns.entry,
  api: en.columns.api,
  features: en.columns.features,
  data: en.columns.dataAndServices,
};

interface Draft {
  node: Omit<MapNode, "x" | "y" | "width" | "height" | "state">;
  box: { width: number; height: number };
  partition: number;
}

interface Link {
  from: string;
  to: string;
  count: number;
}

function addLink(
  links: Map<string, Link>,
  from: string | undefined,
  to: string | undefined,
  count = 1,
) {
  if (!from || !to || from === to) return;
  const id = `${from}>${to}`;
  const link = links.get(id);
  if (link) link.count += count;
  else links.set(id, { from, to, count });
}

// Lays the drafts out and turns them into the map's nodes and edges, moved
// past the margin.
async function place(drafts: Draft[], links: Map<string, Link>) {
  const nodes: LayoutNode[] = drafts.map((d) => ({
    id: d.node.id,
    ...d.box,
    partition: d.partition,
  }));
  const edges: LayoutEdge[] = [...links.entries()].map(([id, l]) => ({
    id,
    from: l.from,
    to: l.to,
  }));
  const result = await layout(nodes, edges);
  const shift = <T extends { x: number; y: number }>(p: T): T => ({
    ...p,
    x: p.x + margin.left,
    y: p.y + margin.top,
  });
  const mapNodes: MapNode[] = drafts.map((d) => {
    const rect = result.nodes.get(d.node.id) ?? { x: 0, y: 0, ...d.box };
    return { ...d.node, state: "default", ...shift(rect) };
  });
  const mapEdges: MapEdge[] = [];
  for (const [id, link] of links) {
    const route = result.routes.get(id);
    if (!route) continue;
    mapEdges.push({
      id,
      from: link.from,
      to: link.to,
      kind: "call",
      points: route.map(shift),
      count: link.count,
    });
  }
  return { nodes: mapNodes, edges: mapEdges };
}

// The leftmost node of each partition names where its column label goes.
function labels(nodes: MapNode[], drafts: Draft[], names: Map<number, string>): ColumnLabel[] {
  const out: ColumnLabel[] = [];
  for (const [partition, label] of names) {
    const xs = drafts
      .filter((d) => d.partition === partition)
      .map((d) => nodes.find((n) => n.id === d.node.id)?.x ?? 0);
    if (xs.length > 0) out.push({ id: `column-${partition}`, label, x: Math.min(...xs) });
  }
  return out;
}

// "Calls into …" over the callers, "… calls" over the callees, where there are any.
function sideLabels(nodes: MapNode[], into: string, out: string): ColumnLabel[] {
  const at = (prefix: string) => nodes.filter((n) => n.id.startsWith(prefix)).map((n) => n.x);
  const callers = at("in:");
  const callees = at("out:");
  return [
    ...(callers.length ? [{ id: "column-in", label: into, x: Math.min(...callers) }] : []),
    ...(callees.length ? [{ id: "column-out", label: out, x: Math.min(...callees) }] : []),
  ];
}

function containerAround(
  nodes: MapNode[],
  ids: Set<string>,
  title: string,
  meta: string,
  mono = false,
): Container | undefined {
  const inside = nodes.filter((n) => ids.has(n.id));
  if (inside.length === 0) return undefined;
  const left = Math.min(...inside.map((n) => n.x));
  const top = Math.min(...inside.map((n) => n.y));
  const right = Math.max(...inside.map((n) => n.x + n.width));
  const bottom = Math.max(...inside.map((n) => n.y + n.height));
  const rect: Rect = {
    x: left - containerPadding.side,
    y: top - containerPadding.top,
    width: right - left + 2 * containerPadding.side,
    height: bottom - top + containerPadding.top + containerPadding.bottom,
  };
  return { ...rect, title, meta, ...(mono ? { mono } : {}) };
}

// Room for the container's title: everything moves down when the container
// would reach above the map's top margin.
function makeRoom(view: { nodes: MapNode[]; edges: MapEdge[]; container?: Container | undefined }) {
  const overflow = view.container ? margin.top - view.container.y : 0;
  if (overflow <= 0) return;
  for (const node of view.nodes) node.y += overflow;
  for (const edge of view.edges) for (const p of edge.points) p.y += overflow;
  if (view.container) view.container.y += overflow;
}

const isRoute = (path: string) =>
  /(^|\/)route\.(ts|js)$/.test(path) || /(^|\/)pages\/api\//.test(path);

function areaMeta(analysis: Analysis, areaId: string): string {
  const area = analysis.structure.areas.find((a) => a.id === areaId);
  if (!area) return "";
  if (area.column === "api") {
    const routes = area.files.filter(isRoute).length;
    if (routes > 0) return en.meta.routes(routes);
  }
  return en.meta.files(area.files.length);
}

// ---------------------------------------------------------------- System

async function systemView(analysis: Analysis): Promise<MapView> {
  const { structure, graph } = analysis;
  const drafts: Draft[] = [];
  for (const area of structure.areas) {
    drafts.push({
      node: {
        id: area.id,
        kind: "area",
        label: area.name,
        meta: areaMeta(analysis, area.id),
        opens: { level: "area", id: area.id },
      },
      box: size.area,
      partition: columns.indexOf(area.column),
    });
  }
  for (const external of structure.externals) {
    drafts.push({
      node: { id: external.id, kind: "external", label: external.name, meta: en.meta.external },
      box: size.external,
      partition: columns.length,
    });
  }

  const links = new Map<string, Link>();
  for (const call of graph.calls) {
    addLink(
      links,
      structure.areaOf.get(call.from.file),
      structure.areaOf.get(call.to.file),
      call.count,
    );
  }
  for (const edge of graph.imports) {
    if (edge.to.kind === "file")
      addLink(links, structure.areaOf.get(edge.from), structure.areaOf.get(edge.to.path), 0);
  }
  for (const file of graph.files.values()) {
    for (const name of file.packages) {
      const external = structure.externals.find((e) => e.packages.includes(name));
      if (external) addLink(links, structure.areaOf.get(file.path), external.id);
    }
  }

  const placed = await place(drafts, links);
  const names = new Map(columns.map((c, i) => [i, columnLabel[c]]));
  return { level: "system", columns: labels(placed.nodes, drafts, names), ...placed };
}

// ---------------------------------------------------------------- Inside a group of files

interface Level {
  // What is inside the container: a node per member, with the files it covers.
  members: {
    id: string;
    label: string;
    meta: string;
    kind: NodeKind;
    box: { width: number; height: number };
    files: string[];
    opens?: PlaceRef;
  }[];
  // How a file outside the container is grouped: by module or area.
  outside: (
    file: FileNode,
  ) => { id: string; label: string; meta: string; opens?: PlaceRef } | undefined;
  inBox: { width: number; height: number };
  outBox: { width: number; height: number };
  outKind: NodeKind;
}

async function nestedView(
  analysis: Analysis,
  level: Level,
): Promise<Omit<MapView, "level" | "columns" | "container">> {
  const { graph, structure } = analysis;
  const memberOf = new Map<string, string>();
  for (const member of level.members)
    for (const file of member.files) memberOf.set(file, member.id);

  const drafts: Draft[] = level.members.map((m) => ({
    node: {
      id: m.id,
      kind: m.kind,
      label: m.label,
      meta: m.meta,
      ...(m.opens ? { opens: m.opens } : {}),
    },
    box: m.box,
    partition: 1,
  }));
  const neighbours = new Map<string, Draft>();
  const links = new Map<string, Link>();
  const neighbour = (file: FileNode, side: "in" | "out") => {
    const group = level.outside(file);
    if (!group) return undefined;
    const id = `${side}:${group.id}`;
    if (!neighbours.has(id)) {
      neighbours.set(id, {
        node: {
          id,
          kind: side === "in" ? "external" : level.outKind,
          label: group.label,
          meta: group.meta,
          ...(group.opens ? { opens: group.opens } : {}),
        },
        box: side === "in" ? level.inBox : level.outBox,
        partition: side === "in" ? 0 : 2,
      });
    }
    return id;
  };

  for (const call of graph.calls) {
    const from = memberOf.get(call.from.file);
    const to = memberOf.get(call.to.file);
    if (from && to) addLink(links, from, to, call.count);
    else if (from && !to)
      addLink(links, from, neighbour(graph.files.get(call.to.file) as FileNode, "out"), call.count);
    else if (!from && to)
      addLink(links, neighbour(graph.files.get(call.from.file) as FileNode, "in"), to, call.count);
  }
  for (const [file, member] of memberOf) {
    for (const name of graph.files.get(file)?.packages ?? []) {
      const external = structure.externals.find((e) => e.packages.includes(name));
      if (!external) continue;
      const id = `out:${external.id}`;
      if (!neighbours.has(id)) {
        neighbours.set(id, {
          node: { id, kind: "external", label: external.name, meta: en.meta.external },
          box: size.service,
          partition: 2,
        });
      }
      addLink(links, member, id);
    }
  }
  return place([...drafts, ...neighbours.values()], links);
}

function moduleName(analysis: Analysis, moduleId: string): string {
  for (const area of analysis.structure.areas) {
    const module = area.modules.find((m) => m.id === moduleId);
    if (module) return module.name;
  }
  return moduleId;
}

function areaName(analysis: Analysis, areaId: string | undefined): string {
  return analysis.structure.areas.find((a) => a.id === areaId)?.name ?? "";
}

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

// ---------------------------------------------------------------- Screen

export async function buildMap(
  analysis: Analysis,
  project: Project,
  where: Place,
): Promise<MapScreen> {
  const { structure, graph } = analysis;
  const topbar = (crumbs: string[], trail: PlaceRef[] = []): TopbarView => ({
    project: project.name,
    crumbs: [en.topbar.crumbs.system, ...crumbs],
    trail: [{ level: "system" }, ...trail],
    status: "live",
    changes: 0,
    changesOpen: false,
  });
  const idle = { kind: "idle" as const };
  const named = (items: Map<string, string>): Named[] =>
    [...items].map(([id, name]) => ({ id, name }));

  if (where.level === "system") {
    const map = await systemView(analysis);
    const panel: Panel = {
      kind: "project",
      name: project.name,
      meta: [
        project.kind,
        en.meta.areas(structure.areas.length),
        en.meta.files(graph.files.size),
      ].join(en.meta.separator),
      explanation: "simple",
      text: "",
      activity: [],
      session: [],
      totalChanges: 0,
    };
    return { kind: "map", topbar: topbar([]), map, panel, chat: idle };
  }

  if (where.level === "area") {
    const area = structure.areas.find((a) => a.id === where.area);
    if (!area) throw new Error(`No area ${where.area}`);
    const view = await nestedView(analysis, {
      members: area.modules.map((m) => ({
        id: m.id,
        label: m.name,
        meta: en.meta.files(m.files.length),
        kind: "module",
        box: size.module,
        files: m.files,
        opens: { level: "file", id: m.id },
      })),
      outside: (file) => {
        const id = structure.areaOf.get(file.path);
        return id
          ? {
              id,
              label: areaName(analysis, id),
              meta: areaMeta(analysis, id),
              opens: { level: "area", id },
            }
          : undefined;
      },
      inBox: size.neighbourIn,
      outBox: size.neighbourOut,
      outKind: "area",
    });
    const ids = new Set(area.modules.map((m) => m.id));
    const container = containerAround(
      view.nodes,
      ids,
      area.name,
      [en.meta.modules(area.modules.length), en.meta.files(area.files.length)].join(
        en.meta.separator,
      ),
    );
    const map: MapView = {
      level: "area",
      columns: [],
      ...view,
      ...(container ? { container } : {}),
    };
    makeRoom(map);
    map.columns = sideLabels(
      map.nodes,
      en.columns.callsInto(area.name),
      en.columns.calls(area.name),
    );
    const calledBy = new Map<string, string>();
    const calls = new Map<string, string>();
    for (const node of map.nodes) {
      if (node.id.startsWith("in:")) calledBy.set(node.id, node.label);
      if (node.id.startsWith("out:")) calls.set(node.id, node.label);
    }
    const panel: Panel = {
      kind: "module",
      eyebrow: [en.topbar.crumbs.system, en.panel.kind.area].join(en.meta.separator),
      name: area.name,
      badges: {},
      explanation: "simple",
      text: "",
      calledBy: [...calledBy].map(([id, name]) => ({ id, name })),
      calls: [...calls].map(([id, name]) => ({ id, name })),
      recent: [],
    };
    return {
      kind: "map",
      topbar: topbar([area.name], [{ level: "area", id: area.id }]),
      map,
      panel,
      chat: idle,
    };
  }

  if (where.level === "file") {
    const areaId = [...structure.moduleOf.entries()].find(([, m]) => m === where.module)?.[0];
    const area = structure.areas.find((a) => a.id === structure.areaOf.get(areaId ?? ""));
    const module = area?.modules.find((m) => m.id === where.module);
    if (!area || !module) throw new Error(`No module ${where.module}`);
    const view = await nestedView(analysis, {
      members: module.files.map((path) => ({
        id: path,
        label: baseName(path),
        meta: en.meta.lines(graph.files.get(path)?.lines ?? 0),
        kind: "file",
        box: size.file,
        files: [path],
        opens: { level: "function", id: path },
      })),
      outside: (file) => {
        const id = structure.moduleOf.get(file.path);
        if (!id) return undefined;
        const inArea = structure.areaOf.get(file.path) === area.id;
        const other = structure.areaOf.get(file.path) ?? id;
        return inArea
          ? { id, label: moduleName(analysis, id), meta: area.name, opens: { level: "file", id } }
          : {
              id: other,
              label: areaName(analysis, other),
              meta: areaMeta(analysis, other),
              opens: { level: "area", id: other },
            };
      },
      inBox: size.fileNeighbourIn,
      outBox: size.fileNeighbourOut,
      outKind: "module",
    });
    const container = containerAround(
      view.nodes,
      new Set(module.files),
      module.name,
      [area.name, en.meta.files(module.files.length)].join(en.meta.separator),
    );
    const map: MapView = {
      level: "file",
      columns: [],
      ...view,
      ...(container ? { container } : {}),
    };
    makeRoom(map);
    map.columns = sideLabels(
      map.nodes,
      en.columns.callsInto(module.name),
      en.columns.calls(module.name),
    );
    const calledBy = new Map<string, string>();
    const calls = new Map<string, string>();
    for (const node of map.nodes) {
      if (node.id.startsWith("in:")) calledBy.set(node.id, node.label);
      if (node.id.startsWith("out:")) calls.set(node.id, node.label);
    }
    const panel: Panel = {
      kind: "module",
      eyebrow: [area.name, en.panel.kind.module].join(en.meta.separator),
      name: module.name,
      badges: {},
      explanation: "simple",
      text: "",
      calledBy: named(calledBy),
      calls: named(calls),
      recent: [],
    };
    return {
      kind: "map",
      topbar: topbar(
        [area.name, module.name],
        [
          { level: "area", id: area.id },
          { level: "file", id: module.id },
        ],
      ),
      map,
      panel,
      chat: idle,
    };
  }

  const file = graph.files.get(where.file);
  if (!file) throw new Error(`No file ${where.file}`);
  const areaId = structure.areaOf.get(file.path) ?? "";
  const moduleId = structure.moduleOf.get(file.path) ?? "";
  const symbolId = (path: string, symbol: string) => `${path}#${symbol}`;
  const drafts: Draft[] = file.symbols.map((s) => ({
    node: {
      id: symbolId(file.path, s.name),
      kind: "function",
      label: s.name,
      meta: en.meta.line(s.startLine),
      description: "",
    },
    box: size.function,
    partition: 1,
  }));
  const own = new Set(drafts.map((d) => d.node.id));
  const neighbours = new Map<string, Draft>();
  const links = new Map<string, Link>();
  const neighbour = (path: string, symbol: string, side: "in" | "out") => {
    const id = `${side}:${symbolId(path, symbol)}`;
    if (!neighbours.has(id)) {
      neighbours.set(id, {
        node: {
          id,
          kind: "function",
          label: symbol,
          meta: baseName(path),
          description: "",
          opens: { level: "function", id: path },
        },
        box: side === "in" ? size.functionNeighbourIn : size.functionNeighbourOut,
        partition: side === "in" ? 0 : 2,
      });
    }
    return id;
  };
  for (const call of graph.calls) {
    const from = call.from.symbol ? symbolId(call.from.file, call.from.symbol) : undefined;
    const to = symbolId(call.to.file, call.to.symbol);
    const fromHere = call.from.file === file.path && from && own.has(from);
    const toHere = call.to.file === file.path && own.has(to);
    if (fromHere && toHere) addLink(links, from, to, call.count);
    else if (fromHere)
      addLink(links, from, neighbour(call.to.file, call.to.symbol, "out"), call.count);
    else if (toHere && call.from.symbol)
      addLink(links, neighbour(call.from.file, call.from.symbol, "in"), to, call.count);
  }
  const placed = await place([...drafts, ...neighbours.values()], links);
  const container = containerAround(
    placed.nodes,
    own,
    baseName(file.path),
    [en.meta.lines(file.lines), en.meta.functions(file.symbols.length)].join(en.meta.separator),
    true,
  );
  const map: MapView = {
    level: "function",
    columns: [],
    ...placed,
    ...(container ? { container } : {}),
  };
  makeRoom(map);
  const calledBy = new Map<string, string>();
  const calls = new Map<string, string>();
  for (const call of graph.calls) {
    if (call.to.file === file.path && call.from.file !== file.path)
      calledBy.set(call.from.file, baseName(call.from.file));
    if (call.from.file === file.path && call.to.file !== file.path)
      calls.set(call.to.file, baseName(call.to.file));
  }
  const panel: Panel = {
    kind: "file",
    eyebrow: [
      [areaName(analysis, areaId), moduleName(analysis, moduleId)].join(en.meta.path),
      en.panel.kind.file,
    ].join(en.meta.separator),
    name: baseName(file.path),
    meta: [en.meta.lines(file.lines), en.meta.functions(file.symbols.length)].join(
      en.meta.separator,
    ),
    explanation: "simple",
    text: "",
    functions: file.symbols.map((s) => ({ id: symbolId(file.path, s.name), name: s.name })),
    calledBy: named(calledBy),
    calls: named(calls),
  };
  return {
    kind: "map",
    topbar: topbar(
      [areaName(analysis, areaId), moduleName(analysis, moduleId), baseName(file.path)],
      [
        { level: "area", id: areaId },
        { level: "file", id: moduleId },
        { level: "function", id: file.path },
      ],
    ),
    map,
    panel,
    chat: idle,
  };
}
