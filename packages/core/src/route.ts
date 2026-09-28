// SPDX-License-Identifier: Apache-2.0

import { spacing } from "./design.js";
import type { Point, Rect } from "./view.js";

// Routes one connection between nodes that stay where they are. elk lays a map
// out as a whole and moves nodes to do it; after a live change, existing nodes
// keep their place and only the new connections need a way through. The route
// is orthogonal, keeps its distance from every node, and leaves the caller on
// its right border and enters the callee on its left where it can: in call
// direction. Where the callee sits straight below or above, it may leave by the
// bottom or top and arrive the same way, as Jobs under Billing does on the
// system map.

export interface RouteRequest {
  from: Rect;
  to: Rect;
  // Every node on the map, the two ends included.
  obstacles: readonly Rect[];
  // Where on the caller's right and the callee's left border the connection
  // attaches; the middle by default.
  fromY?: number;
  toY?: number;
  // Connections already drawn, which the route should not cross.
  routes?: readonly (readonly Point[])[];
}

// What a route pays for, in pixels of length: a bend, and a port on the top
// or bottom border instead of the side the call direction prefers.
// A vertical stretch off the middle of a gap costs a little more, only to
// choose the design's elbow among routes of the same length.
// Crossing a connection already drawn costs more than any way around it
// within the search, so a route crosses one only where the search finds no
// way around.
const cost = { bend: 40, verticalPort: 120, offMiddle: 0.01, crossing: 5000 } as const;

type Direction = 0 | 1 | 2 | 3; // right, down, left, up
const step: Record<Direction, Point> = {
  0: { x: 1, y: 0 },
  1: { x: 0, y: 1 },
  2: { x: -1, y: 0 },
  3: { x: 0, y: -1 },
};

interface Port {
  at: Point;
  // The direction of travel through the port.
  direction: Direction;
  penalty: number;
}

function ports(rect: Rect, side: "out" | "in", y?: number): Port[] {
  const cx = rect.x + rect.width / 2;
  const cy = y ?? rect.y + rect.height / 2;
  if (side === "out")
    return [
      { at: { x: rect.x + rect.width, y: cy }, direction: 0, penalty: 0 },
      { at: { x: cx, y: rect.y + rect.height }, direction: 1, penalty: cost.verticalPort },
      { at: { x: cx, y: rect.y }, direction: 3, penalty: cost.verticalPort },
    ];
  return [
    { at: { x: rect.x, y: cy }, direction: 0, penalty: 0 },
    { at: { x: cx, y: rect.y }, direction: 1, penalty: cost.verticalPort },
    { at: { x: cx, y: rect.y + rect.height }, direction: 3, penalty: cost.verticalPort },
  ];
}

// A binary heap of states by cost.
class Queue {
  private items: { cost: number; state: number }[] = [];
  get size() {
    return this.items.length;
  }
  push(state: number, c: number) {
    const items = this.items;
    items.push({ cost: c, state });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((items[parent] as { cost: number }).cost <= c) break;
      [items[i], items[parent]] = [items[parent] as never, items[i] as never];
      i = parent;
    }
  }
  pop(): { cost: number; state: number } {
    const items = this.items;
    const top = items[0] as { cost: number; state: number };
    const last = items.pop() as { cost: number; state: number };
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && (items[l]?.cost ?? 0) < (items[smallest]?.cost ?? 0)) smallest = l;
        if (r < items.length && (items[r]?.cost ?? 0) < (items[smallest]?.cost ?? 0)) smallest = r;
        if (smallest === i) break;
        [items[i], items[smallest]] = [items[smallest] as never, items[i] as never];
        i = smallest;
      }
    }
    return top;
  }
}

const unique = (values: number[]) =>
  [...new Set(values.map((v) => Math.round(v * 2) / 2))].sort((a, b) => a - b);

// Drops the points in the middle of straight stretches.
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const a = out.at(-2);
    const b = out.at(-1);
    if (b && Math.abs(b.x - p.x) < 0.5 && Math.abs(b.y - p.y) < 0.5) continue;
    if (a && b && ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)))
      out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

// How far around its two ends a route is looked for: near first, where most
// routes stay; wider when the near way crosses a drawn connection. Only when
// there is no way at all is the whole map searched: on a large map a way
// around every crossing can take long to rule out, and a live change would
// wait for it.
const searchMargins = { near: 240, around: 960 } as const;

interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function route(request: RouteRequest): Point[] {
  const { from, to } = request;
  const around = (margin: number): Bounds => ({
    left: Math.min(from.x, to.x) - margin,
    right: Math.max(from.x + from.width, to.x + to.width) + margin,
    top: Math.min(from.y, to.y) - margin,
    bottom: Math.max(from.y + from.height, to.y + to.height) + margin,
  });
  let found = search(request, around(searchMargins.near));
  if (found && crossings(found, request.routes) > 0) {
    const wider = search(request, around(searchMargins.around));
    if (wider && crossings(wider, request.routes) < crossings(found, request.routes)) found = wider;
  }
  found ??= search(request);
  if (found) return found;
  // No free way exists only when the nodes overlap; an elbow halfway is the
  // least wrong drawing then.
  const a = ports(from, "out", request.fromY)[0] as Port;
  const b = ports(to, "in", request.toY)[0] as Port;
  const mx = (a.at.x + b.at.x) / 2;
  return simplify([a.at, { x: mx, y: a.at.y }, { x: mx, y: b.at.y }, b.at]);
}

// Whether a segment crosses one of a drawn connection: a horizontal and a
// vertical one, each through the other's inside. Meeting at an end, or
// running along the same line, is not a crossing.
function crossesSegment(a: Point, b: Point, c: Point, d: Point): boolean {
  const flat = (p: Point, q: Point) => Math.abs(p.y - q.y) < 0.5;
  if (flat(a, b) === flat(c, d)) return false;
  const [h0, h1, v0, v1] = flat(a, b) ? [a, b, c, d] : [c, d, a, b];
  return (
    v0.x > Math.min(h0.x, h1.x) + 0.5 &&
    v0.x < Math.max(h0.x, h1.x) - 0.5 &&
    h0.y > Math.min(v0.y, v1.y) + 0.5 &&
    h0.y < Math.max(v0.y, v1.y) - 0.5
  );
}

// The drawn connections for the search, by where their straight stretches
// lie: horizontal ones by their height, vertical ones by their position
// across, so a step only looks at the stretches its own range can meet.
interface Stretch {
  at: number;
  from: number;
  to: number;
}

function stretches(routes: readonly (readonly Point[])[] = []) {
  const horizontal: Stretch[] = [];
  const vertical: Stretch[] = [];
  for (const [a, b] of segmentsOf(routes)) {
    if (Math.abs(a.y - b.y) < 0.5)
      horizontal.push({ at: a.y, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) });
    else if (Math.abs(a.x - b.x) < 0.5)
      vertical.push({ at: a.x, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y) });
  }
  const byPosition = (x: Stretch, y: Stretch) => x.at - y.at;
  return { horizontal: horizontal.sort(byPosition), vertical: vertical.sort(byPosition) };
}

// The first stretch at or past a position.
function firstFrom(sorted: Stretch[], position: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((sorted[middle] as Stretch).at < position) low = middle + 1;
    else high = middle;
  }
  return low;
}

// How many drawn stretches one step of the search crosses. A step may end
// exactly on a drawn connection and the next one leave it: the step's own
// range is half open, so the crossing counts once, on the step that leaves.
function crossedBy(index: ReturnType<typeof stretches>, a: Point, b: Point): number {
  const flat = Math.abs(a.y - b.y) < 0.5;
  const across = flat ? index.vertical : index.horizontal;
  const [start, end] = flat ? [a.x, b.x] : [a.y, b.y];
  const low = Math.min(start, end) - 0.5;
  const high = Math.max(start, end) - 0.5;
  const at = flat ? a.y : a.x;
  let count = 0;
  for (let k = firstFrom(across, low); k < across.length; k++) {
    const stretch = across[k] as Stretch;
    if (stretch.at >= high) break;
    if (at > stretch.from + 0.5 && at < stretch.to - 0.5) count++;
  }
  return count;
}

const segmentsOf = (routes: readonly (readonly Point[])[] = []) =>
  routes.flatMap((r) => r.slice(1).map((p, i) => [r[i] as Point, p] as const));

function crossings(points: Point[], routes?: readonly (readonly Point[])[]): number {
  const drawn = segmentsOf(routes);
  let count = 0;
  for (let i = 1; i < points.length; i++)
    for (const [c, d] of drawn)
      if (crossesSegment(points[i - 1] as Point, points[i] as Point, c, d)) count++;
  return count;
}

// The shortest route, staying inside the bounds when there are any: the
// nodes outside them are not looked at, so neither are the ways past them.
function search(request: RouteRequest, bounds?: Bounds): Point[] | undefined {
  const clearance = spacing.edgeToNode;
  const inside = (x: number, y: number) =>
    !bounds || (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom);
  const obstacles = bounds
    ? request.obstacles.filter(
        (r) =>
          r.x - clearance < bounds.right &&
          r.x + r.width + clearance > bounds.left &&
          r.y - clearance < bounds.bottom &&
          r.y + r.height + clearance > bounds.top,
      )
    : request.obstacles;
  const drawn = stretches(request.routes);
  const anyDrawn = drawn.horizontal.length + drawn.vertical.length > 0;
  // A point is free when it is outside every node grown by the clearance.
  const blocked = obstacles.map((r) => ({
    left: r.x - clearance + 0.5,
    right: r.x + r.width + clearance - 0.5,
    top: r.y - clearance + 0.5,
    bottom: r.y + r.height + clearance - 0.5,
  }));
  const free = (x: number, y: number) =>
    inside(x, y) && !blocked.some((b) => x > b.left && x < b.right && y > b.top && y < b.bottom);

  const starts = ports(request.from, "out", request.fromY).map((p) => ({
    ...p,
    off: {
      x: p.at.x + step[p.direction].x * clearance,
      y: p.at.y + step[p.direction].y * clearance,
    },
  }));
  const ends = ports(request.to, "in", request.toY).map((p) => ({
    ...p,
    off: {
      x: p.at.x - step[p.direction].x * clearance,
      y: p.at.y - step[p.direction].y * clearance,
    },
  }));

  // The grid: every node's grown border, the middle of every gap between two
  // borders (so an elbow sits halfway across a gap, as the design draws it),
  // and the points just outside the ports.
  const borderXs = unique(obstacles.flatMap((r) => [r.x - clearance, r.x + r.width + clearance]));
  const borderYs = unique(obstacles.flatMap((r) => [r.y - clearance, r.y + r.height + clearance]));
  const middles = (values: number[]) =>
    values.slice(1).map((v, i) => (v + (values[i] as number)) / 2);
  const middleXs = new Set(unique(middles(borderXs)));
  const xs = unique([
    ...borderXs,
    ...middles(borderXs),
    ...[...starts, ...ends].map((p) => p.off.x),
  ]);
  const ys = unique([
    ...borderYs,
    ...middles(borderYs),
    ...[...starts, ...ends].map((p) => p.off.y),
  ]);
  const ix = new Map(xs.map((x, i) => [x, i]));
  const iy = new Map(ys.map((y, i) => [y, i]));
  const key = (x: number, y: number, d: Direction) => ((y * xs.length + x) << 2) | d;
  const round = (v: number) => Math.round(v * 2) / 2;

  const best = new Map<number, number>();
  const previous = new Map<number, number>();
  const startOf = new Map<number, (typeof starts)[number]>();
  const queue = new Queue();
  for (const s of starts) {
    const gx = ix.get(round(s.off.x));
    const gy = iy.get(round(s.off.y));
    if (gx === undefined || gy === undefined || !free(s.off.x, s.off.y)) continue;
    const state = key(gx, gy, s.direction);
    const c = clearance + s.penalty;
    if (c < (best.get(state) ?? Number.POSITIVE_INFINITY)) {
      best.set(state, c);
      startOf.set(state, s);
      queue.push(state, c);
    }
  }
  const goals = new Map<number, (typeof ends)[number][]>();
  for (const e of ends) {
    const gx = ix.get(round(e.off.x));
    const gy = iy.get(round(e.off.y));
    if (gx === undefined || gy === undefined) continue;
    const at = (gy * xs.length + gx) << 2;
    goals.set(at, [...(goals.get(at) ?? []), e]);
  }

  let found: { state: number; end: (typeof ends)[number] } | undefined;
  let bestTotal = Number.POSITIVE_INFINITY;
  while (queue.size > 0) {
    const { cost: c, state } = queue.pop();
    if (c > (best.get(state) ?? Number.POSITIVE_INFINITY)) continue;
    if (c >= bestTotal) break;
    const d = (state & 3) as Direction;
    const cell = state >> 2;
    const gx = cell % xs.length;
    const gy = Math.floor(cell / xs.length);
    for (const e of goals.get(cell << 2) ?? []) {
      const total = c + clearance + e.penalty + (e.direction === d ? 0 : cost.bend);
      if (total < bestTotal) {
        bestTotal = total;
        found = { state, end: e };
      }
    }
    for (const nd of [0, 1, 2, 3] as Direction[]) {
      if (nd === (d + 2) % 4) continue;
      const nx = gx + step[nd].x;
      const ny = gy + step[nd].y;
      if (nx < 0 || ny < 0 || nx >= xs.length || ny >= ys.length) continue;
      const x0 = xs[gx] as number;
      const y0 = ys[gy] as number;
      const x1 = xs[nx] as number;
      const y1 = ys[ny] as number;
      if (!free(x1, y1) || !free((x0 + x1) / 2, (y0 + y1) / 2)) continue;
      const next = key(nx, ny, nd);
      const offMiddle = nd % 2 === 1 && !middleXs.has(x0) ? cost.offMiddle * Math.abs(y1 - y0) : 0;
      const crossed = anyDrawn ? crossedBy(drawn, { x: x0, y: y0 }, { x: x1, y: y1 }) : 0;
      const nc =
        c +
        Math.abs(x1 - x0) +
        Math.abs(y1 - y0) +
        (nd === d ? 0 : cost.bend) +
        offMiddle +
        crossed * cost.crossing;
      if (nc < (best.get(next) ?? Number.POSITIVE_INFINITY)) {
        best.set(next, nc);
        previous.set(next, state);
        queue.push(next, nc);
      }
    }
  }

  if (!found) return undefined;
  const cells: Point[] = [];
  let state: number | undefined = found.state;
  while (state !== undefined) {
    const cell = state >> 2;
    cells.push({
      x: xs[cell % xs.length] as number,
      y: ys[Math.floor(cell / xs.length)] as number,
    });
    if (startOf.has(state)) {
      cells.push((startOf.get(state) as (typeof starts)[number]).at);
      break;
    }
    state = previous.get(state);
  }
  cells.reverse();
  return simplify([...cells, found.end.at]);
}
