// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Analysis, analyse } from "./analyse.js";
import { Session } from "./session.js";

let root: string;
const write = async (path: string, content: string) => {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "codemap-session-"));
  await write(
    "lib/billing/charge.ts",
    `import { save } from "../db/save";\nexport function charge() {\n  save();\n}\n`,
  );
  await write("lib/db/save.ts", "export function save() {}\n");
  await write("lib/db/load.ts", "export function load() {}\n");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function change(previous: Analysis, paths: string[]) {
  return analyse(root, { previous, changed: new Set(paths) });
}

describe("Session", () => {
  it("records what each change did, and what is new since the start", async () => {
    const start = await analyse(root);
    const session = new Session(start, 1000);

    await write(
      "lib/billing/charge.ts",
      `import { save } from "../db/save";\nimport { retry } from "../dunning/retry";\nexport function charge() {\n  save();\n  retry();\n}\nexport function refund() {}\n`,
    );
    await write(
      "lib/dunning/retry.ts",
      `import Stripe from "stripe";\nexport function retry() { new Stripe("k"); }\n`,
    );
    await write("lib/db/load.ts", "// Loads a row.\nexport function load() {}\n");
    const paths = ["lib/billing/charge.ts", "lib/dunning/retry.ts", "lib/db/load.ts"];
    const next = await change(start, paths);
    session.record(start, next, paths, 2000);

    const charge = session.changeOf("lib/billing/charge.ts");
    expect(charge).toMatchObject({
      first: 2000,
      last: 2000,
      added: false,
      minor: false,
      symbolsAdded: ["refund"],
      symbolsChanged: ["charge"],
    });
    expect(session.changeOf("lib/dunning/retry.ts")).toMatchObject({
      added: true,
      symbolsAdded: ["retry"],
    });
    expect(session.changeOf("lib/db/load.ts")).toMatchObject({ minor: true, symbolsChanged: [] });
    expect(session.symbol("lib/billing/refund.ts", "refund")).toBeUndefined();
    expect(session.symbol("lib/billing/charge.ts", "refund")).toEqual({
      changed: 2000,
      added: true,
    });
    expect(
      session
        .arrived()
        .map((a) => `${a.kind}:${a.name}`)
        .sort(),
    ).toEqual(expect.arrayContaining(["service:Stripe"]));
    expect(session.arrived().some((a) => a.kind === "area" || a.kind === "module")).toBe(true);
    expect(session.hadFileCall("lib/billing/charge.ts", "lib/db/save.ts")).toBe(true);
    expect(session.hadFileCall("lib/billing/charge.ts", "lib/dunning/retry.ts")).toBe(false);
  });

  it("keeps the first time a file changed and moves the last, latest first", async () => {
    const start = await analyse(root);
    const session = new Session(start, 1000);
    await write("lib/db/save.ts", "export function save() { return 1; }\n");
    let next = await change(start, ["lib/db/save.ts"]);
    session.record(start, next, ["lib/db/save.ts"], 2000);
    await write("lib/db/load.ts", "export function load() { return 2; }\n");
    const after = await change(next, ["lib/db/load.ts"]);
    session.record(next, after, ["lib/db/load.ts"], 3000);
    next = after;
    await write("lib/db/save.ts", "export function save() { return 3; }\n");
    const last = await change(next, ["lib/db/save.ts"]);
    session.record(next, last, ["lib/db/save.ts"], 4000);
    expect(session.files().map((f) => [f.path, f.first, f.last])).toEqual([
      ["lib/db/save.ts", 2000, 4000],
      ["lib/db/load.ts", 3000, 3000],
    ]);
  });

  it("records a removed file as removed", async () => {
    const start = await analyse(root);
    const session = new Session(start);
    await rm(join(root, "lib/db/load.ts"));
    const next = await change(start, ["lib/db/load.ts"]);
    session.record(start, next, ["lib/db/load.ts"], 2000);
    expect(session.changeOf("lib/db/load.ts")).toMatchObject({ removed: true, added: false });
  });
});
