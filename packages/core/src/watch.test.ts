// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ChangeBatch, watch } from "./watch.js";

let root: string;
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "codemap-watch-")));
  await mkdir(join(root, "src"));
  await mkdir(join(root, "node_modules/x"), { recursive: true });
  await mkdir(join(root, ".codemap"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// Collects batches until one arrives that contains every expected path.
function batches() {
  const seen: ChangeBatch[] = [];
  let wake: () => void = () => {};
  return {
    seen,
    onChange: (batch: ChangeBatch) => {
      seen.push(batch);
      wake();
    },
    until: (paths: string[]) =>
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`no batch with ${paths}`)), 5000);
        wake = () => {
          const all = new Set(seen.flatMap((b) => b.paths));
          if (paths.every((p) => all.has(p))) {
            clearTimeout(timeout);
            resolve();
          }
        };
      }),
  };
}

describe("watch", () => {
  it("hands on changes as project-relative paths, several files as one batch", async () => {
    const b = batches();
    const watching = await watch(root, { onChange: b.onChange });
    try {
      const done = b.until(["src/a.ts", "src/b.ts"]);
      await writeFile(join(root, "src/a.ts"), "export const a = 1;\n");
      await writeFile(join(root, "src/b.ts"), "export const b = 1;\n");
      await done;
      expect(b.seen).toHaveLength(1);
      expect(b.seen[0]?.at).toBeGreaterThan(0);
    } finally {
      await watching.close();
    }
  });

  it("does not report Codemap's own cache or ignored folders", async () => {
    const b = batches();
    const watching = await watch(root, { onChange: b.onChange });
    try {
      const done = b.until(["src/c.ts"]);
      await writeFile(join(root, "node_modules/x/index.ts"), "export {};\n");
      await writeFile(join(root, ".codemap/index.sqlite"), "x");
      await writeFile(join(root, "src/c.ts"), "export {};\n");
      await done;
      const all = b.seen.flatMap((batch) => batch.paths);
      expect(all).toContain("src/c.ts");
      expect(all.filter((p) => p.startsWith("node_modules") || p.startsWith(".codemap"))).toEqual(
        [],
      );
    } finally {
      await watching.close();
    }
  });

  it("reports paths relative to a root reached through a symbolic link", async () => {
    const link = join(await mkdtemp(join(tmpdir(), "codemap-watch-link-")), "project");
    await symlink(root, link);
    const b = batches();
    const watching = await watch(link, { onChange: b.onChange });
    try {
      const done = b.until(["src/e.ts"]);
      await writeFile(join(root, "src/e.ts"), "export {};\n");
      await done;
    } finally {
      await watching.close();
      await rm(dirname(link), { recursive: true, force: true });
    }
  });
});
