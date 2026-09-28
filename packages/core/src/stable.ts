// SPDX-License-Identifier: Apache-2.0

import { spacing } from "./design.js";
import type { Layout, LayoutEdge, LayoutNode } from "./layout.js";
import { route } from "./route.js";
import type { Point, Rect } from "./view.js";

// Extends a layout the user has already seen instead of laying the map out
// anew: existing nodes never move, a new node gets the free place nearest the
// node it is connected to, in the column its role puts it in, and only the
// connections that are new, or that a new node now stands in the way of, are
// routed again. When a new node cannot be placed without moving others, the
// answer is undefined and the map is laid out anew.

// A column: nodes that share their left edge, as elk places them.
interface Lane {
  x: number;
  right: number;
  partition: number;
}

const overlaps = (a: Rect, b: Rect, gapX: number, gapY: number) =>
  a.x < b.x + b.width + gapX &&
  b.x < a.x + a.width + gapX &&
  a.y < b.y + b.height + gapY &&
  b.y < a.y + a.height + gapY;

// Whether a route stays clear of a node it does not start or end at.
function clear(points: Point[], rect: Rect): boolean {
  const c = spacing.edgeToNode - 0.5;
  return points.slice(1).every((p, i) => {
    const q = points[i] as Point;
    const left = Math.min(p.x, q.x);
    const right = Math.max(p.x, q.x);
    const top = Math.min(p.y, q.y);
    const bottom = Math.max(p.y, q.y);
    return (
      right <= rect.x - c ||
      left >= rect.x + rect.width + c ||
      bottom <= rect.y - c ||
      top >= rect.y + rect.height + c
    );
  });
}

export function extend(
  previous: Layout,
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
): Layout | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const placed = new Map<string, Rect>();
  const partitionOf = new Map<string, number>();
  for (const n of nodes) {
    const was = previous.nodes.get(n.id);
    if (!was) continue;
    placed.set(n.id, { x: was.x, y: was.y, width: n.width, height: n.height });
    partitionOf.set(n.id, n.partition);
  }
  const live = edges.filter((e) => byId.has(e.from) && byId.has(e.to) && e.from !== e.to);

  const lanes = (): Lane[] => {
    const byX = new Map<number, Lane>();
    for (const [id, r] of placed) {
      const lane = byX.get(r.x);
      if (lane) lane.right = Math.max(lane.right, r.x + r.width);
      else byX.set(r.x, { x: r.x, right: r.x + r.width, partition: partitionOf.get(id) ?? 0 });
    }
    return [...byX.values()].sort((a, b) => a.x - b.x);
  };

  // New nodes are placed next to one they are connected to, so those whose
  // neighbours are already placed go first.
  let waiting = nodes.filter((n) => !placed.has(n.id));
  while (waiting.length > 0) {
    const ready = waiting.find((n) =>
      live.some(
        (e) => (e.to === n.id && placed.has(e.from)) || (e.from === n.id && placed.has(e.to)),
      ),
    );
    const node = ready ?? (waiting[0] as LayoutNode);
    waiting = waiting.filter((n) => n !== node);
    const callerEdge = live.find((e) => e.to === node.id && placed.has(e.from));
    const calleeEdge = live.find((e) => e.from === node.id && placed.has(e.to));
    const parentId = callerEdge?.from ?? calleeEdge?.to;
    const parent = parentId ? placed.get(parentId) : undefined;

    const all = lanes();
    let lane: Lane | undefined;
    const own = all.filter((l) => l.partition === node.partition);
    if (parent && parentId && partitionOf.get(parentId) === node.partition)
      lane = own.find((l) => l.x === parent.x);
    if (!lane && own.length > 0) {
      const toward = parent?.x ?? 0;
      lane = [...own].sort((a, b) => Math.abs(a.x - toward) - Math.abs(b.x - toward))[0];
    }
    let x: number;
    if (lane) x = lane.x;
    else {
      // A column of its own, between the columns before and after it.
      const before = all.filter((l) => l.partition < node.partition);
      x = before.length > 0 ? Math.max(...before.map((l) => l.right)) + spacing.betweenColumns : 0;
    }
    // Room to the next column to the right; without it nothing can be placed.
    // A column of its own may not start where another role's column is.
    const next = all.find((l) => (lane ? l.x > x : l.x >= x));
    if (next && x + node.width + spacing.betweenColumns > next.x) return undefined;

    const box = { x, width: node.width, height: node.height };
    const target =
      parent && parent.x === x ? parent.y + parent.height + spacing.betweenNodes : (parent?.y ?? 0);
    const others = [...placed.values()];
    // Never above the topmost node of its role: a container drawn around
    // them would grow upward, and the map would be moved down to make room
    // for its title, every node with it.
    const peers = [...placed].filter(([id]) => partitionOf.get(id) === node.partition);
    const top = peers.length > 0 ? Math.min(...peers.map(([, r]) => r.y)) : 0;
    const candidates = [
      target,
      ...others.flatMap((r) => [
        r.y + r.height + spacing.betweenNodes,
        r.y - spacing.betweenNodes - node.height,
      ]),
    ].filter((y) => y >= top);
    const fits = (y: number) =>
      others.every(
        (r) =>
          !overlaps({ ...box, y }, r, spacing.betweenColumns - 0.5, spacing.betweenNodes - 0.5),
      );
    const y = candidates
      .filter(fits)
      .sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || b - a)[0];
    if (y === undefined) return undefined;
    placed.set(node.id, { ...box, y });
    partitionOf.set(node.id, node.partition);
  }

  // Routes: kept where both ends stayed and no new node is in the way. The
  // rest are routed after, around every node and, where there is a way,
  // around every connection already drawn, the kept ones and each new one.
  const fresh = [...placed.keys()].filter((id) => !previous.nodes.has(id));
  const routes = new Map<string, Point[]>();
  const obstacles = [...placed.values()];
  const pending: LayoutEdge[] = [];
  for (const e of live) {
    const kept = previous.routes.get(e.id);
    const endsStayed = previous.nodes.has(e.from) && previous.nodes.has(e.to);
    if (kept && endsStayed && fresh.every((id) => clear(kept, placed.get(id) as Rect)))
      routes.set(e.id, kept);
    else pending.push(e);
  }
  for (const e of pending)
    routes.set(
      e.id,
      route({
        from: placed.get(e.from) as Rect,
        to: placed.get(e.to) as Rect,
        obstacles,
        routes: [...routes.values()],
      }),
    );
  return {
    nodes: placed,
    routes,
    width: Math.max(0, ...obstacles.map((r) => r.x + r.width)),
    height: Math.max(0, ...obstacles.map((r) => r.y + r.height)),
  };
}
