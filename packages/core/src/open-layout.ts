// SPDX-License-Identifier: Apache-2.0

import { containerPadding, containerTitle } from "./design.js";
import { textWidths } from "./design-text.js";
import { type Layout, type LayoutEdge, type LayoutNode, layout } from "./layout.js";
import { extend } from "./stable.js";
import type { MapNode, Point, Rect } from "./view.js";

export interface Box {
  width: number;
  height: number;
}

export type Card = Omit<MapNode, "x" | "y" | "width" | "height" | "state">;

export interface Link {
  from: string;
  to: string;
  count: number;
}

export interface LayoutStore {
  get(key: string): Layout | undefined;
  set(key: string, layout: Layout): void;
}

export interface Branch {
  node: Card;
  box: Box;
  partition?: number;
  inside?: { branches: Branch[]; title: string; meta: string; mono?: boolean };
}

export const closedKey = JSON.stringify({ level: "system" });

// Unmeasured characters count as the widest, at least font size.
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

// Stored layouts are extended, so the map stays as seen.
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

// Opening a node pushes the rest aside; nothing else moves.
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

// Lays out each opened node's contents, then grows it.
export async function opening(
  linksDrawnWhenOpen: (opened: ReadonlySet<string>) => Map<string, Link>,
  roots: Branch[],
  layouts: LayoutStore | undefined,
): Promise<{ placed: Map<string, Rect>; kept: Map<string, Point[]> }> {
  const insides = new Map<string, Grown>();
  const layOutContentsAndSize = async (branch: Branch, path: ReadonlySet<string>): Promise<Box> => {
    const inside = branch.inside;
    if (!inside) return branch.box;
    const own = new Set([...path, branch.node.id]);
    const kids = new Set(inside.branches.map((k) => k.node.id));
    const among = new Map(
      [...linksDrawnWhenOpen(own)].filter(([, l]) => kids.has(l.from) && kids.has(l.to)),
    );
    const laidOut = await arranged(
      inside.branches.map((k) => ({ id: k.node.id, box: k.box })),
      among,
      layouts,
      JSON.stringify({ inside: branch.node.id }),
    );
    const done = await grown(laidOut, among, inside.branches, (kid) =>
      layOutContentsAndSize(kid, own),
    );
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

  const closedLinks = linksDrawnWhenOpen(new Set());
  const top = await grown(
    await arranged(
      roots.map((b) => ({ id: b.node.id, box: b.box, partition: b.partition ?? 0 })),
      closedLinks,
      layouts,
      closedKey,
    ),
    closedLinks,
    roots,
    (root) => layOutContentsAndSize(root, new Set()),
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
