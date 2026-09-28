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

  it("drops connections to nodes that are not on this level", async () => {
    const { routes } = await layout(nodes.slice(0, 2), [
      { id: "x", from: "frontend", to: "elsewhere" },
    ]);
    expect(routes.size).toBe(0);
  });
});
