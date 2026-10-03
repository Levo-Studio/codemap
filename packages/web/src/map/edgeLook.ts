// SPDX-License-Identifier: Apache-2.0

import { edge as m } from "../design/metrics";
import { loop } from "../design/motion";
import type { ColorToken } from "../design/tokens";
import type { EdgeKind, MapEdge, Point } from "../model/view";

export interface EdgeLook {
  color: ColorToken;
  width: number;
  dash?: readonly [number, number];
  flowing: boolean;
}

const colors: Record<EdgeKind, ColorToken> = {
  call: "edge",
  active: "edit",
  new: "neu",
  path: "text2",
  dimmed: "edgeDim",
  bundled: "edge",
};

// `strong` only keeps an Ask-dimmed active edge's weight.
export function edgeLook(edge: Pick<MapEdge, "kind" | "strong">): EdgeLook {
  const heavy = edge.kind === "active" || edge.kind === "path" || edge.strong;
  const width = edge.kind === "bundled" ? m.bundled : heavy ? m.strong : m.width;
  const active = edge.kind === "active";
  return {
    color: colors[edge.kind],
    width,
    ...(active ? { dash: loop.edgeFlowDash } : {}),
    flowing: active,
  };
}

interface Arrow {
  line: Point[];
  head: [Point, Point, Point];
}

// Routes can repeat a bend point; skip zero-length segments.
export function arrow(points: Point[]): Arrow | null {
  const distinct = points.filter(
    (p, i) => i === 0 || p.x !== points[i - 1]?.x || p.y !== points[i - 1]?.y,
  );
  const end = distinct.at(-1);
  const before = distinct.at(-2);
  if (!end || !before) return null;
  const length = Math.hypot(end.x - before.x, end.y - before.y);
  const ux = (end.x - before.x) / length;
  const uy = (end.y - before.y) / length;
  const base = { x: end.x - ux * m.arrowLength, y: end.y - uy * m.arrowLength };
  return {
    line: [...distinct.slice(0, -1), base],
    head: [
      end,
      { x: base.x - uy * m.arrowHalfWidth, y: base.y + ux * m.arrowHalfWidth },
      { x: base.x + uy * m.arrowHalfWidth, y: base.y - ux * m.arrowHalfWidth },
    ],
  };
}

export function midpoint(points: Point[]): Point | null {
  const half = pathLength(points) / 2;
  return slice(points, 0, half).at(-1) ?? null;
}

export function slice(points: Point[], from: number, to: number): Point[] {
  const out: Point[] = [];
  let start = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const end = start + length;
    const at = (d: number) => ({
      x: a.x + ((b.x - a.x) * (d - start)) / length,
      y: a.y + ((b.y - a.y) * (d - start)) / length,
    });
    if (end >= from && start <= to && length > 0) {
      if (out.length === 0) out.push(at(Math.max(from, start)));
      out.push(at(Math.min(to, end)));
    }
    start = end;
  }
  return out;
}

function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

// Like SVG stroke-dasharray: the pattern runs across corners.
export function dashes(
  points: Point[],
  [dash, gap]: readonly [number, number],
  offset: number,
): Point[][] {
  const period = dash + gap;
  const total = pathLength(points);
  const out: Point[][] = [];
  const first = -(((offset % period) + period) % period);
  for (let start = first; start < total; start += period) {
    const from = Math.max(0, start);
    const to = Math.min(total, start + dash);
    if (to > from) out.push(slice(points, from, to));
  }
  return out;
}
