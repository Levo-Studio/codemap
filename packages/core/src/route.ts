// SPDX-License-Identifier: Apache-2.0

import { spacing } from "./design.js";
import type { Point, Rect } from "./view.js";

interface RouteRequest {
  from: Rect;
  to: Rect;
  obstacles: readonly Rect[];
  fromY?: number;
  toY?: number;
  routes?: readonly (readonly Point[])[];
  near?: boolean;
}

const costs = { bend: 40, verticalPort: 120, offMiddle: 0.01, crossing: 5000 } as const;

export const tolerance = 0.5;
const snap = (v: number) => Math.round(v / tolerance) * tolerance;

type Direction = 0 | 1 | 2 | 3;
const step: Record<Direction, Point> = {
  0: { x: 1, y: 0 },
  1: { x: 0, y: 1 },
  2: { x: -1, y: 0 },
  3: { x: 0, y: -1 },
};

interface Port {
  at: Point;
  direction: Direction;
  penalty: number;
}

function ports(rect: Rect, side: "out" | "in", y?: number): Port[] {
  const cx = rect.x + rect.width / 2;
  const cy = y ?? rect.y + rect.height / 2;
  if (side === "out")
    return [
      { at: { x: rect.x + rect.width, y: cy }, direction: 0, penalty: 0 },
      { at: { x: cx, y: rect.y + rect.height }, direction: 1, penalty: costs.verticalPort },
      { at: { x: cx, y: rect.y }, direction: 3, penalty: costs.verticalPort },
    ];
  return [
    { at: { x: rect.x, y: cy }, direction: 0, penalty: 0 },
    { at: { x: cx, y: rect.y }, direction: 1, penalty: costs.verticalPort },
    { at: { x: cx, y: rect.y + rect.height }, direction: 3, penalty: costs.verticalPort },
  ];
}

interface Entry {
  cost: number;
  state: number;
}

class Queue {
  private readonly items: Entry[] = [];

  get size() {
    return this.items.length;
  }

  push(state: number, cost: number) {
    this.items.push({ cost, state });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.costAt(parent) <= cost) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): Entry {
    const items = this.items;
    const top = items[0] as Entry;
    const last = items.pop() as Entry;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && this.costAt(l) < this.costAt(smallest)) smallest = l;
        if (r < items.length && this.costAt(r) < this.costAt(smallest)) smallest = r;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private costAt(i: number): number {
    return (this.items[i] as Entry).cost;
  }

  private swap(i: number, j: number) {
    const a = this.items[i] as Entry;
    this.items[i] = this.items[j] as Entry;
    this.items[j] = a;
  }
}

const unique = (values: number[]) => [...new Set(values.map(snap))].sort((a, b) => a - b);

function withoutMidpoints(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const a = out.at(-2);
    const b = out.at(-1);
    if (b && Math.abs(b.x - p.x) < tolerance && Math.abs(b.y - p.y) < tolerance) continue;
    if (a && b && ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)))
      out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

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
  if (found && !request.near && crossings(found, request.routes) > 0) {
    const wider = search(request, around(searchMargins.around));
    if (wider && crossings(wider, request.routes) < crossings(found, request.routes)) found = wider;
  }
  found ??= search(request);
  if (found) return found;
  // Only overlapping nodes leave no way; draw an elbow halfway.
  const a = ports(from, "out", request.fromY)[0] as Port;
  const b = ports(to, "in", request.toY)[0] as Port;
  const mx = (a.at.x + b.at.x) / 2;
  return withoutMidpoints([a.at, { x: mx, y: a.at.y }, { x: mx, y: b.at.y }, b.at]);
}

const segmentsOf = (routes: readonly (readonly Point[])[] = []) =>
  routes.flatMap((r) => r.slice(1).map((p, i) => [r[i] as Point, p] as const));

// Meeting at an end or running alongside is not crossing.
function crossesSegment(a: Point, b: Point, c: Point, d: Point): boolean {
  const flat = (p: Point, q: Point) => Math.abs(p.y - q.y) < tolerance;
  if (flat(a, b) === flat(c, d)) return false;
  const [h0, h1, v0, v1] = flat(a, b) ? [a, b, c, d] : [c, d, a, b];
  return (
    v0.x > Math.min(h0.x, h1.x) + tolerance &&
    v0.x < Math.max(h0.x, h1.x) - tolerance &&
    h0.y > Math.min(v0.y, v1.y) + tolerance &&
    h0.y < Math.max(v0.y, v1.y) - tolerance
  );
}

interface Stretch {
  at: number;
  from: number;
  to: number;
}

function stretches(routes: readonly (readonly Point[])[] = []) {
  const horizontal: Stretch[] = [];
  const vertical: Stretch[] = [];
  for (const [a, b] of segmentsOf(routes)) {
    if (Math.abs(a.y - b.y) < tolerance)
      horizontal.push({ at: a.y, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) });
    else if (Math.abs(a.x - b.x) < tolerance)
      vertical.push({ at: a.x, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y) });
  }
  const byPosition = (x: Stretch, y: Stretch) => x.at - y.at;
  return { horizontal: horizontal.sort(byPosition), vertical: vertical.sort(byPosition) };
}

function firstStretchAtOrPast(sorted: Stretch[], position: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((sorted[middle] as Stretch).at < position) low = middle + 1;
    else high = middle;
  }
  return low;
}

// Half-open ranges count a crossing once, on the leaving step.
function crossedBy(index: ReturnType<typeof stretches>, a: Point, b: Point): number {
  const flat = Math.abs(a.y - b.y) < tolerance;
  const across = flat ? index.vertical : index.horizontal;
  const [start, end] = flat ? [a.x, b.x] : [a.y, b.y];
  const low = Math.min(start, end) - tolerance;
  const high = Math.max(start, end) - tolerance;
  const at = flat ? a.y : a.x;
  let count = 0;
  for (let k = firstStretchAtOrPast(across, low); k < across.length; k++) {
    const stretch = across[k] as Stretch;
    if (stretch.at >= high) break;
    if (at > stretch.from + tolerance && at < stretch.to - tolerance) count++;
  }
  return count;
}

function crossings(points: Point[], routes?: readonly (readonly Point[])[]): number {
  const drawn = segmentsOf(routes);
  let count = 0;
  for (let i = 1; i < points.length; i++)
    for (const [c, d] of drawn)
      if (crossesSegment(points[i - 1] as Point, points[i] as Point, c, d)) count++;
  return count;
}

interface End extends Port {
  off: Point;
}

const departures = (from: Port[], clearance: number): End[] =>
  from.map((p) => ({
    ...p,
    off: {
      x: p.at.x + step[p.direction].x * clearance,
      y: p.at.y + step[p.direction].y * clearance,
    },
  }));

const arrivals = (to: Port[], clearance: number): End[] =>
  to.map((p) => ({
    ...p,
    off: {
      x: p.at.x - step[p.direction].x * clearance,
      y: p.at.y - step[p.direction].y * clearance,
    },
  }));

class Grid {
  readonly width: number;
  readonly height: number;
  private readonly xs: number[];
  private readonly ys: number[];
  private readonly ix: Map<number, number>;
  private readonly iy: Map<number, number>;
  private readonly middleXs: Set<number>;
  private readonly pointFree: Uint8Array;
  private readonly rightFree: Uint8Array;
  private readonly downFree: Uint8Array;

  constructor(
    obstacles: readonly Rect[],
    clearance: number,
    portEnds: End[],
    private readonly free: (x: number, y: number) => boolean,
  ) {
    const borderXs = unique(obstacles.flatMap((r) => [r.x - clearance, r.x + r.width + clearance]));
    const borderYs = unique(
      obstacles.flatMap((r) => [r.y - clearance, r.y + r.height + clearance]),
    );
    const middles = (values: number[]) =>
      values.slice(1).map((v, i) => (v + (values[i] as number)) / 2);
    this.middleXs = new Set(unique(middles(borderXs)));
    this.xs = unique([...borderXs, ...middles(borderXs), ...portEnds.map((p) => p.off.x)]);
    this.ys = unique([...borderYs, ...middles(borderYs), ...portEnds.map((p) => p.off.y)]);
    this.ix = new Map(this.xs.map((x, i) => [x, i]));
    this.iy = new Map(this.ys.map((y, i) => [y, i]));
    this.width = this.xs.length;
    this.height = this.ys.length;
    this.pointFree = new Uint8Array(this.width * this.height);
    this.rightFree = new Uint8Array(this.width * this.height);
    this.downFree = new Uint8Array(this.width * this.height);
  }

  xAt(gx: number): number {
    return this.xs[gx] as number;
  }

  yAt(gy: number): number {
    return this.ys[gy] as number;
  }

  pointAt(p: Point): { gx: number; gy: number } | undefined {
    const gx = this.ix.get(snap(p.x));
    const gy = this.iy.get(snap(p.y));
    return gx === undefined || gy === undefined ? undefined : { gx, gy };
  }

  inMiddle(gx: number): boolean {
    return this.middleXs.has(this.xAt(gx));
  }

  freeAt(gx: number, gy: number): boolean {
    return this.known(this.pointFree, gy * this.width + gx, () =>
      this.free(this.xAt(gx), this.yAt(gy)),
    );
  }

  // Cached by its left or top end.
  stepFree(gx: number, gy: number, nx: number, ny: number): boolean {
    const [ax, ay] = nx < gx || ny < gy ? [nx, ny] : [gx, gy];
    const across = ny === gy;
    return this.known(across ? this.rightFree : this.downFree, ay * this.width + ax, () =>
      this.free((this.xAt(gx) + this.xAt(nx)) / 2, (this.yAt(gy) + this.yAt(ny)) / 2),
    );
  }

  private known(memo: Uint8Array, at: number, work: () => boolean): boolean {
    if (memo[at] === 0) memo[at] = work() ? 1 : 2;
    return memo[at] === 1;
  }
}

function nearby(obstacles: readonly Rect[], clearance: number, bounds?: Bounds): readonly Rect[] {
  if (!bounds) return obstacles;
  return obstacles.filter(
    (r) =>
      r.x - clearance < bounds.right &&
      r.x + r.width + clearance > bounds.left &&
      r.y - clearance < bounds.bottom &&
      r.y + r.height + clearance > bounds.top,
  );
}

function freeSpace(obstacles: readonly Rect[], clearance: number, bounds?: Bounds) {
  const inside = (x: number, y: number) =>
    !bounds || (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom);
  const blocked = obstacles.map((r) => ({
    left: r.x - clearance + tolerance,
    right: r.x + r.width + clearance - tolerance,
    top: r.y - clearance + tolerance,
    bottom: r.y + r.height + clearance - tolerance,
  }));
  return (x: number, y: number) =>
    inside(x, y) && !blocked.some((b) => x > b.left && x < b.right && y > b.top && y < b.bottom);
}

const stateOf = (grid: Grid, gx: number, gy: number, d: Direction) =>
  ((gy * grid.width + gx) << 2) | d;

interface Frontier {
  best: Map<number, number>;
  previous: Map<number, number>;
  startOf: Map<number, End>;
  queue: Queue;
}

// Each start is queued by cost plus distance to end.
function seed(
  grid: Grid,
  starts: End[],
  clearance: number,
  free: (x: number, y: number) => boolean,
  toEnd: (gx: number, gy: number) => number,
): Frontier {
  const frontier: Frontier = {
    best: new Map(),
    previous: new Map(),
    startOf: new Map(),
    queue: new Queue(),
  };
  for (const s of starts) {
    const point = grid.pointAt(s.off);
    if (!point || !free(s.off.x, s.off.y)) continue;
    const state = stateOf(grid, point.gx, point.gy, s.direction);
    const c = clearance + s.penalty;
    if (c < (frontier.best.get(state) ?? Number.POSITIVE_INFINITY)) {
      frontier.best.set(state, c);
      frontier.startOf.set(state, s);
      frontier.queue.push(state, c + toEnd(point.gx, point.gy));
    }
  }
  return frontier;
}

function tracePath(
  grid: Grid,
  { previous, startOf }: Frontier,
  found: { state: number; end: End },
): Point[] {
  const cells: Point[] = [];
  let state: number | undefined = found.state;
  while (state !== undefined) {
    const cell = state >> 2;
    cells.push({ x: grid.xAt(cell % grid.width), y: grid.yAt(Math.floor(cell / grid.width)) });
    const start = startOf.get(state);
    if (start) {
      cells.push(start.at);
      break;
    }
    state = previous.get(state);
  }
  cells.reverse();
  return withoutMidpoints([...cells, found.end.at]);
}

const leastDistanceToEnd = (grid: Grid, ends: End[]) => (gx: number, gy: number) =>
  Math.min(...ends.map((e) => Math.abs(grid.xAt(gx) - e.off.x) + Math.abs(grid.yAt(gy) - e.off.y)));

// Nodes and ways outside the bounds are not considered.
function search(request: RouteRequest, bounds?: Bounds): Point[] | undefined {
  const clearance = spacing.edgeToNode;
  const obstacles = nearby(request.obstacles, clearance, bounds);
  const drawn = stretches(request.routes);
  const anyDrawn = drawn.horizontal.length + drawn.vertical.length > 0;
  const free = freeSpace(obstacles, clearance, bounds);
  const starts = departures(ports(request.from, "out", request.fromY), clearance);
  const ends = arrivals(ports(request.to, "in", request.toY), clearance);
  const grid = new Grid(obstacles, clearance, [...starts, ...ends], free);
  const toEnd = leastDistanceToEnd(grid, ends);
  const frontier = seed(grid, starts, clearance, free, toEnd);
  const { best, previous, queue } = frontier;
  const goals = new Map<number, End[]>();
  for (const e of ends) {
    const point = grid.pointAt(e.off);
    if (!point) continue;
    const at = stateOf(grid, point.gx, point.gy, 0);
    goals.set(at, [...(goals.get(at) ?? []), e]);
  }

  let found: { state: number; end: End } | undefined;
  let bestTotal = Number.POSITIVE_INFINITY;
  while (queue.size > 0) {
    const { cost: estimate, state } = queue.pop();
    const d = (state & 3) as Direction;
    const cell = state >> 2;
    const gx = cell % grid.width;
    const gy = Math.floor(cell / grid.width);
    const c = best.get(state) ?? Number.POSITIVE_INFINITY;
    if (estimate > c + toEnd(gx, gy)) continue;
    if (estimate >= bestTotal) break;
    for (const e of goals.get(cell << 2) ?? []) {
      const total = c + clearance + e.penalty + (e.direction === d ? 0 : costs.bend);
      if (total < bestTotal) {
        bestTotal = total;
        found = { state, end: e };
      }
    }
    for (const nd of [0, 1, 2, 3] as Direction[]) {
      if (nd === (d + 2) % 4) continue;
      const nx = gx + step[nd].x;
      const ny = gy + step[nd].y;
      if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
      if (!grid.freeAt(nx, ny) || !grid.stepFree(gx, gy, nx, ny)) continue;
      const from = { x: grid.xAt(gx), y: grid.yAt(gy) };
      const to = { x: grid.xAt(nx), y: grid.yAt(ny) };
      const next = stateOf(grid, nx, ny, nd);
      const offMiddle =
        nd % 2 === 1 && !grid.inMiddle(gx) ? costs.offMiddle * Math.abs(to.y - from.y) : 0;
      const crossed = anyDrawn ? crossedBy(drawn, from, to) : 0;
      const nc =
        c +
        Math.abs(to.x - from.x) +
        Math.abs(to.y - from.y) +
        (nd === d ? 0 : costs.bend) +
        offMiddle +
        crossed * costs.crossing;
      if (nc < (best.get(next) ?? Number.POSITIVE_INFINITY)) {
        best.set(next, nc);
        previous.set(next, state);
        queue.push(next, nc + toEnd(nx, ny));
      }
    }
  }

  return found && tracePath(grid, frontier, found);
}
