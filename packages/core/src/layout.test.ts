// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { layout } from "./layout.js";
import type { Point, Rect } from "./view.js";

const onBorder = (p: Point, r: Rect) =>
  ((Math.abs(p.x - r.x) < 0.5 || Math.abs(p.x - (r.x + r.width)) < 0.5) &&
    p.y >= r.y - 0.5 &&
    p.y <= r.y + r.height + 0.5) ||
  ((Math.abs(p.y - r.y) < 0.5 || Math.abs(p.y - (r.y + r.height)) < 0.5) &&
    p.x >= r.x - 0.5 &&
    p.x <= r.x + r.width + 0.5);

// A segment runs through a node when it passes its inside, not just its edge.
function throughNode(a: Point, b: Point, r: Rect): boolean {
  const inside = (x: number, y: number) =>
    x > r.x + 0.5 && x < r.x + r.width - 0.5 && y > r.y + 0.5 && y < r.y + r.height - 0.5;
  const steps = 50;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (inside(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return true;
  }
  return false;
}

// Two segments of different connections cross when one runs horizontally
// through the inside of the other, which runs vertically. Touching ends and
// shared stretches (where connections join) are not crossings.
function cross(a: Point, b: Point, c: Point, d: Point): boolean {
  const horizontal = (p: Point, q: Point) => Math.abs(p.y - q.y) < 0.5;
  if (horizontal(a, b) === horizontal(c, d)) return false;
  const [h0, h1, v0, v1] = horizontal(a, b) ? [a, b, c, d] : [c, d, a, b];
  return (
    v0.x > Math.min(h0.x, h1.x) + 0.5 &&
    v0.x < Math.max(h0.x, h1.x) - 0.5 &&
    h0.y > Math.min(v0.y, v1.y) + 0.5 &&
    h0.y < Math.max(v0.y, v1.y) - 0.5
  );
}

describe("layout", () => {
  const nodes = [
    { id: "frontend", width: 180, height: 72, partition: 0 },
    { id: "dashboard", width: 180, height: 72, partition: 0 },
    { id: "api", width: 180, height: 72, partition: 1 },
    { id: "billing", width: 180, height: 72, partition: 2 },
    { id: "auth", width: 180, height: 72, partition: 2 },
    { id: "database", width: 180, height: 72, partition: 3 },
  ];
  const edges = [
    { id: "e1", from: "frontend", to: "api" },
    { id: "e2", from: "dashboard", to: "api" },
    { id: "e3", from: "api", to: "billing" },
    { id: "e4", from: "api", to: "auth" },
    { id: "e5", from: "billing", to: "database" },
    { id: "e6", from: "auth", to: "database" },
    { id: "e7", from: "frontend", to: "database" },
  ];

  it("keeps every column strictly left of the next", async () => {
    const { nodes: placed } = await layout(nodes, edges);
    const right = (p: number) =>
      Math.max(
        ...nodes.filter((n) => n.partition === p).map((n) => (placed.get(n.id)?.x ?? 0) + n.width),
      );
    const left = (p: number) =>
      Math.min(...nodes.filter((n) => n.partition === p).map((n) => placed.get(n.id)?.x ?? 0));
    for (const p of [0, 1, 2]) expect(right(p)).toBeLessThan(left(p + 1));
  });

  it("routes every connection orthogonally from the caller's border to the callee's, through no node", async () => {
    const { nodes: placed, routes } = await layout(nodes, edges);
    for (const edge of edges) {
      const route = routes.get(edge.id) ?? [];
      expect(route.length, edge.id).toBeGreaterThanOrEqual(2);
      expect(onBorder(route[0] as Point, placed.get(edge.from) as Rect), `${edge.id} start`).toBe(
        true,
      );
      expect(onBorder(route.at(-1) as Point, placed.get(edge.to) as Rect), `${edge.id} end`).toBe(
        true,
      );
      route.slice(1).forEach((p, i) => {
        const q = route[i] as Point;
        expect(
          Math.abs(p.x - q.x) < 0.5 || Math.abs(p.y - q.y) < 0.5,
          `${edge.id} orthogonal`,
        ).toBe(true);
        for (const [id, rect] of placed)
          expect(throughNode(q, p, rect), `${edge.id} through ${id}`).toBe(false);
      });
    }
  });

  const crossings = (routes: Map<string, Point[]>) => {
    const found: string[] = [];
    const all = [...routes.entries()];
    for (const [i, [a, first]] of all.entries())
      for (const [b, second] of all.slice(i + 1))
        for (let s = 1; s < first.length; s++)
          for (let t = 1; t < second.length; t++)
            if (
              cross(
                first[s - 1] as Point,
                first[s] as Point,
                second[t - 1] as Point,
                second[t] as Point,
              )
            )
              found.push(`${a} × ${b}`);
    return found;
  };
  const box = { width: 180, height: 72 };

  it("crosses no connections where the graph can be drawn without", async () => {
    expect(crossings((await layout(nodes, edges)).routes)).toEqual([]);
    // In the order given, a over b and x over y, both calls would cross.
    const swapped = await layout(
      [
        { id: "a", ...box, partition: 0 },
        { id: "b", ...box, partition: 0 },
        { id: "x", ...box, partition: 1 },
        { id: "y", ...box, partition: 1 },
      ],
      [
        { id: "a>y", from: "a", to: "y" },
        { id: "b>x", from: "b", to: "x" },
      ],
    );
    expect(crossings(swapped.routes)).toEqual([]);
  });

  // Two callers that both call the same two callees cannot be drawn in two
  // columns without one crossing. Real code is full of this, so "no lines
  // cross" holds only where the graph allows it (CONTEXT, open questions).
  it("crosses where two columns cannot be drawn without", async () => {
    const { routes } = await layout(
      [
        { id: "a", ...box, partition: 0 },
        { id: "b", ...box, partition: 0 },
        { id: "x", ...box, partition: 1 },
        { id: "y", ...box, partition: 1 },
      ],
      ["a>x", "a>y", "b>x", "b>y"].map((id) => {
        const [from, to] = id.split(">") as [string, string];
        return { id, from, to };
      }),
    );
    expect(crossings(routes)).toHaveLength(1);
  });

  it("drops connections to nodes that are not on this level", async () => {
    const { routes } = await layout(nodes.slice(0, 2), [
      { id: "x", from: "frontend", to: "elsewhere" },
    ]);
    expect(routes.size).toBe(0);
  });

  it("packs unconnected nodes of one column apart, not in one tall column", async () => {
    const nodes = Array.from({ length: 12 }, (_, i) => ({
      id: `route-${i}`,
      width: 180,
      height: 48,
      partition: 0,
    }));
    const result = await layout(nodes, []);
    const columns = new Set([...result.nodes.values()].map((r) => r.x));
    expect(columns.size).toBeGreaterThan(1);
    expect(result.height).toBeLessThan(nodes.length * 48);
  });
});
