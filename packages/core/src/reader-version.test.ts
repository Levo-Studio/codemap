// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parse, readerVersion } from "./parse.js";

// The cache keeps a file's facts for as long as its content and the reader
// version are the same. This test notices when what the reader gives back
// changes: then readerVersion is raised, and the new fingerprint is added
// under it, so no cache serves facts the old reader made.

const fingerprints: Record<number, string> = {
  1: "61c1ad4a040280aacca592a0f4199c0c45f4c408bebe1d68fbe6ea29e8cd3c2c",
};

const samples = [
  [
    "tsx",
    `"use client";
import { useState } from "react";
import { charge as pay } from "./billing";
export function Checkout() { const [a] = useState(0); return pay(a); }
export class Cart { add() { this.save(); } save() {} }
`,
  ],
  [
    "typescript",
    `import type { A } from "./a";\nexport const f = (a: A) => g(a);\nfunction g(a: A) {}\n`,
  ],
  ["javascript", `const x = require("x");\nmodule.exports = function run() { x.go(); };\n`],
  [
    "python",
    `import os\nfrom .billing import charge\n\nclass Cart:\n    def add(self):\n        charge(os.getcwd())\n`,
  ],
  [
    "go",
    `package main\n\nimport "fmt"\n\ntype Cart struct{}\n\nfunc (c Cart) Add() { fmt.Println(1) }\n\nfunc main() { Cart{}.Add() }\n`,
  ],
] as const;

describe("the reader version", () => {
  it("changes whenever the facts the reader gives back change", async () => {
    const facts = await Promise.all(samples.map(([language, source]) => parse(language, source)));
    const fingerprint = createHash("sha256").update(JSON.stringify(facts)).digest("hex");
    expect(fingerprint).toBe(fingerprints[readerVersion]);
  });
});
