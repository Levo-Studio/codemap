// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { spacing } from "./design.js";
import { route } from "./route.js";
import type { Point, Rect } from "./view.js";

const box = (x: number, y: number): Rect => ({ x, y, width: 180, height: 72 });

// Whether a segment passes the inside of a node grown by the clearance.
function tooClose(a: Point, b: Point, r: Rect): boolean {
  const c = spacing.edgeToNode - 0.5;
  for (let i = 1; i < 50; i++) {
    const t = i / 50;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (x > r.x - c && x < r.x + r.width + c && y > r.y - c && y < r.y + r.height + c) return true;
  }
  return false;
}

function check(points: Point[], from: Rect, to: Rect, obstacles: Rect[]) {
  expect(points.length).toBeGreaterThanOrEqual(2);
  points.slice(1).forEach((p, i) => {
    const q = points[i] as Point;
    expect(Math.abs(p.x - q.x) < 0.5 || Math.abs(p.y - q.y) < 0.5, "orthogonal").toBe(true);
    // The first and last segments leave and enter their own node.
    const ends = [i === 0 ? from : undefined, i === points.length - 2 ? to : undefined];
    for (const r of obstacles)
      if (!ends.includes(r)) expect(tooClose(q, p, r), "clear").toBe(false);
  });
}

describe("route", () => {
  it("goes from the caller's right border to the callee's left, with the elbow halfway across the gap", () => {
    const from = box(0, 0);
    const to = box(240, 120);
    const points = route({ from, to, obstacles: [from, to] });
    check(points, from, to, [from, to]);
    expect(points[0]).toEqual({ x: 180, y: 36 });
    expect(points.at(-1)).toEqual({ x: 240, y: 156 });
    expect(points).toEqual([
      { x: 180, y: 36 },
      { x: 210, y: 36 },
      { x: 210, y: 156 },
      { x: 240, y: 156 },
    ]);
  });

  it("keeps its distance from every node on the way", () => {
    const from = box(0, 100);
    const middle = box(240, 80);
    const to = box(480, 100);
    const obstacles = [from, middle, to, box(240, 200), box(240, -40)];
    const points = route({ from, to, obstacles });
    check(points, from, to, obstacles);
    expect(points[0]?.x).toBe(180);
    expect(points.at(-1)?.x).toBe(480);
  });

  it("reaches a callee straight below by a vertical connection", () => {
    const from = box(0, 0);
    const to = box(0, 108);
    const points = route({ from, to, obstacles: [from, to] });
    check(points, from, to, [from, to]);
    expect(points).toEqual([
      { x: 90, y: 72 },
      { x: 90, y: 108 },
    ]);
  });

  it("attaches where it is told to", () => {
    const from = box(0, 0);
    const to = box(240, 0);
    const points = route({ from, to, obstacles: [from, to], fromY: 20, toY: 20 });
    expect(points).toEqual([
      { x: 180, y: 20 },
      { x: 240, y: 20 },
    ]);
  });
});
