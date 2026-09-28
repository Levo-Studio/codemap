// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { MapScreen, Point, Rect } from "../model/view";
import { type FixtureName, fixtureModes, fixtureScreen } from "./ledgerly";

const onBorder = (p: Point, r: Rect) => {
  const insideX = p.x >= r.x && p.x <= r.x + r.width;
  const insideY = p.y >= r.y && p.y <= r.y + r.height;
  return (
    ((p.x === r.x || p.x === r.x + r.width) && insideY) ||
    ((p.y === r.y || p.y === r.y + r.height) && insideX)
  );
};

const mapScreens = (
  ["map-system", "map-area", "map-file", "map-function"] as FixtureName[]
).flatMap((name) =>
  fixtureModes[name].map((mode) => [`${name} ${mode}`, fixtureScreen(name, mode, "dark")] as const),
);

describe("the ledgerly-web fixture", () => {
  for (const [label, screen] of mapScreens) {
    const { map } = screen as MapScreen;

    it(`${label}: every arrow starts on the caller's border and ends on the callee's`, () => {
      for (const edge of map.edges) {
        const from = map.nodes.find((n) => n.id === edge.from);
        const to = map.nodes.find((n) => n.id === edge.to);
        expect(from, edge.id).toBeDefined();
        expect(to, edge.id).toBeDefined();
        if (!from || !to) continue;
        expect(onBorder(edge.points[0] as Point, from), `${edge.id} start`).toBe(true);
        expect(onBorder(edge.points.at(-1) as Point, to), `${edge.id} end`).toBe(true);
      }
    });

    it(`${label}: every route is orthogonal`, () => {
      for (const edge of map.edges) {
        edge.points.slice(1).forEach((p, i) => {
          const q = edge.points[i] as Point;
          expect(p.x === q.x || p.y === q.y, edge.id).toBe(true);
        });
      }
    });
  }

  it("numbers the four answer steps in Ask and dims everything else", () => {
    const { map } = fixtureScreen("map-system", "ask", "dark") as MapScreen;
    const steps = map.nodes.filter((n) => n.step !== undefined).map((n) => [n.id, n.step]);
    expect(steps).toEqual([
      ["dashboard", 1],
      ["api", 2],
      ["billing", 4],
      ["stripe", 3],
    ]);
    expect(map.nodes.filter((n) => n.step === undefined).every((n) => n.dimmed)).toBe(true);
  });

  it("drops every live state when the server is gone", () => {
    const { map } = fixtureScreen("map-system", "offline", "dark") as MapScreen;
    expect(map.nodes.every((n) => n.state === "default" && n.statusText === undefined)).toBe(true);
    expect(map.edges.every((e) => e.kind === "call")).toBe(true);
  });
});
