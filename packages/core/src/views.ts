// SPDX-License-Identifier: Apache-2.0

import type { Analysis } from "./analyse.js";
import { containerPadding, containerTitle, margin, size } from "./design.js";
import { textWidths } from "./design-text.js";
import type { Explained } from "./explain.js";
import type { FileNode } from "./graph.js";
import { type Layout, type LayoutEdge, type LayoutNode, layout } from "./layout.js";
import { baseName, panelOf, plainText, type SourceReader, symbolId, type Words } from "./panels.js";
import { route } from "./route.js";
import { clear, extend } from "./stable.js";
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

// Builds what the interface draws, from the analysis: one map of the whole
// system, with the nodes the user opened showing what is inside them in
// place (an area its modules, a module its files, a file its functions),
// the connections between whatever is drawn, their layout, the panel and the
// topbar. The sizes are the design's (04 Map Language); where the layout
// puts things is elk's.

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

// Layouts start at 0,0; the map starts past its margin.
const shift = <T extends { x: number; y: number }>(p: T): T => ({
  ...p,
  x: p.x + margin.left,
  y: p.y + margin.top,
});

// Where the layouts the user has seen are kept, one per set of opened nodes,
// so a map that is built again keeps the one they saw instead of being laid
// out anew.
export interface LayoutStore {
  get(key: string): Layout | undefined;
  set(key: string, layout: Layout): void;
}

// Lays the drafts out and turns them into the map's nodes and edges, moved
// past the margin. A layout kept under the key is extended, not replaced.
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
  const mapNodes: MapNode[] = drafts.map((d) => {
    const rect = result.nodes.get(d.node.id) ?? { x: 0, y: 0, ...d.box };
    return { ...d.node, state: "default", ...shift(rect) };
  });
  return { nodes: mapNodes, edges: edgesOf(links, result.routes) };
}

// The map's connections, each along its route, moved past the margin.
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
      points: points.map(shift),
      count: link.count,
    });
  }
  return edges;
}

// The leftmost node of each column names where its label goes.
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

// ---------------------------------------------------------------- The map

// A node before it is laid out: its card, and once it is opened, what it
// holds and what its box's title says.
interface Branch {
  node: Omit<MapNode, "x" | "y" | "width" | "height" | "state">;
  box: { width: number; height: number };
  // The column, for a node on the top level.
  partition?: number;
  inside?: { branches: Branch[]; title: string; meta: string; mono?: boolean };
}

// The layout of the map with nothing opened keeps the key the system map
// always had, so a layout kept from before is still extended.
const closedKey = JSON.stringify({ level: "system" });

// Which of the nodes asked to be open are: an area; a module in an open
// area; a file with functions in an open module. The rest stay closed.
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
  // Every function carries its plain-language explanation.
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
    // Two functions of one name are one node, as every connection to them is.
    const ids = [...new Set(symbols.map((s) => symbolId(path, s.name)))];
    return {
      node: card,
      box: size.file,
      inside: {
        branches: ids.map((id) => {
          const symbol = symbols.find(
            (s) => symbolId(path, s.name) === id,
          ) as FileNode["symbols"][number];
          return {
            node: {
              id,
              kind: "function",
              label: symbol.name,
              meta: en.meta.line(symbol.startLine),
              description: plainText(simple, "function", id),
              parent: path,
            },
            box: size.function,
          };
        }),
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

// The connections between what is drawn: a call, an import or a service's
// use is drawn between the innermost nodes on the map that hold its ends.
// Code of an opened file that is in none of its functions is no node, and
// what it does is not drawn.
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

// How wide an opened node's title is, its name and its count, with the room
// the box keeps either side inside its border: the box is never narrower. A
// character the fonts were not measured for counts as the widest that was,
// and at least as wide as the text is high: a CJK character is about that,
// though an emoji may be wider still.
function titleWidth(inside: NonNullable<Branch["inside"]>): number {
  const width = (text: string, row: Record<string, number>, size: number) => {
    const unknown = Math.max(size, ...Object.values(row));
    return [...text].reduce((sum, c) => sum + (row[c] ?? unknown), 0);
  };
  return Math.ceil(
    2 * (containerTitle.border + containerTitle.x) +
      (inside.mono
        ? width(inside.title, textWidths.monoTitle, containerTitle.monoSize)
        : width(inside.title, textWidths.title, containerTitle.size)) +
      containerTitle.gap +
      width(inside.meta, textWidths.meta, containerTitle.metaSize),
  );
}

// The layout of nodes side by side in one place, the system's top level or
// what one opened node holds, each as its closed card: kept under the key and
// extended on a live change, as the system map is, so it stays as the user
// saw it.
async function arranged(
  drafts: { id: string; box: { width: number; height: number }; partition?: number }[],
  links: Map<string, Link>,
  layouts: LayoutStore | undefined,
  key: string,
): Promise<Layout> {
  const nodes: LayoutNode[] = drafts.map((d) => ({
    id: d.id,
    ...d.box,
    partition: d.partition ?? 0,
  }));
  const edges: LayoutEdge[] = [...links.entries()].map(([id, l]) => ({
    id,
    from: l.from,
    to: l.to,
  }));
  const kept = layouts?.get(key);
  const result = (kept && extend(kept, nodes, edges)) || (await layout(nodes, edges));
  layouts?.set(key, result);
  return result;
}

// Grows one node where it is to the size it opens to. What lies right of it
// moves right by as much as it widens, what lies below it in its column moves
// down by as much as it grows taller, and everything else stays: opening a
// node pushes the map aside rather than laying it out anew.
function grow(rects: Map<string, Rect>, id: string, size: { width: number; height: number }) {
  const at = rects.get(id);
  if (!at) return;
  const wider = size.width - at.width;
  const taller = size.height - at.height;
  for (const [other, r] of rects) {
    if (other === id) continue;
    if (r.x >= at.x + at.width) r.x += wider;
    else if (r.y >= at.y + at.height && r.x < at.x + at.width && r.x + r.width > at.x)
      r.y += taller;
  }
  at.width = size.width;
  at.height = size.height;
}

// One place's layout after its opened nodes grew: where each node is, and
// the routes of connections whose two ends moved alike, moved with them.
interface Grown {
  rects: Map<string, Rect>;
  routes: Map<string, Point[]>;
}

async function grown(
  layout: Layout,
  links: Map<string, Link>,
  branches: Branch[],
  size: (branch: Branch) => Promise<{ width: number; height: number }>,
): Promise<Grown> {
  const rects = new Map([...layout.nodes].map(([id, r]) => [id, { ...r }]));
  for (const branch of branches) if (branch.inside) grow(rects, branch.node.id, await size(branch));
  const moved = (id: string) => {
    const was = layout.nodes.get(id);
    const now = rects.get(id);
    return was && now ? { x: now.x - was.x, y: now.y - was.y } : undefined;
  };
  const routes = new Map<string, Point[]>();
  for (const [id, points] of layout.routes) {
    const link = links.get(id);
    const a = link && moved(link.from);
    const b = link && moved(link.to);
    if (a && b && a.x === b.x && a.y === b.y)
      routes.set(
        id,
        points.map((p) => ({ x: p.x + a.x, y: p.y + a.y })),
      );
  }
  return { rects, routes };
}

// Where everything on a map with opened nodes is: the top level as the
// system map lays it out, each opened node grown where its card was around
// what it holds, laid out the same way inside it. With it, the routes of
// connections that could stay as they were, in the map's coordinates.
async function opening(
  analysis: Analysis,
  roots: Branch[],
  layouts: LayoutStore | undefined,
): Promise<{ placed: Map<string, Rect>; kept: Map<string, Point[]> }> {
  const insides = new Map<string, Grown>();
  // What an opened node holds, and how large it is around it.
  const sized = async (branch: Branch, path: ReadonlySet<string>) => {
    const inside = branch.inside;
    if (!inside) return branch.box;
    const own = new Set([...path, branch.node.id]);
    const kids = new Set(inside.branches.map((k) => k.node.id));
    const among = new Map(
      [...connections(analysis, own)].filter(([, l]) => kids.has(l.from) && kids.has(l.to)),
    );
    const layout = await arranged(
      inside.branches.map((k) => ({ id: k.node.id, box: k.box })),
      among,
      layouts,
      JSON.stringify({ inside: branch.node.id }),
    );
    const done = await grown(layout, among, inside.branches, (kid) => sized(kid, own));
    const all = [...done.rects.values()];
    const left = Math.min(...all.map((r) => r.x));
    const top = Math.min(...all.map((r) => r.y));
    for (const r of all) {
      r.x -= left;
      r.y -= top;
    }
    for (const points of done.routes.values())
      for (const p of points) {
        p.x -= left;
        p.y -= top;
      }
    insides.set(branch.node.id, done);
    return {
      width: Math.max(
        branch.box.width,
        titleWidth(inside),
        Math.max(...all.map((r) => r.x + r.width)) + 2 * containerPadding.side,
      ),
      height: Math.max(
        branch.box.height,
        Math.max(...all.map((r) => r.y + r.height)) +
          containerPadding.top +
          containerPadding.bottom,
      ),
    };
  };

  const closedLinks = connections(analysis, new Set());
  const top = await grown(
    await arranged(
      roots.map((b) => ({ id: b.node.id, box: b.box, partition: b.partition ?? 0 })),
      closedLinks,
      layouts,
      closedKey,
    ),
    closedLinks,
    roots,
    (root) => sized(root, new Set()),
  );

  const placed = new Map<string, Rect>(top.rects);
  const kept = new Map(top.routes);
  const put = (branch: Branch, at: Rect) => {
    const inner = insides.get(branch.node.id);
    if (!inner) return;
    const x = at.x + containerPadding.side;
    const y = at.y + containerPadding.top;
    for (const [id, points] of inner.routes)
      kept.set(
        id,
        points.map((p) => ({ x: p.x + x, y: p.y + y })),
      );
    for (const kid of branch.inside?.branches ?? []) {
      const r = inner.rects.get(kid.node.id);
      if (!r) continue;
      const kidAt = { ...r, x: x + r.x, y: y + r.y };
      placed.set(kid.node.id, kidAt);
      put(kid, kidAt);
    }
  };
  for (const root of roots) {
    const at = placed.get(root.node.id);
    if (at) put(root, at);
  }
  return { placed, kept };
}

// How deep the opened nodes reach, as the zoom level the map shows.
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

  const { placed, kept } = await opening(analysis, roots, layouts);
  // A connection keeps its route where its ends moved alike and nothing is
  // now in its way; the rest go where the nodes now are, around every node,
  // and around those already drawn where there is a way.
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
    const rect = shift(placed.get(branch.node.id) ?? { x: 0, y: 0, ...branch.box });
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

// The crumbs of a selected node: the area, module and file it is in, and
// itself when it is one of them.
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

// The selected node is followed: its connections, and those of everything
// opened inside it, are drawn as its path, the nodes they reach stay as they
// are, and the rest is dimmed, so the way through the code can be followed
// one click at a time. It runs after the agent's activity is laid on,
// because what the agent does stays in sight: an active or new connection
// keeps its look, and so does a node the agent is editing or has just added.
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
