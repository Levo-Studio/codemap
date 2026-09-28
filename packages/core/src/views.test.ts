// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Analysis, analyse } from "./analyse.js";
import type { Layout } from "./layout.js";
import type { MapView, Point, Rect } from "./view.js";
import { buildMap, type LayoutStore, withFocus } from "./views.js";

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

const inside = (node: Rect, box: Rect) =>
  node.x > box.x &&
  node.y > box.y &&
  node.x + node.width < box.x + box.width &&
  node.y + node.height < box.y + box.height;

function holdsTheRules(map: MapView) {
  // Nothing drawn overlaps: two nodes never, and a node only lies in the box
  // of the node it was opened from.
  for (const [i, a] of map.nodes.entries())
    for (const b of map.nodes.slice(i + 1))
      expect(
        a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y,
        `${a.id} and ${b.id} overlap`,
      ).toBe(true);
  for (const node of map.nodes) {
    const box = map.opened?.find((o) => o.id === node.parent);
    if (node.parent) expect(box && inside(node, box), `${node.id} is in its box`).toBe(true);
  }
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
    const { map, panel, topbar } = await buildMap(analysis, project, []);
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
    expect(map.opened).toBeUndefined();
    expect(map.level).toBe("system");
    holdsTheRules(map);
    expect(topbar.crumbs).toEqual(["System"]);
    expect(panel).toMatchObject({
      kind: "project",
      name: "shop",
      meta: "Next.js · 4 areas · 5 files",
    });
  });

  it("opens an area in place: its modules in its box, the rest of the system around it", async () => {
    const { map } = await buildMap(analysis, project, ["lib/billing"]);
    expect(map.opened).toMatchObject([
      { id: "lib/billing", kind: "area", title: "Billing", meta: "2 modules · 2 files" },
    ]);
    expect(map.nodes.map((n) => n.label).sort()).toEqual([
      "API",
      "Charge",
      "Checkout",
      "Database",
      "Prisma",
      "Shop",
      "Stripe",
    ]);
    const modules = map.nodes.filter((n) => n.kind === "module");
    expect(modules.map((n) => n.parent)).toEqual(["lib/billing", "lib/billing"]);
    // The calls into the area now reach the modules that are called.
    const intoCharge = map.edges.find((e) => e.from === "app/api" && e.to === "lib/billing/charge");
    expect(intoCharge).toBeDefined();
    expect(map.level).toBe("area");
    // The columns stay the system's.
    expect(map.columns.map((c) => c.label)).toEqual([
      "ENTRY",
      "API",
      "FEATURES",
      "DATA & SERVICES",
    ]);
    holdsTheRules(map);
  });

  it("opens down to a file's functions, each with its line, inside the boxes it is in", async () => {
    const { map } = await buildMap(analysis, project, [
      "lib/billing",
      "lib/billing/charge",
      "lib/billing/charge.ts",
    ]);
    expect(map.opened?.map((o) => [o.id, o.title, o.mono ?? false])).toEqual([
      ["lib/billing", "Billing", false],
      ["lib/billing/charge", "Charge", false],
      ["lib/billing/charge.ts", "charge.ts", true],
    ]);
    expect(map.nodes.find((n) => n.label === "charge")).toMatchObject({
      kind: "function",
      meta: "L3",
      parent: "lib/billing/charge.ts",
    });
    expect(map.opened?.[2]?.meta).toBe("3 lines · 1 function");
    // The route calls the function itself; the function calls the database.
    expect(map.edges.map((e) => e.id)).toEqual(
      expect.arrayContaining([
        "app/api>lib/billing/charge.ts#charge",
        "lib/billing/charge.ts#charge>lib/db",
      ]),
    );
    expect(map.level).toBe("function");
    holdsTheRules(map);
  });

  it("opens only what can open: nothing whose box is closed, and no file without functions", async () => {
    const orphan = await buildMap(analysis, project, ["lib/billing/charge", "tsconfig.json"]);
    expect(orphan.map.opened).toBeUndefined();
    // lib/db.ts is an area of its own, its module named after it.
    const db = await buildMap(analysis, project, ["lib/db", "lib/db/db"]);
    expect(db.map.opened?.map((o) => o.id)).toEqual(["lib/db", "lib/db/db"]);
    expect(db.map.nodes.find((n) => n.parent === "lib/db/db")).toMatchObject({
      id: "lib/db.ts",
      kind: "file",
    });
    holdsTheRules(db.map);
  });

  it("says which nodes open, and where a selected node is in the crumbs", async () => {
    const system = await buildMap(analysis, project, []);
    expect(system.map.nodes.find((n) => n.label === "Billing")?.opens).toBe(true);
    expect(system.map.nodes.find((n) => n.label === "Stripe")?.opens).toBeUndefined();
    const file = await buildMap(analysis, project, ["lib/billing", "lib/billing/charge"], {
      select: "lib/billing/charge.ts",
    });
    expect(file.map.nodes.find((n) => n.id === "lib/billing/charge.ts")?.opens).toBe(true);
    expect(file.topbar.crumbs).toEqual(["System", "Billing", "Charge", "charge.ts"]);
    expect(file.topbar.trail).toEqual([
      null,
      "lib/billing",
      "lib/billing/charge",
      "lib/billing/charge.ts",
    ]);
  });

  it("draws a selected node selected, opened or not, with its own panel", async () => {
    const system = await buildMap(analysis, project, [], { select: "lib/billing" });
    expect(system.map.nodes.find((n) => n.id === "lib/billing")?.selected).toBe(true);
    expect(system.panel).toMatchObject({ kind: "module", name: "Billing" });

    const opened = await buildMap(analysis, project, ["lib/billing"], { select: "lib/billing" });
    expect(opened.map.opened?.[0]?.selected).toBe(true);
    expect(opened.panel).toMatchObject({ kind: "module", name: "Billing" });

    const read = (path: string) => tree[path];
    const functions = await buildMap(
      analysis,
      project,
      ["lib/billing", "lib/billing/charge", "lib/billing/charge.ts"],
      { select: "lib/billing/charge.ts#charge", read },
    );
    expect(functions.panel).toMatchObject({
      kind: "function",
      name: "charge",
      signature: { keyword: "function", lines: [" charge()"] },
      calls: [{ id: "lib/db.ts#save", name: "save" }],
    });
    expect(
      functions.panel.kind === "function" && functions.panel.calledBy.map((c) => c.name).sort(),
    ).toEqual(["POST", "checkout"]);

    const unknown = await buildMap(analysis, project, [], { select: "nothing" });
    expect(unknown.panel.kind).toBe("project");
  });

  it("follows a selected node: its connections drawn as its path, its neighbours kept, the rest dimmed", async () => {
    const plain = await buildMap(analysis, project, []);
    const edge = plain.map.edges[0];
    if (!edge) throw new Error("no connection");
    const { map } = withFocus(
      await buildMap(analysis, project, [], { select: edge.from }),
      edge.from,
    );
    const touching = (e: { from: string; to: string }) =>
      e.from === edge.from || e.to === edge.from;
    const neighbours = new Set(map.edges.filter(touching).flatMap((e) => [e.from, e.to]));
    for (const e of map.edges)
      expect([e.id, e.kind], e.id).toEqual([e.id, touching(e) ? "path" : "dimmed"]);
    for (const n of map.nodes)
      expect([n.id, !!n.dimmed], n.id).toEqual([n.id, !neighbours.has(n.id)]);
    expect(map.nodes.find((n) => n.id === edge.from)?.selected).toBe(true);
  });

  it("follows an opened node through everything inside it", async () => {
    const { map } = withFocus(
      await buildMap(analysis, project, ["lib/billing"], { select: "lib/billing" }),
      "lib/billing",
    );
    const inBilling = (id: string) => id.startsWith("lib/billing/");
    for (const e of map.edges)
      expect([e.id, e.kind], e.id).toEqual([
        e.id,
        inBilling(e.from) || inBilling(e.to) ? "path" : "dimmed",
      ]);
    for (const n of map.nodes.filter((n) => n.parent === "lib/billing"))
      expect(n.dimmed, n.id).toBeUndefined();
    // Shop calls nothing in Billing directly and is dimmed; API calls Charge.
    expect(map.nodes.find((n) => n.label === "API")?.dimmed).toBeUndefined();
  });

  it("carries the explanations, Simple or Technical as the user reads them", async () => {
    const words = (mode: "simple" | "technical") => ({
      mode,
      get: (kind: string, id: string) => ({
        simple: `${kind} ${id} in words, with \`code\`.`,
        technical: `${kind} calls \`save()\`.`,
      }),
    });
    const system = await buildMap(analysis, project, [], { words: words("simple") });
    expect(system.panel).toMatchObject({
      explanation: "simple",
      text: "system shop in words, with code.",
    });
    const open = ["lib/billing", "lib/billing/charge", "lib/billing/charge.ts"];
    const technical = await buildMap(analysis, project, open, {
      words: words("technical"),
      select: "lib/billing/charge.ts#charge",
    });
    expect(technical.map.nodes.find((n) => n.label === "charge")?.description).toBe(
      "function lib/billing/charge.ts#charge in words, with code.",
    );
    expect(technical.panel).toMatchObject({
      kind: "function",
      explanation: "technical",
      text: ["function calls ", { code: "save()" }, "."],
    });
  });

  it("keeps every node of the system where it was when the map is built again with more code", async () => {
    const kept = new Map<string, Layout>();
    const layouts: LayoutStore = { get: (k) => kept.get(k), set: (k, l) => void kept.set(k, l) };
    const before = await buildMap(analysis, project, [], { layouts });
    await writeFile(
      join(root, "lib/billing/refund.ts"),
      `import { charge } from "./charge";\nexport function refund() { charge(); }\n`,
    );
    const grown = await analyse(root);
    const { map } = await buildMap(grown, project, [], { layouts });
    const was = new Map(before.map.nodes.map((n) => [n.id, n]));
    for (const node of map.nodes) {
      const old = was.get(node.id);
      if (old) expect({ x: node.x, y: node.y }, node.id).toEqual({ x: old.x, y: old.y });
    }
    holdsTheRules(map);
  });

  it("keeps an opened map where it was while its nodes stay, and routes a new connection", async () => {
    const dir = await mkdtemp(join(tmpdir(), "codemap-views-open-"));
    try {
      const put = async (path: string, content: string) => {
        await mkdir(dirname(join(dir, path)), { recursive: true });
        await writeFile(join(dir, path), content);
      };
      await put("lib/billing/charge.ts", "export function charge() {}\n");
      await put("lib/billing/refund.ts", "export function refund() {}\n");
      await put("lib/mail/send.ts", "export function send() {}\n");
      const kept = new Map<string, Layout>();
      const layouts: LayoutStore = { get: (k) => kept.get(k), set: (k, l) => void kept.set(k, l) };
      const open = ["lib/billing"];
      const before = await buildMap(await analyse(dir), project, open, { layouts });
      await put(
        "lib/billing/refund.ts",
        `import { send } from "../mail/send";\nexport function refund() { send(); }\n`,
      );
      const after = await buildMap(await analyse(dir), project, open, { layouts });
      expect(after.map.edges.map((e) => e.id)).toContain("lib/billing/refund>lib/mail");
      const was = new Map(before.map.nodes.map((n) => [n.id, n]));
      for (const node of after.map.nodes)
        expect({ x: node.x, y: node.y }, node.id).toEqual({
          x: was.get(node.id)?.x,
          y: was.get(node.id)?.y,
        });
      expect(after.map.opened).toEqual(before.map.opened);
      holdsTheRules(after.map);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
