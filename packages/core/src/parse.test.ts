// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { parse } from "./parse.js";

describe("parse: TypeScript", () => {
  const source = `import Stripe from "stripe";
import { db, type Tx } from "../db";
import * as jobs from "./jobs";
export { plan } from "./plans";

export async function handleInvoicePaid(event: Stripe.Event) {
  await db.subscriptions.update(event);
  recordBillingEvent(event);
  jobs.enqueueReceipt();
}

const recordBillingEvent = (event: unknown) => {
  new Ledger();
};

export class Ledger {
  append(entry: string) {
    format(entry);
  }
}
`;

  it("reads imports with the names they bind in the file", async () => {
    const { imports } = await parse("typescript", source);
    expect(imports).toEqual([
      { specifier: "stripe", bindings: [{ local: "Stripe", imported: "default" }], line: 1 },
      {
        specifier: "../db",
        bindings: [
          { local: "db", imported: "db" },
          { local: "Tx", imported: "Tx" },
        ],
        line: 2,
      },
      { specifier: "./jobs", bindings: [{ local: "jobs", imported: "*" }], line: 3 },
      { specifier: "./plans", bindings: [{ local: "plan", imported: "plan" }], line: 4 },
    ]);
  });

  it("reads an aliased import under the name the file uses", async () => {
    const { imports } = await parse(
      "typescript",
      `import { charge as pay } from "./stripe";
`,
    );
    expect(imports[0]?.bindings).toEqual([{ local: "pay", imported: "charge" }]);
  });

  it("finds functions, arrow functions, classes and methods with their lines", async () => {
    const { symbols } = await parse("typescript", source);
    expect(symbols).toEqual([
      { name: "handleInvoicePaid", kind: "function", startLine: 6, endLine: 10, exported: true },
      { name: "recordBillingEvent", kind: "function", startLine: 12, endLine: 14, exported: false },
      { name: "Ledger", kind: "class", startLine: 16, endLine: 20, exported: true },
      {
        name: "append",
        kind: "method",
        startLine: 17,
        endLine: 19,
        exported: false,
        owner: "Ledger",
      },
    ]);
  });

  it("attributes each call to the innermost symbol it sits in", async () => {
    const { calls } = await parse("typescript", source);
    expect(calls).toEqual([
      { name: "update", receiver: "db.subscriptions", line: 7, caller: "handleInvoicePaid" },
      { name: "recordBillingEvent", line: 8, caller: "handleInvoicePaid" },
      { name: "enqueueReceipt", receiver: "jobs", line: 9, caller: "handleInvoicePaid" },
      { name: "Ledger", line: 13, caller: "recordBillingEvent" },
      { name: "format", line: 18, caller: "append" },
    ]);
  });
});

describe("parse: TSX and JavaScript", () => {
  it("treats capitalised functions as components and rendering them as calls", async () => {
    const { symbols, calls } = await parse(
      "tsx",
      `export default function Dashboard() {\n  return <Layout><PlanCard plan={p} /></Layout>;\n}\n`,
    );
    expect(symbols.map((s) => [s.name, s.kind])).toEqual([["Dashboard", "component"]]);
    expect(calls.map((c) => c.name)).toEqual(["Layout", "PlanCard"]);
  });

  it("reads require and dynamic import as imports", async () => {
    const { imports, calls } = await parse(
      "javascript",
      `const a = require("./a");\nconst b = import("./b");\na.run();\n`,
    );
    expect(imports.map((i) => i.specifier)).toEqual(["./a", "./b"]);
    expect(imports[0]?.bindings).toEqual([{ local: "a", imported: "*" }]);
    expect(calls).toEqual([{ name: "run", receiver: "a", line: 3 }]);
  });
});

describe("parse: directives", () => {
  it("reads the directive prologue, and only the prologue", async () => {
    const { directives } = await parse(
      "typescript",
      `"use server";\nimport x from "y";\n"not a directive";\n`,
    );
    expect(directives).toEqual(["use server"]);
  });
});

describe("parse: Python", () => {
  it("reads imports, functions, classes, methods and calls", async () => {
    const facts = await parse(
      "python",
      `import os\nfrom billing.stripe import charge as c, refund\n\nclass Invoice:\n    def total(self):\n        return sum(self.items)\n\ndef _send():\n    c()\n`,
    );
    expect(facts.imports).toEqual([
      { specifier: "os", bindings: [{ local: "os", imported: "*" }], line: 1 },
      {
        specifier: "billing.stripe",
        bindings: [
          { local: "c", imported: "charge" },
          { local: "refund", imported: "refund" },
        ],
        line: 2,
      },
    ]);
    expect(facts.symbols).toEqual([
      { name: "Invoice", kind: "class", startLine: 4, endLine: 6, exported: true },
      { name: "total", kind: "method", startLine: 5, endLine: 6, exported: true, owner: "Invoice" },
      { name: "_send", kind: "function", startLine: 8, endLine: 9, exported: false },
    ]);
    expect(facts.calls).toEqual([
      { name: "sum", line: 6, caller: "total" },
      { name: "c", line: 9, caller: "_send" },
    ]);
  });
});

describe("parse: Go", () => {
  it("reads imports, functions, methods with their receiver type, structs and calls", async () => {
    const facts = await parse(
      "go",
      `package billing\n\nimport (\n\t"fmt"\n\t"example.com/app/db"\n)\n\ntype Ledger struct{}\n\nfunc (l *Ledger) Append() {\n\tfmt.Println()\n}\n\nfunc charge() {\n\tdb.Save()\n}\n`,
    );
    expect(facts.imports.map((i) => [i.specifier, i.bindings[0]?.local])).toEqual([
      ["fmt", "fmt"],
      ["example.com/app/db", "db"],
    ]);
    expect(facts.symbols).toEqual([
      { name: "Ledger", kind: "class", startLine: 8, endLine: 8, exported: true },
      {
        name: "Append",
        kind: "method",
        startLine: 10,
        endLine: 12,
        exported: true,
        owner: "Ledger",
      },
      { name: "charge", kind: "function", startLine: 14, endLine: 16, exported: false },
    ]);
    expect(facts.calls).toEqual([
      { name: "Println", receiver: "fmt", line: 11, caller: "Append" },
      { name: "Save", receiver: "db", line: 15, caller: "charge" },
    ]);
  });
});
