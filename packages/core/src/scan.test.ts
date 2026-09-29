// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { languageOf } from "./languages.js";
import { excludesFileOf, scan } from "./scan.js";

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

  // What the user keeps out of git only on their machine is often what must
  // not leave it: code with a key pasted in, say. It is not read, and so never
  // sent to a provider.
  it("respects what git excludes on this machine: .git/info/exclude and the user's own excludes", async () => {
    await files({
      "a.ts": "",
      "keys.ts": "",
      "config.local.ts": "",
      ".git/info/exclude": "keys.ts\n",
    });
    const excludes = join(root, "..", `${root.split("/").pop()}-excludes`);
    await writeFile(excludes, "*.local.ts\n");
    try {
      expect((await scan(root, undefined, { excludesFile: excludes })).map((f) => f.path)).toEqual([
        "a.ts",
      ]);
    } finally {
      await rm(excludes, { force: true });
    }
  });

  it("finds the user's own excludes where git does", async () => {
    const home = await mkdtemp(join(tmpdir(), "codemap-home-"));
    try {
      await writeFile(
        join(home, ".gitconfig"),
        '[user]\n  name = x\n[core]\n  excludesFile = "~/my ignore"\n',
      );
      expect(await excludesFileOf({ HOME: home })).toBe(join(home, "my ignore"));
      await writeFile(join(home, ".gitconfig"), "[user]\n  name = x\n");
      expect(await excludesFileOf({ HOME: home })).toBe(join(home, ".config/git/ignore"));
      expect(await excludesFileOf({ HOME: home, XDG_CONFIG_HOME: "/x" })).toBe("/x/git/ignore");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
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
