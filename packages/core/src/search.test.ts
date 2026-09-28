// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Analysis, analyse } from "./analyse.js";
import { search } from "./search.js";
import type { Session } from "./session.js";
import { en } from "./strings/en.js";

let root: string;
let analysis: Analysis;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "codemap-search-"));
  const files: Record<string, string> = {
    "lib/billing/invoices/sync-invoice.ts": "export function syncInvoice() {}\n",
    "lib/billing/webhook.ts":
      "export function handleInvoicePaid() {}\nexport function invoiceTotal() {}\nexport function refund() {}\n",
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  analysis = await analyse(root);
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("search", () => {
  it("finds functions, modules and files by what their name contains, those that start with it first", () => {
    const found = search(analysis, "invoice");
    expect(found.functions.map((f) => [f.before, f.match, f.after])).toEqual([
      ["", "invoice", "Total"],
      ["sync", "Invoice", ""],
      ["handle", "Invoice", "Paid"],
    ]);
    expect(found.functions[2]).toMatchObject({
      location: expect.stringContaining("webhook.ts"),
      opens: { level: "function", id: "lib/billing/webhook.ts" },
      select: "lib/billing/webhook.ts#handleInvoicePaid",
    });
    const file = found.modulesAndFiles.find((r) => r.kind === "file");
    expect(file).toMatchObject({ before: "sync-", match: "invoice", after: ".ts" });
    expect(file?.opens?.level).toBe("file");
    expect(found.ask).toEqual([{ id: "ask", name: en.palette.explainHow("invoice") }]);
  });

  it("marks what is being written, reading the session's changes once", () => {
    let reads = 0;
    // Only files() is read by the search; the rest of a session is not needed.
    const session = {
      files: () => {
        reads += 1;
        return [{ path: "lib/billing/webhook.ts", last: Date.now(), minor: false }];
      },
    } as unknown as Session;
    const found = search(analysis, "i", session);
    expect(found.functions.filter((f) => f.editing).map((f) => f.select)).toEqual(
      found.functions
        .filter((f) => f.select?.startsWith("lib/billing/webhook.ts"))
        .map((f) => f.select),
    );
    expect(found.functions.some((f) => f.editing)).toBe(true);
    expect(reads).toBe(1);
  });

  it("finds nothing for nothing typed", () => {
    expect(search(analysis, "  ")).toEqual({
      query: "  ",
      functions: [],
      modulesAndFiles: [],
      ask: [],
    });
  });
});
