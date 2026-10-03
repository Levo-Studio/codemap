// SPDX-License-Identifier: Apache-2.0

import { containerPadding, containerTitle } from "./design.js";
import { textWidths } from "./design-text.js";
import { type Layout, type LayoutEdge, type LayoutNode, layout } from "./layout.js";
import { extend } from "./stable.js";
import type { MapNode, Point, Rect } from "./view.js";

// Lays out a map with opened nodes. Each level, the top level or the contents
// of one opened node, is laid out with its nodes as closed cards and stored,
// so it stays as the user saw it. Then every opened node grows from where its
// card was to hold its contents, pushing the rest aside.

export interface Box {
  width: number;
  height: number;
}

// What a node shows, before it has a place on the map.
export type Card = Omit<MapNode, "x" | "y" | "width" | "height" | "state">;

// A connection between two nodes, and how many calls it stands for.
export interface Link {
  from: string;
  to: string;
  count: number;
}

// Stores the layouts the user has seen, one for the top level and one for the
// contents of each opened node, so a rebuilt map keeps the layout the user saw
// instead of being laid out again.
export interface LayoutStore {
  get(key: string): Layout | undefined;
  set(key: string, layout: Layout): void;
}

// A node before it is laid out: its card and, when it is opened, its contents
// and its box's title.
export interface Branch {
  node: Card;
  box: Box;
  // The column, for a node on the top level.
  partition?: number;
  inside?: { branches: Branch[]; title: string; meta: string; mono?: boolean };
}

// The map with nothing opened is stored under the system map's key, so a
// layout already stored under that key is extended rather than replaced.
export const closedKey = JSON.stringify({ level: "system" });

// The width of an opened node's title (name and count) plus the padding inside
// its border on both sides; the box is never narrower. A character the fonts
// were not measured for counts as the widest measured one, and at least as
// wide as the font size: a CJK character is about that wide, though an emoji
// may be wider still.
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

// Lays out the nodes of one level, the top level or the contents of one opened
// node, each as its closed card. The layout is stored under the key and
// extended on a live change, so it stays as the user saw it.
export async function arranged(
  drafts: { id: string; box: Box; partition?: number }[],
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

// Grows one node in place to its opened size. Nodes to its right move right by
// as much as it widens, nodes below it in its column move down by as much as
// it grows taller, and everything else stays: opening a node pushes the map
// aside rather than laying it out again.
function grow(rects: Map<string, Rect>, id: string, size: Box) {
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

// One level's layout after its opened nodes grew: each node's place, and the
// routes of connections whose two ends moved by the same amount, shifted with
// them.
interface Grown {
  rects: Map<string, Rect>;
  routes: Map<string, Point[]>;
}

async function grown(
  laidOut: Layout,
  links: Map<string, Link>,
  branches: Branch[],
  size: (branch: Branch) => Promise<Box>,
): Promise<Grown> {
  const rects = new Map([...laidOut.nodes].map(([id, r]) => [id, { ...r }]));
  for (const branch of branches) if (branch.inside) grow(rects, branch.node.id, await size(branch));
  const moved = (id: string) => {
    const was = laidOut.nodes.get(id);
    const now = rects.get(id);
    return was && now ? { x: now.x - was.x, y: now.y - was.y } : undefined;
  };
  const routes = new Map<string, Point[]>();
  for (const [id, points] of laidOut.routes) {
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

// Places everything on a map with opened nodes: the top level laid out like the
// system map, each opened node grown around its contents, which are laid out
// the same way. Also returns, in map coordinates, the routes of connections
// that could stay as they were.
export async function opening(
  // The connections drawn when the given nodes are open.
  linksOf: (open: ReadonlySet<string>) => Map<string, Link>,
  roots: Branch[],
  layouts: LayoutStore | undefined,
): Promise<{ placed: Map<string, Rect>; kept: Map<string, Point[]> }> {
  const insides = new Map<string, Grown>();
  // Lays out an opened node's contents and returns the node's size around
  // them.
  const sized = async (branch: Branch, path: ReadonlySet<string>): Promise<Box> => {
    const inside = branch.inside;
    if (!inside) return branch.box;
    const own = new Set([...path, branch.node.id]);
    const kids = new Set(inside.branches.map((k) => k.node.id));
    const among = new Map([...linksOf(own)].filter(([, l]) => kids.has(l.from) && kids.has(l.to)));
    const laidOut = await arranged(
      inside.branches.map((k) => ({ id: k.node.id, box: k.box })),
      among,
      layouts,
      JSON.stringify({ inside: branch.node.id }),
    );
    const done = await grown(laidOut, among, inside.branches, (kid) => sized(kid, own));
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

  const closedLinks = linksOf(new Set());
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
