// SPDX-License-Identifier: Apache-2.0

import type { Analysis } from "./analyse.js";
import { margin, size } from "./design.js";
import type { Explained } from "./explain.js";
import { tally } from "./graph.js";
import { linkId, symbolId } from "./ids.js";
import {
  arranged,
  type Box,
  type Branch,
  type Card,
  closedKey,
  type LayoutStore,
  type Link,
  opening,
} from "./open-layout.js";
import { panelOf, plainText, type SourceReader, type Words } from "./panels.js";
import type { CodeSymbol } from "./parse.js";
import { baseName } from "./paths.js";
import { route } from "./route.js";
import { clear } from "./stable.js";
import { en } from "./strings/en.js";
import type { Column } from "./structure.js";
import type {
  ColumnLabel,
  Level,
  MapEdge,
  MapNode,
  MapScreen,
  MapView,
  NodeKind,
  OpenedNode,
  Panel,
  Point,
  Rect,
} from "./view.js";

// Builds what the interface draws from the analysis: one map of the whole
// system, where opened nodes show their contents in place (an area its
// modules, a module its files, a file its functions), plus the connections
// between whatever is drawn, their layout, the panel and the topbar. Node
// sizes come from the design (04 Map Language); positions come from elk.

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

function addLink(
  links: Map<string, Link>,
  from: string | undefined,
  to: string | undefined,
  count = 1,
) {
  if (!from || !to || from === to) return;
  tally(links, linkId(from, to), { from, to, count });
}

// Layouts start at 0,0; the map starts after its margin.
const pastMargin = <T extends { x: number; y: number }>(p: T): T => ({
  ...p,
  x: p.x + margin.left,
  y: p.y + margin.top,
});

// A node of the map with nothing opened, in its column.
interface Draft {
  node: Card;
  box: Box;
  partition: number;
}

// Lays the drafts out and turns them into the map's nodes and edges, shifted
// by the margin. A layout stored under the key is extended, not replaced.
async function place(
  drafts: Draft[],
  links: Map<string, Link>,
  store: LayoutStore | undefined,
  key: string,
) {
  const result = await arranged(
    drafts.map((d) => ({ id: d.node.id, box: d.box, partition: d.partition })),
    links,
    store,
    key,
  );
  const mapNodes: MapNode[] = drafts.map((d) => {
    const rect = result.nodes.get(d.node.id) ?? { x: 0, y: 0, ...d.box };
    return { ...d.node, state: "default", ...pastMargin(rect) };
  });
  return { nodes: mapNodes, edges: edgesOf(links, result.routes) };
}

// The map's connections along their routes, shifted by the margin.
function edgesOf(links: Map<string, Link>, routes: Map<string, Point[]>): MapEdge[] {
  const edges: MapEdge[] = [];
  for (const [id, link] of links) {
    const points = routes.get(id);
    if (!points) continue;
    edges.push({
      id,
      from: link.from,
      to: link.to,
      kind: "call",
      points: points.map(pastMargin),
      count: link.count,
    });
  }
  return edges;
}

// Each column's label sits at the x of the column's leftmost node.
function labels(placed: { partition: number; x: number }[]): ColumnLabel[] {
  const out: ColumnLabel[] = [];
  for (const [partition, column] of columns.entries()) {
    const xs = placed.filter((p) => p.partition === partition).map((p) => p.x);
    if (xs.length > 0)
      out.push({ id: `column-${partition}`, label: columnLabel[column], x: Math.min(...xs) });
  }
  return out;
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

// The requested nodes that can open: an area; a module in an open area; a file
// with functions in an open module. The rest stay closed.
function openable(analysis: Analysis, asked: ReadonlySet<string>): Set<string> {
  const open = new Set<string>();
  for (const area of analysis.structure.areas) {
    if (!asked.has(area.id)) continue;
    open.add(area.id);
    for (const module of area.modules) {
      if (!asked.has(module.id)) continue;
      open.add(module.id);
      for (const path of module.files)
        if (asked.has(path) && (analysis.graph.files.get(path)?.symbols.length ?? 0) > 0)
          open.add(path);
    }
  }
  return open;
}

function branches(analysis: Analysis, open: ReadonlySet<string>, words?: Words): Branch[] {
  const { structure, graph } = analysis;
  // A function node's description is always the Simple explanation, whatever
  // level the panel shows.
  const simple = words && {
    get: (kind: Explained, id: string) => words.get(kind, id),
    mode: "simple" as const,
  };
  const file = (path: string, parent: string): Branch => {
    const node = graph.files.get(path);
    const symbols = node?.symbols ?? [];
    const card = {
      id: path,
      kind: "file" as const,
      label: baseName(path),
      meta: en.meta.lines(node?.lines ?? 0),
      parent,
      ...(symbols.length > 0 ? { opens: true } : {}),
    };
    if (!open.has(path)) return { node: card, box: size.file };
    // Two functions with the same name in one file share an id, so they are one
    // node, just as every connection to them is one.
    const unique = new Map<string, CodeSymbol>();
    for (const s of symbols) {
      const id = symbolId(path, s.name);
      if (!unique.has(id)) unique.set(id, s);
    }
    return {
      node: card,
      box: size.file,
      inside: {
        branches: [...unique].map(([id, symbol]) => ({
          node: {
            id,
            kind: "function",
            label: symbol.name,
            meta: en.meta.line(symbol.startLine),
            description: plainText(simple, "function", id),
            parent: path,
          },
          box: size.function,
        })),
        title: baseName(path),
        meta: [en.meta.lines(node?.lines ?? 0), en.meta.functions(symbols.length)].join(
          en.meta.separator,
        ),
        mono: true,
      },
    };
  };
  const areas = structure.areas.map((area): Branch => {
    const card = {
      id: area.id,
      kind: "area" as const,
      label: area.name,
      meta: areaMeta(analysis, area.id),
      opens: true,
    };
    const partition = columns.indexOf(area.column);
    if (!open.has(area.id)) return { node: card, box: size.area, partition };
    return {
      node: card,
      box: size.area,
      partition,
      inside: {
        branches: area.modules.map((module): Branch => {
          const moduleCard = {
            id: module.id,
            kind: "module" as const,
            label: module.name,
            meta: en.meta.files(module.files.length),
            parent: area.id,
            opens: true,
          };
          if (!open.has(module.id)) return { node: moduleCard, box: size.module };
          return {
            node: moduleCard,
            box: size.module,
            inside: {
              branches: module.files.map((path) => file(path, module.id)),
              title: module.name,
              meta: [area.name, en.meta.files(module.files.length)].join(en.meta.separator),
            },
          };
        }),
        title: area.name,
        meta: [en.meta.modules(area.modules.length), en.meta.files(area.files.length)].join(
          en.meta.separator,
        ),
      },
    };
  });
  const externals = structure.externals.map(
    (external): Branch => ({
      node: { id: external.id, kind: "external", label: external.name, meta: en.meta.external },
      box: size.external,
      partition: columns.length,
    }),
  );
  return [...areas, ...externals];
}

// The connections between what is drawn: a call, an import or a use of a
// service is drawn between the innermost visible nodes that hold its ends.
// Code of an opened file that lies outside all its functions has no node, so
// its connections are not drawn.
function connections(analysis: Analysis, open: ReadonlySet<string>): Map<string, Link> {
  const { structure, graph } = analysis;
  const visible = (path: string, symbol?: string): string | undefined => {
    const area = structure.areaOf.get(path);
    if (!area || !open.has(area)) return area;
    const module = structure.moduleOf.get(path);
    if (!module || !open.has(module)) return module;
    if (!open.has(path)) return path;
    return symbol && graph.files.get(path)?.symbols.some((s) => s.name === symbol)
      ? symbolId(path, symbol)
      : undefined;
  };
  const links = new Map<string, Link>();
  for (const call of graph.calls)
    addLink(
      links,
      visible(call.from.file, call.from.symbol),
      visible(call.to.file, call.to.symbol),
      call.count,
    );
  for (const edge of graph.imports)
    if (edge.to.kind === "file") addLink(links, visible(edge.from), visible(edge.to.path), 0);
  for (const file of graph.files.values())
    for (const name of file.packages) {
      const external = structure.externals.find((e) => e.packages.includes(name));
      if (external) addLink(links, visible(file.path), external.id);
    }
  return links;
}

// The zoom level the map shows, from how deep the opened nodes reach.
function levelOf(analysis: Analysis, open: ReadonlySet<string>): Level {
  const { graph, structure } = analysis;
  if ([...open].some((id) => graph.files.has(id))) return "function";
  if ([...open].some((id) => structure.areas.every((a) => a.id !== id))) return "file";
  return open.size > 0 ? "area" : "system";
}

async function mapOf(
  analysis: Analysis,
  open: ReadonlySet<string>,
  layouts?: LayoutStore,
  words?: Words,
): Promise<MapView> {
  const roots = branches(analysis, open, words);
  const links = connections(analysis, open);
  const level = levelOf(analysis, open);
  if (open.size === 0) {
    const drafts = roots.map((b) => ({ node: b.node, box: b.box, partition: b.partition ?? 0 }));
    const placed = await place(drafts, links, layouts, closedKey);
    const columnsAt = placed.nodes.map((n, i) => ({
      partition: drafts[i]?.partition ?? 0,
      x: n.x,
    }));
    return { level, columns: labels(columnsAt), ...placed };
  }

  const { placed, kept } = await opening((own) => connections(analysis, own), roots, layouts);
  // A connection keeps its route when its ends moved by the same amount and
  // nothing now blocks it. The rest are routed again around every node and,
  // where possible, around the connections already drawn.
  const obstacles: Rect[] = [];
  const boxes: Rect[] = [];
  const collect = (branch: Branch): void => {
    const r = placed.get(branch.node.id);
    if (!branch.inside) {
      if (r) obstacles.push(r);
      return;
    }
    if (r) boxes.push(r);
    for (const kid of branch.inside.branches) collect(kid);
  };
  for (const root of roots) collect(root);
  const holds = (box: Rect, r: Rect) =>
    r.x >= box.x &&
    r.y >= box.y &&
    r.x + r.width <= box.x + box.width &&
    r.y + r.height <= box.y + box.height;
  const routes = new Map<string, Point[]>();
  const pending: [string, Rect, Rect][] = [];
  for (const [id, link] of links) {
    const from = placed.get(link.from);
    const to = placed.get(link.to);
    if (!from || !to) continue;
    const points = kept.get(id);
    const inWay = (r: Rect) => r !== from && r !== to && !clear(points ?? [], r);
    const crossesBox = (box: Rect) =>
      !holds(box, from) && !holds(box, to) && !clear(points ?? [], box);
    if (points && !obstacles.some(inWay) && !boxes.some(crossesBox)) routes.set(id, points);
    else pending.push([id, from, to]);
  }
  for (const [id, from, to] of pending)
    routes.set(id, route({ from, to, obstacles, routes: [...routes.values()], near: true }));

  const nodes: MapNode[] = [];
  const opened: OpenedNode[] = [];
  const walk = (branch: Branch) => {
    const rect = pastMargin(placed.get(branch.node.id) ?? { x: 0, y: 0, ...branch.box });
    if (!branch.inside) {
      nodes.push({ ...branch.node, state: "default", ...rect });
      return;
    }
    const { title, meta, mono } = branch.inside;
    opened.push({
      id: branch.node.id,
      kind: branch.node.kind,
      ...(branch.node.parent ? { parent: branch.node.parent } : {}),
      title,
      meta,
      ...(mono ? { mono } : {}),
      ...rect,
    });
    for (const inner of branch.inside.branches) walk(inner);
  };
  for (const branch of roots) walk(branch);
  const columnsAt = roots.map((b) => ({
    partition: b.partition ?? 0,
    x: (placed.get(b.node.id)?.x ?? 0) + margin.left,
  }));
  return { level, columns: labels(columnsAt), opened, nodes, edges: edgesOf(links, routes) };
}

interface BuildOptions {
  layouts?: LayoutStore;
  // The selected node is drawn selected, and the panel shows it.
  select?: string;
  // Reads the project's files for the code a panel shows.
  read?: SourceReader;
  // The explanations, and which level the user reads.
  words?: Words;
}

// The node kinds that become crumbs: the area, module and file the selected
// node is in, and the node itself when it is one of them.
const crumbKinds = new Set<NodeKind>(["area", "module", "file"]);

export async function buildMap(
  analysis: Analysis,
  project: Project,
  open: readonly string[],
  options: BuildOptions = {},
): Promise<MapScreen> {
  const { structure, graph } = analysis;
  const map = await mapOf(
    analysis,
    openable(analysis, new Set(open)),
    options.layouts,
    options.words,
  );
  const known = new Map<string, { kind: NodeKind; label: string; parent?: string | undefined }>([
    ...map.nodes.map((n) => [n.id, n] as const),
    ...(map.opened ?? []).map((o) => [o.id, { ...o, label: o.title }] as const),
  ]);
  const selected = options.select && known.has(options.select) ? options.select : undefined;

  const chain: string[] = [];
  const crumbs: string[] = [];
  for (let at = selected; at; at = known.get(at)?.parent) {
    const node = known.get(at);
    if (!node || !crumbKinds.has(node.kind)) continue;
    chain.unshift(at);
    crumbs.unshift(node.label);
  }
  const projectPanel: Panel = {
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
  const kind = selected ? known.get(selected)?.kind : undefined;
  const panel =
    (selected && kind && panelOf(analysis, kind, selected, options.read, options.words)) ||
    projectPanel;
  return {
    kind: "map",
    topbar: {
      project: project.name,
      crumbs: [en.topbar.crumbs.system, ...crumbs],
      trail: [null, ...chain],
      status: "live",
      changes: 0,
      changesOpen: false,
    },
    map: selected
      ? {
          ...map,
          nodes: map.nodes.map((n) => (n.id === selected ? { ...n, selected: true } : n)),
          ...(map.opened
            ? { opened: map.opened.map((o) => (o.id === selected ? { ...o, selected: true } : o)) }
            : {}),
        }
      : map,
    panel,
    chat: { kind: "idle" },
  };
}

// Focuses the map on the selected node: its connections, and those of
// everything opened inside it, are drawn as a path, the nodes they reach stay
// as they are, and the rest is dimmed, so the code can be followed one click
// at a time. It runs after withActivity so the agent's work stays visible: an
// active or new connection keeps its look, and so does a node the agent is
// editing or has just added.
export function withFocus(screen: MapScreen, selected: string): MapScreen {
  const parents = new Map<string, string | undefined>([
    ...screen.map.nodes.map((n) => [n.id, n.parent] as const),
    ...(screen.map.opened ?? []).map((o) => [o.id, o.parent] as const),
  ]);
  if (!parents.has(selected)) return screen;
  const inside = (id: string) => {
    for (let at: string | undefined = id; at; at = parents.get(at))
      if (at === selected) return true;
    return false;
  };
  const touching = (e: MapEdge) => inside(e.from) || inside(e.to);
  const reached = new Set(screen.map.edges.filter(touching).flatMap((e) => [e.from, e.to]));
  const agent = (e: MapEdge) => e.kind === "active" || e.kind === "new";
  return {
    ...screen,
    map: {
      ...screen.map,
      nodes: screen.map.nodes.map((n) =>
        reached.has(n.id) || inside(n.id) || n.state === "editing" || n.state === "new"
          ? n
          : { ...n, dimmed: true },
      ),
      edges: screen.map.edges.map((e) =>
        agent(e)
          ? e
          : touching(e)
            ? { ...e, kind: "path", strong: true }
            : { ...e, kind: "dimmed" },
      ),
    },
  };
}
