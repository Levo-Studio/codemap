// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Analysis, analyse } from "./analyse.js";
import type { Layout } from "./layout.js";
import type { MapView, Point, Rect } from "./view.js";
import { buildMap, type LayoutStore } from "./views.js";

let root: string;
let analysis: Analysis;
const project = { name: "shop", kind: "Next.js" };

const tree: Record<string, string> = {
  "app/(shop)/cart/page.tsx": `import { checkout } from "@/lib/billing/checkout";\nexport default function Cart() { checkout(); return <div/>; }\n`,
  "app/api/pay/route.ts": `import { charge } from "@/lib/billing/charge";\nexport async function POST() { charge(); }\n`,
  "lib/billing/checkout.ts": `import { charge } from "./charge";\nexport function checkout() { charge(); }\n`,
  "lib/billing/charge.ts": `import Stripe from "stripe";\nimport { save } from "../db";\nexport function charge() { new Stripe("k"); save(); }\n`,
  "lib/db.ts": `import { PrismaClient } from "@prisma/client";\nexport function save() { new PrismaClient(); }\n`,
  "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./*"] } } }),
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "codemap-views-"));
  for (const [path, content] of Object.entries(tree)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  analysis = await analyse(root);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const onBorder = (p: Point, r: Rect) =>
  ((Math.abs(p.x - r.x) < 0.5 || Math.abs(p.x - (r.x + r.width)) < 0.5) &&
    p.y >= r.y - 0.5 &&
    p.y <= r.y + r.height + 0.5) ||
  ((Math.abs(p.y - r.y) < 0.5 || Math.abs(p.y - (r.y + r.height)) < 0.5) &&
    p.x >= r.x - 0.5 &&
    p.x <= r.x + r.width + 0.5);

function holdsTheRules(map: MapView) {
  for (const edge of map.edges) {
    const from = map.nodes.find((n) => n.id === edge.from) as Rect;
    const to = map.nodes.find((n) => n.id === edge.to) as Rect;
    expect(onBorder(edge.points[0] as Point, from), `${edge.id} starts on the caller`).toBe(true);
    expect(onBorder(edge.points.at(-1) as Point, to), `${edge.id} ends on the callee`).toBe(true);
    expect(edge.points.at(-1)?.x ?? 0, `${edge.id} runs left to right`).toBeGreaterThanOrEqual(
      (edge.points[0]?.x ?? 0) - 0.5,
    );
  }
}

describe("buildMap", () => {
  it("draws the system as areas in their columns and services on the right", async () => {
    const { map, panel, topbar } = await buildMap(analysis, project, { level: "system" });
    const byLabel = new Map(map.nodes.map((n) => [n.label, n]));
    expect([...byLabel.keys()].sort()).toEqual([
      "API",
      "Billing",
      "Database",
      "Prisma",
      "Shop",
      "Stripe",
    ]);
    const x = (label: string) => byLabel.get(label)?.x ?? 0;
    expect(x("Shop")).toBeLessThan(x("API"));
    expect(x("API")).toBeLessThan(x("Billing"));
    expect(x("Billing")).toBeLessThan(x("Database"));
    expect(x("Database")).toBeLessThan(x("Stripe"));
    expect(map.columns.map((c) => c.label)).toEqual([
      "ENTRY",
      "API",
      "FEATURES",
      "DATA & SERVICES",
    ]);
    expect(byLabel.get("API")?.meta).toBe("1 route");
    holdsTheRules(map);
    expect(topbar.crumbs).toEqual(["System"]);
    expect(panel).toMatchObject({
      kind: "project",
      name: "shop",
      meta: "Next.js · 4 areas · 5 files",
    });
  });

  it("draws an area as its modules in a container, with callers left and callees right", async () => {
    const { map, topbar } = await buildMap(analysis, project, {
      level: "area",
      area: "lib/billing",
    });
    expect(map.container).toMatchObject({ title: "Billing", meta: "2 modules · 2 files" });
    expect(map.nodes.map((n) => n.label).sort()).toEqual([
      "API",
      "Charge",
      "Checkout",
      "Database",
      "Shop",
      "Stripe",
    ]);
    const container = map.container as Rect;
    for (const node of map.nodes.filter((n) => n.kind === "module")) {
      expect(node.x).toBeGreaterThan(container.x);
      expect(node.x + node.width).toBeLessThan(container.x + container.width);
    }
    holdsTheRules(map);
    expect(topbar.crumbs).toEqual(["System", "Billing"]);
  });

  it("says where each node and each crumb leads", async () => {
    const system = await buildMap(analysis, project, { level: "system" });
    expect(system.map.nodes.find((n) => n.label === "Billing")?.opens).toEqual({
      level: "area",
      id: "lib/billing",
    });
    expect(system.map.nodes.find((n) => n.label === "Stripe")?.opens).toBeUndefined();
    const area = await buildMap(analysis, project, { level: "area", area: "lib/billing" });
    expect(area.map.nodes.find((n) => n.label === "Charge")?.opens).toEqual({
      level: "file",
      id: "lib/billing/charge",
    });
    expect(area.map.nodes.find((n) => n.label === "API")?.opens).toEqual({
      level: "area",
      id: "app/api",
    });
    const file = await buildMap(analysis, project, { level: "file", module: "lib/billing/charge" });
    expect(file.map.nodes.find((n) => n.label === "charge.ts")?.opens).toEqual({
      level: "function",
      id: "lib/billing/charge.ts",
    });
    expect(file.topbar.trail).toEqual([
      { level: "system" },
      { level: "area", id: "lib/billing" },
      { level: "file", id: "lib/billing/charge" },
    ]);
  });

  it("draws a file's functions with their lines", async () => {
    const { map, panel } = await buildMap(analysis, project, {
      level: "function",
      file: "lib/billing/charge.ts",
    });
    expect(map.nodes.find((n) => n.label === "charge")).toMatchObject({
      kind: "function",
      meta: "L3",
    });
    expect(panel).toMatchObject({ kind: "file", name: "charge.ts", meta: "3 lines · 1 function" });
    holdsTheRules(map);
  });

  it("keeps every node where it was when the map is built again with more code", async () => {
    const kept = new Map<string, Layout>();
    const layouts: LayoutStore = { get: (k) => kept.get(k), set: (k, l) => void kept.set(k, l) };
    const places = [{ level: "system" as const }, { level: "area" as const, area: "lib/billing" }];
    const before = await Promise.all(
      places.map((p) => buildMap(analysis, project, p, { layouts })),
    );
    await writeFile(
      join(root, "lib/billing/refund.ts"),
      `import { charge } from "./charge";\nexport function refund() { charge(); }\n`,
    );
    await writeFile(
      join(root, "lib/billing/checkout.ts"),
      `import { charge } from "./charge";\nimport { refund } from "./refund";\nexport function checkout() { charge(); refund(); }\n`,
    );
    const grown = await analyse(root);
    for (const [i, place] of places.entries()) {
      const { map } = await buildMap(grown, project, place, { layouts });
      const was = new Map(before[i]?.map.nodes.map((n) => [n.id, n]));
      for (const node of map.nodes) {
        const old = was.get(node.id);
        if (old)
          expect({ x: node.x, y: node.y }, `${place.level} ${node.id}`).toEqual({
            x: old.x,
            y: old.y,
          });
      }
      holdsTheRules(map);
    }
  });

  it("moves no node when a function is added to a file with callers and callees", async () => {
    const dir = await mkdtemp(join(tmpdir(), "codemap-views-fn-"));
    try {
      const put = async (path: string, content: string) => {
        await mkdir(dirname(join(dir, path)), { recursive: true });
        await writeFile(join(dir, path), content);
      };
      await put(
        "src/a.ts",
        `import { x1, x2, x3, x4 } from "./x";\nexport function a() { x1(); x2(); x3(); x4(); }\n`,
      );
      await put(
        "src/x.ts",
        ["x1", "x2", "x3", "x4"].map((n) => `export function ${n}() {}`).join("\n"),
      );
      for (const n of ["b1", "b2", "b3"])
        await put(`src/${n}.ts`, `import { a } from "./a";\nexport function ${n}() { a(); }\n`);
      const kept = new Map<string, Layout>();
      const layouts: LayoutStore = { get: (k) => kept.get(k), set: (k, l) => void kept.set(k, l) };
      const place = { level: "function" as const, file: "src/a.ts" };
      const before = await buildMap(await analyse(dir), project, place, { layouts });
      await put(
        "src/a.ts",
        `import { x1, x2, x3, x4 } from "./x";\nexport function extra() {}\nexport function a() { x1(); x2(); x3(); x4(); }\n`,
      );
      const after = await buildMap(await analyse(dir), project, place, { layouts });
      expect(after.map.nodes.some((n) => n.label === "extra")).toBe(true);
      const was = new Map(before.map.nodes.map((n) => [n.id, n]));
      for (const node of after.map.nodes) {
        const old = was.get(node.id);
        if (old) expect({ x: node.x, y: node.y }, node.id).toEqual({ x: old.x, y: old.y });
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
