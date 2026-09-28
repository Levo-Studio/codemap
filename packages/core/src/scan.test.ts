// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { languageOf } from "./languages.js";
import { scan } from "./scan.js";

let root: string;

async function files(tree: Record<string, string>) {
  for (const [path, content] of Object.entries(tree)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
}

const paths = async (ignored?: string[]) => (await scan(root, ignored)).map((f) => f.path);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "codemap-scan-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("scan", () => {
  it("finds source files in every language it reads, in a stable order", async () => {
    await files({
      "b.py": "",
      "a.ts": "",
      "src/c.tsx": "",
      "src/d.go": "",
      "e.mjs": "",
      "README.md": "",
    });
    expect(await paths()).toEqual(["a.ts", "b.py", "e.mjs", "src/c.tsx", "src/d.go"]);
  });

  it("respects .gitignore at the root and in subdirectories, relative to where it sits", async () => {
    await files({
      ".gitignore": "build/\n*.gen.ts\n",
      "a.ts": "",
      "x.gen.ts": "",
      "build/b.ts": "",
      "pkg/.gitignore": "local.ts\n",
      "pkg/local.ts": "",
      "pkg/kept.ts": "",
      "local.ts": "",
    });
    expect(await paths()).toEqual(["a.ts", "local.ts", "pkg/kept.ts"]);
  });

  it("skips version control, its own cache and the paths Settings ignores", async () => {
    await files({
      ".git/x.ts": "",
      ".codemap/y.ts": "",
      "node_modules/z/i.js": "",
      "dist/o.js": "",
      "k.ts": "",
    });
    expect(await paths()).toEqual(["k.ts"]);
    expect(await paths([])).toEqual(["dist/o.js", "k.ts", "node_modules/z/i.js"]);
  });

  it("does not follow symbolic links, so a link up the tree cannot loop", async () => {
    await files({ "src/a.ts": "" });
    await symlink(root, join(root, "src/loop"));
    expect(await paths()).toEqual(["src/a.ts"]);
  });
});

describe("languageOf", () => {
  it("leaves out declaration files, which have no behaviour", () => {
    expect(languageOf("types.d.ts")).toBeUndefined();
    expect(languageOf("index.ts")?.id).toBe("typescript");
    expect(languageOf("page.tsx")?.id).toBe("tsx");
  });
});
