// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { timeline, withActivity } from "./activity.js";
import { type Analysis, analyse } from "./analyse.js";
import { Session } from "./session.js";
import { en } from "./strings/en.js";
import type { MapScreen } from "./view.js";
import { buildMap, withFocus } from "./views.js";

let root: string;
let after: Analysis;
let session: Session;
const project = { name: "shop", kind: "Next.js" };
const at = new Date(2026, 8, 28, 14, 21).getTime();
const second = 1000;
const minute = 60 * second;

const write = async (path: string, content: string) => {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "codemap-activity-"));
  await write(
    "lib/billing/charge.ts",
    `import { save } from "../db/save";\nexport function charge() {\n  save();\n}\n`,
  );
  await write("lib/db/save.ts", "export function save() {}\n");
  await write("lib/db/load.ts", "export function load() {}\n");
  const start = await analyse(root);
  session = new Session(start, at - 10 * minute);

  await write(
    "lib/billing/charge.ts",
    `import { save } from "../db/save";\nimport { retry } from "./dunning/retry";\nexport function charge() {\n  save();\n  retry();\n}\nexport function refund() {}\n`,
  );
  await write(
    "lib/billing/dunning/retry.ts",
    `import Stripe from "stripe";\nexport function retry() { new Stripe("k"); }\n`,
  );
  await write("lib/db/load.ts", "// Loads a row.\nexport function load() {}\n");
  const paths = ["lib/billing/charge.ts", "lib/billing/dunning/retry.ts", "lib/db/load.ts"];
  after = await analyse(root, { previous: start, changed: new Set(paths) });
  session.record(start, after, paths, at);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const view = async (open: string[], now: number, select?: string): Promise<MapScreen> =>
  withActivity(await buildMap(after, project, open, select ? { select } : {}), after, session, {
    now,
  });
// The nodes that open for a file's functions to be on the map.
const toFunctions = (path: string) => [
  after.structure.areaOf.get(path) as string,
  after.structure.moduleOf.get(path) as string,
  path,
];
const node = (screen: MapScreen, label: string) => screen.map.nodes.find((n) => n.label === label);

describe("withActivity", () => {
  it("shows the area the agent is editing, then changed, then fading, then as before", async () => {
    const billing = (s: MapScreen) => node(s, "Billing");
    const editing = await view([], at + 2 * second);
    expect(billing(editing)).toMatchObject({
      state: "editing",
      statusText: en.status.agentEditing,
    });
    expect(editing.chat).toEqual({ kind: "editing", file: "lib/billing/charge.ts" });

    const justNow = await view([], at + 30 * second);
    expect(billing(justNow)?.state).toBe("changed");
    const later = await view([], at + 5 * minute);
    expect(billing(later)).toMatchObject({ state: "faded", minutesAgo: 5 });
    const gone = await view([], at + 31 * minute);
    expect(billing(gone)?.state).toBe("default");
    expect(gone.chat).toEqual({ kind: "idle" });
  });

  it("marks what is new: a module, a service, a function, and the calls to them", async () => {
    const system = await view([], at + 5 * minute);
    expect(node(system, "Stripe")?.state).toBe("new");
    const toStripe = system.map.edges.find((e) => e.to === "external:Stripe");
    expect(toStripe?.kind).toBe("new");

    const area = await view(["lib/billing"], at + 5 * minute);
    expect(node(area, "Dunning")?.state).toBe("new");

    const file = await view(toFunctions("lib/billing/charge.ts"), at + 5 * minute);
    expect(node(file, "refund")?.state).toBe("new");
    expect(node(file, "charge")?.state).toBe("faded");
    const toRetry = file.map.edges.find(
      (e) => e.from.endsWith("#charge") && e.to === "lib/billing/dunning",
    );
    expect(toRetry?.kind).toBe("new");
    const toSave = file.map.edges.find((e) => e.from.endsWith("#charge") && e.to === "lib/db");
    expect(toSave?.kind).toBe("call");
  });

  it("draws a new call as active while the agent is writing in its caller", async () => {
    const charge = "lib/billing/charge.ts";
    const file = await view(toFunctions(charge), at + 2 * second, charge);
    expect(node(file, "charge")?.state).toBe("editing");
    const toRetry = file.map.edges.find(
      (e) => e.from.endsWith("#charge") && e.to === "lib/billing/dunning",
    );
    expect(toRetry).toMatchObject({ kind: "active", strong: true });
    // A function being written is editing first, and new once the agent moves on.
    if (file.panel.kind !== "file") throw new Error("file panel");
    expect(file.panel.functions.find((f) => f.name === "refund")?.status).toBe("editing");
    const later = await view(toFunctions(charge), at + minute, charge);
    if (later.panel.kind !== "file") throw new Error("file panel");
    expect(later.panel.functions.find((f) => f.name === "refund")?.status).toBe("new");
  });

  it("does not mark a change that only moved lines", async () => {
    const [area, module] = toFunctions("lib/db/load.ts");
    const files = await view([area as string, module as string], at + 5 * minute);
    const load = files.map.nodes.find((n) => n.id === "lib/db/load.ts");
    expect(load).toBeDefined();
    expect(load?.state).toBe("default");
  });
});

describe("withActivity on a selected node", () => {
  it("keeps what the agent does in sight when a node is followed", async () => {
    const file = "lib/billing/charge.ts";
    const screen = withFocus(
      withActivity(
        await buildMap(after, project, toFunctions(file), { select: `${file}#refund` }),
        after,
        session,
        { now: at + 2 * second },
      ),
      `${file}#refund`,
    );
    const toRetry = screen.map.edges.find(
      (e) => e.from.endsWith("#charge") && e.to === "lib/billing/dunning",
    );
    expect(toRetry).toMatchObject({ kind: "active", strong: true });
    expect(node(screen, "charge")).toMatchObject({ state: "editing" });
    expect(node(screen, "charge")?.dimmed).toBeUndefined();
    const toSave = screen.map.edges.find((e) => e.from.endsWith("#charge") && e.to === "lib/db");
    expect(toSave?.kind).toBe("dimmed");
  });

  it("gives the selected module's own recent changes", async () => {
    const module = after.structure.moduleOf.get("lib/db/save.ts") as string;
    const area = after.structure.areaOf.get("lib/db/save.ts") as string;
    const screen = withActivity(
      await buildMap(after, project, [area], { select: module }),
      after,
      session,
      { now: at + 5 * minute },
    );
    expect(screen.panel.kind === "module" && screen.panel.recent).toEqual([]);
    const billing = after.structure.moduleOf.get("lib/billing/charge.ts") as string;
    const selected = withActivity(
      await buildMap(after, project, ["lib/billing"], { select: billing }),
      after,
      session,
      { now: at + 5 * minute },
    );
    expect(selected.panel.kind === "module" && selected.panel.recent.map((r) => r.id)).toEqual([
      "lib/billing/charge.ts",
    ]);
  });
});

describe("timeline", () => {
  it("lists what the code shows, most important first, with the minor changes counted", () => {
    const changes = timeline(session, after, { now: at + 5 * minute });
    expect(changes.since).toBe(en.clock(at - 10 * minute));
    expect(changes.minutes).toBe(15);
    expect(changes.structure.map((c) => c.title)).toEqual([
      en.changes.item.service("Stripe"),
      en.changes.item.module("Dunning"),
      en.changes.item.fileAdded("retry.ts"),
    ]);
    expect(changes.behavior).toEqual([
      {
        id: "file:lib/billing/charge.ts",
        title: en.changes.item.fileChanged("charge.ts"),
        time: en.clock(at),
        marker: "changed",
        line: en.changes.item.sentences([
          en.changes.item.added(["refund"]),
          en.changes.item.changed(["charge"]),
        ]),
      },
    ]);
    expect(changes.minor).toBe(1);
    const editing = timeline(session, after, { now: at + 2 * second });
    expect(editing.behavior[0]).toMatchObject({ marker: "editing", time: en.panel.now });
  });
});
