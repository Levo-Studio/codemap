// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { spacing } from "./design.js";
import { layout } from "./layout.js";
import { extend } from "./stable.js";
import type { Point, Rect } from "./view.js";

const node = (id: string, partition: number) => ({ id, width: 180, height: 72, partition });
const edge = (from: string, to: string) => ({ id: `${from}>${to}`, from, to });

const nodes = [
  node("frontend", 0),
  node("dashboard", 0),
  node("api", 1),
  node("billing", 2),
  node("auth", 2),
  node("database", 3),
];
const edges = [
  edge("frontend", "api"),
  edge("dashboard", "api"),
  edge("api", "billing"),
  edge("api", "auth"),
  edge("billing", "database"),
  edge("auth", "database"),
];

const apart = (a: Rect, b: Rect) =>
  a.x + a.width <= b.x ||
  b.x + b.width <= a.x ||
  a.y + a.height + spacing.betweenNodes <= b.y ||
  b.y + b.height + spacing.betweenNodes <= a.y;

function throughNode(points: Point[], r: Rect): boolean {
  return points.slice(1).some((p, i) => {
    const q = points[i] as Point;
    for (let t = 1; t < 50; t++) {
      const x = q.x + ((p.x - q.x) * t) / 50;
      const y = q.y + ((p.y - q.y) * t) / 50;
      if (x > r.x + 0.5 && x < r.x + r.width - 0.5 && y > r.y + 0.5 && y < r.y + r.height - 0.5)
        return true;
    }
    return false;
  });
}

describe("extend", () => {
  it("moves no node that was already there when one is added", async () => {
    const before = await layout(nodes, edges);
    for (const [added, parent, partition] of [
      ["jobs", "billing", 2],
      ["mail", "api", 2],
      ["login", "auth", 1],
      ["cache", "database", 3],
    ] as const) {
      const after = extend(
        before,
        [...nodes, node(added, partition)],
        [...edges, edge(parent, added)],
      );
      expect(after, added).toBeDefined();
      for (const [id, rect] of before.nodes)
        expect(after?.nodes.get(id), `${added}: ${id}`).toEqual(rect);
    }
  });

  it("puts a new node next to the one it is connected to, in the column of its role", async () => {
    const before = await layout(nodes, edges);
    const after = extend(before, [...nodes, node("jobs", 2)], [...edges, edge("billing", "jobs")]);
    const billing = before.nodes.get("billing") as Rect;
    const jobs = after?.nodes.get("jobs") as Rect;
    expect(jobs.x).toBe(billing.x);
    for (const [id, rect] of after?.nodes ?? [])
      if (id !== "jobs") expect(apart(jobs, rect), id).toBe(true);
    // No free place in that column is nearer the one right below billing.
    const target = billing.y + billing.height + spacing.betweenNodes;
    const others = [...(after?.nodes ?? [])].filter(([id]) => id !== "jobs").map(([, r]) => r);
    for (let y = 0; y < 2000; y++) {
      if (Math.abs(y - target) >= Math.abs(jobs.y - target)) continue;
      const free = others.every((r) => apart({ ...jobs, y }, r));
      expect(free, `free at ${y}`).toBe(false);
    }
    const cache = extend(
      before,
      [...nodes, node("cache", 3)],
      [...edges, edge("billing", "cache")],
    );
    expect(cache?.nodes.get("cache")?.x).toBe(before.nodes.get("database")?.x);
  });

  it("keeps the routes a new node is not in the way of, and routes new ones around every node", async () => {
    const before = await layout(nodes, edges);
    const after = extend(before, [...nodes, node("jobs", 2)], [...edges, edge("billing", "jobs")]);
    const jobs = after?.nodes.get("jobs") as Rect;
    for (const [id, points] of before.routes)
      if (!throughNode(points, jobs)) expect(after?.routes.get(id), id).toEqual(points);
    for (const [id, points] of after?.routes ?? [])
      for (const [n, rect] of after?.nodes ?? []) {
        const [from, to] = id.split(">");
        if (n !== from && n !== to)
          expect(throughNode(points, rect), `${id} through ${n}`).toBe(false);
      }
    expect(after?.routes.get("billing>jobs")?.length).toBeGreaterThanOrEqual(2);
  });

  it("forgets nodes that are gone, with their connections, and moves nothing else", async () => {
    const before = await layout(nodes, edges);
    const after = extend(
      before,
      nodes.filter((n) => n.id !== "auth"),
      edges.filter((e) => e.from !== "auth" && e.to !== "auth"),
    );
    expect(after?.nodes.has("auth")).toBe(false);
    expect([...(after?.routes.keys() ?? [])].some((id) => id.includes("auth"))).toBe(false);
    for (const [id, rect] of after?.nodes ?? []) expect(rect, id).toEqual(before.nodes.get(id));
  });

  it("gives up rather than squeeze a new column between two that have no room", async () => {
    const before = await layout(nodes, edges);
    const after = extend(
      before,
      [...nodes, node("between", 1.5)],
      [...edges, edge("api", "between")],
    );
    expect(after).toBeUndefined();
  });
});
