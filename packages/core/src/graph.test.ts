// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildGraph, type Graph } from "./graph.js";
import { parse } from "./parse.js";
import { createResolver } from "./resolve.js";
import { scan } from "./scan.js";

let root: string;

async function graphOf(tree: Record<string, string>): Promise<Graph> {
  for (const [path, content] of Object.entries(tree)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  const files = await scan(root);
  const parsed = await Promise.all(
    files.map(async (file) => {
      const source = await readFile(join(root, file.path), "utf8");
      return {
        ...file,
        lines: source.split("\n").length,
        facts: await parse(file.language.id, source),
      };
    }),
  );
  return buildGraph(
    parsed,
    await createResolver(
      root,
      files.map((f) => f.path),
    ),
  );
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "codemap-graph-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("buildGraph", () => {
  it("connects calls through imports, namespaces and the same file, counting repeats", async () => {
    const graph = await graphOf({
      "src/billing/webhook.ts": `import { recordEvent } from "./events";
import * as jobs from "../jobs/queue";
export function handlePaid() {
  recordEvent();
  recordEvent();
  jobs.enqueue();
  verify();
}
function verify() {}
`,
      "src/billing/events.ts": "export function recordEvent() {}\n",
      "src/jobs/queue.ts": "export function enqueue() {}\n",
    });
    const calls = graph.calls.map((c) => [
      c.from.symbol,
      `${c.to.file}#${c.to.symbol}`,
      c.confidence,
      c.count,
    ]);
    expect(calls).toEqual([
      ["handlePaid", "src/billing/events.ts#recordEvent", "resolved", 2],
      ["handlePaid", "src/jobs/queue.ts#enqueue", "resolved", 1],
      ["handlePaid", "src/billing/webhook.ts#verify", "resolved", 1],
    ]);
  });

  it("records calls into packages by the package they reach", async () => {
    const graph = await graphOf({
      "src/pay.ts": `import Stripe from "stripe";
const stripe = new Stripe("key");
export async function checkout() {
  await stripe.checkout.sessions.create({});
}
`,
    });
    expect(graph.packageCalls.map((c) => [c.from.symbol, c.name])).toEqual([[undefined, "stripe"]]);
    expect(graph.imports).toEqual([
      { from: "src/pay.ts", to: { kind: "package", name: "stripe" }, names: ["default"] },
    ]);
  });

  it("matches a call to the one exported symbol of that name, as uncertain, and leaves ambiguous names alone", async () => {
    const graph = await graphOf({
      "a.ts": "export function run() { helper(); shared(); }\n",
      "b.ts": "export function helper() {}\nexport function shared() {}\n",
      "c.ts": "export function shared() {}\n",
    });
    expect(graph.calls.map((c) => [`${c.to.file}#${c.to.symbol}`, c.confidence])).toEqual([
      ["b.ts#helper", "name"],
    ]);
  });

  it("connects Go calls through the package directory an import names", async () => {
    const graph = await graphOf({
      "go.mod": "module example.com/ledger\n",
      "main.go": `package main\n\nimport "example.com/ledger/billing"\n\nfunc main() {\n\tbilling.Charge()\n}\n`,
      "billing/charge.go": "package billing\n\nfunc Charge() {}\n",
    });
    expect(graph.calls.map((c) => [c.from.symbol, `${c.to.file}#${c.to.symbol}`])).toEqual([
      ["main", "billing/charge.go#Charge"],
    ]);
  });
});
