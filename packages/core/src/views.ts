// SPDX-License-Identifier: Apache-2.0

import type { Analysis } from "./analyse.js";
import { containerPadding, margin, size } from "./design.js";
import type { Explained } from "./explain.js";
import type { FileNode } from "./graph.js";
import { type Layout, type LayoutEdge, type LayoutNode, layout } from "./layout.js";
import {
  areaName,
  areaPanel,
  baseName,
  filePanel,
  moduleName,
  modulePanel,
  panelOf,
  plainText,
  type SourceReader,
  symbolId,
  type Words,
} from "./panels.js";
import { extend } from "./stable.js";
import { en } from "./strings/en.js";
import type { Column } from "./structure.js";
import type {
  ColumnLabel,
  Container,
  MapEdge,
  MapNode,
  MapScreen,
  MapView,
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

// Where the layouts of places the user has seen are kept, so a map that is
// built again extends the one they saw instead of being laid out anew.
export interface LayoutStore {
  get(place: string): Layout | undefined;
  set(place: string, layout: Layout): void;
}

type Placer = (drafts: Draft[], links: Map<string, Link>) => ReturnType<typeof place>;

// Lays the drafts out and turns them into the map's nodes and edges, moved
// past the margin. A layout kept for this place is extended, not replaced.
async function place(drafts: Draft[], links: Map<string, Link>, store?: LayoutStore, key?: string) {
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
  const kept = store && key ? store.get(key) : undefined;
  const result = (kept && extend(kept, nodes, edges)) || (await layout(nodes, edges));
  if (store && key) store.set(key, result);
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

async function systemView(analysis: Analysis, placer: Placer): Promise<MapView> {
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

  const placed = await placer(drafts, links);
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
  placer: Placer,
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
  return placer([...drafts, ...neighbours.values()], links);
}

// ---------------------------------------------------------------- Screen

export interface BuildOptions {
  layouts?: LayoutStore;
  // The node the user selected: it is drawn selected and the panel is its own.
  select?: string;
  // Reads the project's files, for what a panel shows of the code itself.
  read?: SourceReader;
  // The explanations there are, and which of the two the user reads.
  words?: Words;
}

export async function buildMap(
  analysis: Analysis,
  project: Project,
  where: Place,
  options: BuildOptions = {},
): Promise<MapScreen> {
  const screen = await buildPlace(analysis, project, where, options);
  const selected = options.select;
  if (!selected || !screen.map.nodes.some((n) => n.id === selected)) return screen;
  return {
    ...screen,
    map: {
      ...screen.map,
      nodes: screen.map.nodes.map((n) => (n.id === selected ? { ...n, selected: true } : n)),
    },
    panel: panelOf(analysis, where.level, selected, options.read, options.words) ?? screen.panel,
  };
}

async function buildPlace(
  analysis: Analysis,
  project: Project,
  where: Place,
  options: BuildOptions,
): Promise<MapScreen> {
  const { structure, graph } = analysis;
  const placer: Placer = (drafts, links) =>
    place(drafts, links, options.layouts, JSON.stringify(where));
  const topbar = (crumbs: string[], trail: PlaceRef[] = []): TopbarView => ({
    project: project.name,
    crumbs: [en.topbar.crumbs.system, ...crumbs],
    trail: [{ level: "system" }, ...trail],
    status: "live",
    changes: 0,
    changesOpen: false,
  });
  const idle = { kind: "idle" as const };

  if (where.level === "system") {
    const map = await systemView(analysis, placer);
    const panel: Panel = {
      kind: "project",
      name: project.name,
      meta: [
        project.kind,
        en.meta.areas(structure.areas.length),
        en.meta.files(graph.files.size),
      ].join(en.meta.separator),
      explanation: options.words?.mode ?? "simple",
      text: plainText(options.words, "system", project.name),
      activity: [],
      session: [],
      totalChanges: 0,
    };
    return { kind: "map", topbar: topbar([]), map, panel, chat: idle };
  }

  if (where.level === "area") {
    const area = structure.areas.find((a) => a.id === where.area);
    if (!area) throw new Error(`No area ${where.area}`);
    const view = await nestedView(analysis, placer, {
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
    const panel = areaPanel(analysis, area.id, options.words) as Panel;
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
    const view = await nestedView(analysis, placer, {
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
    const panel = modulePanel(analysis, module.id, options.words) as Panel;
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
  const words = options.words;
  const simple = words && {
    get: (kind: Explained, id: string) => words.get(kind, id),
    mode: "simple" as const,
  };
  const areaId = structure.areaOf.get(file.path) ?? "";
  const moduleId = structure.moduleOf.get(file.path) ?? "";
  const drafts: Draft[] = file.symbols.map((s) => ({
    node: {
      id: symbolId(file.path, s.name),
      kind: "function",
      label: s.name,
      meta: en.meta.line(s.startLine),
      // Every function carries its plain-language explanation.
      description: plainText(simple, "function", symbolId(file.path, s.name)),
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
          description: plainText(simple, "function", symbolId(path, symbol)),
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
  const placed = await placer([...drafts, ...neighbours.values()], links);
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
  const panel = filePanel(analysis, file.path, options.words) as Panel;
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
