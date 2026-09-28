// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyse, lineCount } from "./analyse.js";

describe("lineCount", () => {
  it("does not count the empty line after a final newline", () => {
    expect(lineCount("a\nb\nc\n")).toBe(3);
    expect(lineCount("a\nb\nc")).toBe(3);
    expect(lineCount("")).toBe(0);
  });
});

describe("analyse", () => {
  it("reads again only the files that changed, and new ones, on a live update", async () => {
    const root = await mkdtemp(join(tmpdir(), "codemap-analyse-"));
    try {
      await writeFile(
        join(root, "a.ts"),
        `import { b } from "./b";\nexport function a() { b(); }\n`,
      );
      await writeFile(join(root, "b.ts"), "export function b() {}\n");
      await writeFile(join(root, "c.ts"), "export function c() {}\n");
      const first = await analyse(root);

      await writeFile(join(root, "b.ts"), "export function b() {}\nexport function b2() {}\n");
      await writeFile(
        join(root, "d.ts"),
        `import { c } from "./c";\nexport function d() { c(); }\n`,
      );
      const read: string[] = [];
      const next = await analyse(root, {
        previous: first,
        changed: new Set(["b.ts", "d.ts"]),
        read: async (path) => {
          read.push(path);
          return (await import("node:fs/promises")).readFile(join(root, path), "utf8");
        },
      });
      expect(read.sort()).toEqual(["b.ts", "d.ts"]);
      expect(next.graph.files.get("b.ts")?.symbols.map((s) => s.name)).toEqual(["b", "b2"]);
      expect(next.graph.calls.some((c) => c.from.file === "d.ts" && c.to.file === "c.ts")).toBe(
        true,
      );
      expect(next.graph.files.get("a.ts")).toEqual(first.graph.files.get("a.ts"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
