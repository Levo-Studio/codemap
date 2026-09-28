// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { Analysis } from "./analyse.js";
import { codeOf, richText, signatureOf } from "./panels.js";
import type { CodeSymbol } from "./parse.js";

const symbol = (name: string, startLine: number, endLine: number): CodeSymbol => ({
  name,
  kind: "function",
  startLine,
  endLine,
  exported: true,
});

describe("signatureOf", () => {
  it("splits a declaration into its keyword and its lines, up to where the body begins", () => {
    const source = [
      "import Stripe from 'stripe';",
      "export async function handleInvoicePaid(",
      "  event: Stripe.InvoicePaidEvent",
      "): Promise<void> {",
      "  return;",
      "}",
    ].join("\n");
    expect(signatureOf(symbol("handleInvoicePaid", 2, 6), source)).toEqual({
      keyword: "async function",
      lines: [" handleInvoicePaid(", "  event: Stripe.InvoicePaidEvent", "): Promise<void>"],
    });
  });

  it("reads Python and Go declarations too", () => {
    expect(
      signatureOf(symbol("charge", 1, 2), "def charge(amount: int) -> None:\n    pass\n"),
    ).toEqual({
      keyword: "def",
      lines: [" charge(amount: int) -> None"],
    });
    expect(
      signatureOf(symbol("Add", 1, 1), "func (c *Cart) Add(item Item) error { return nil }\n"),
    ).toEqual({ keyword: "func (c *Cart)", lines: [" Add(item Item) error"] });
  });

  it("keeps a return type written in braces, and names that start with $", () => {
    expect(
      signatureOf(
        symbol("shape", 1, 3),
        "function shape(): { a: string } {\n  return { a: '' };\n}\n",
      ),
    ).toEqual({ keyword: "function", lines: [" shape(): { a: string }"] });
    expect(signatureOf(symbol("$store", 1, 1), "export const $store = () => {};\n")).toEqual({
      keyword: "const",
      lines: [" $store = () =>"],
    });
  });

  it("shows the name alone without the source", () => {
    expect(signatureOf(symbol("charge", 1, 3), undefined)).toEqual({
      keyword: "",
      lines: ["charge"],
    });
  });
});

describe("richText", () => {
  it("draws what the explanation puts in backticks as code", () => {
    expect(richText("Handles the `invoice.paid` event in `billing_events`.")).toEqual([
      "Handles the ",
      { code: "invoice.paid" },
      " event in ",
      { code: "billing_events" },
      ".",
    ]);
  });
});

describe("codeOf", () => {
  const source = "import x from 'x';\nexport function a() {\n  return x;\n}\n";
  const analysis = {
    graph: {
      files: new Map([["src/a.ts", { path: "src/a.ts", symbols: [symbol("a", 2, 4)] }]]),
    },
  } as unknown as Analysis;
  const read = (path: string) => (path === "src/a.ts" ? source : undefined);

  it("gives a function's lines, or its whole file's, from where they start", () => {
    expect(codeOf(analysis, "src/a.ts", "a", read)).toEqual({
      path: "src/a.ts",
      startLine: 2,
      lines: ["export function a() {", "  return x;", "}"],
      cut: false,
    });
    expect(codeOf(analysis, "src/a.ts", undefined, read)?.lines).toHaveLength(4);
  });

  it("reads nothing the analysis does not know", () => {
    expect(codeOf(analysis, "../secret.ts", undefined, () => "secret")).toBeUndefined();
    expect(codeOf(analysis, "src/a.ts", "missing", read)).toBeUndefined();
  });
});
