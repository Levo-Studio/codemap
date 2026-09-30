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

  it.skipIf(process.platform === "win32")(
    "follows the user's own excludes file where it is a link, as dotfiles often are",
    async () => {
      await files({ "a.ts": "", "config.local.ts": "" });
      const home = await mkdtemp(join(tmpdir(), "codemap-dotfiles-"));
      try {
        await writeFile(join(home, "ignore"), "*.local.ts\n");
        await symlink(join(home, "ignore"), join(home, "linked"));
        const found = await scan(root, undefined, { excludesFile: join(home, "linked") });
        expect(found.map((f) => f.path)).toEqual(["a.ts"]);
      } finally {
        await rm(home, { recursive: true, force: true });
      }
    },
  );

  it("finds the user's own excludes in the project's own git config, and in a global config git is pointed to", async () => {
    const home = await mkdtemp(join(tmpdir(), "codemap-home-"));
    try {
      await writeFile(join(home, ".gitconfig"), "[core]\n\texcludesFile = /from-home\n");
      await writeFile(join(home, "chosen"), "[core]\n\texcludesFile = /from-chosen\n");
      expect(await excludesFileOf({ HOME: home, GIT_CONFIG_GLOBAL: join(home, "chosen") })).toBe(
        "/from-chosen",
      );
      await mkdir(join(root, ".git"), { recursive: true });
      await writeFile(join(root, ".git/config"), "[core]\n\texcludesFile = /from-project\n");
      expect(await excludesFileOf({ HOME: home }, root)).toBe("/from-project");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("reads core.excludesFile as git does: escapes, a key beside its section, a value that goes on", async () => {
    const home = await mkdtemp(join(tmpdir(), "codemap-home-"));
    const of = async (config: string) => {
      await writeFile(join(home, ".gitconfig"), config);
      return excludesFileOf({ HOME: home });
    };
    try {
      expect(await of('[core]\n\texcludesFile = "/a\\"#b"\n')).toBe('/a"#b');
      expect(await of("[core]\n\texcludesFile = /a\\\\b\n")).toBe("/a\\b");
      expect(await of("[core] excludesFile = /beside\n")).toBe("/beside");
      expect(await of("[core]\n\texcludesFile = /goes\\\n/on\n")).toBe("/goes/on");
      // Whitespace inside a value that is not quoted is one space, as git has it.
      expect(await of("[core]\n\texcludesFile = /a\tb\n")).toBe("/a b");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("finds the user's own excludes from the environment it is given", async () => {
    await files({ "a.ts": "", "config.local.ts": "" });
    const home = await mkdtemp(join(tmpdir(), "codemap-home-"));
    try {
      await writeFile(join(home, "ignore"), "*.local.ts\n");
      await writeFile(
        join(home, ".gitconfig"),
        `[core]\n\texcludesFile = ${join(home, "ignore")}\n`,
      );
      const found = await scan(root, undefined, { env: { HOME: home } });
      expect(found.map((f) => f.path)).toEqual(["a.ts"]);
    } finally {
      await rm(home, { recursive: true, force: true });
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
      // Git reads its config folder's config first and ~/.gitconfig after:
      // the last one to name it wins. A comment after the value is no part of
      // it.
      await mkdir(join(home, ".config/git"), { recursive: true });
      await writeFile(
        join(home, ".config/git/config"),
        "[core]\n\texcludesfile = ~/xdg ignore ; mine\n",
      );
      expect(await excludesFileOf({ HOME: home })).toBe(join(home, "xdg ignore"));
      await writeFile(join(home, ".gitconfig"), "[core]\n  excludesFile = ~/home ignore # too\n");
      expect(await excludesFileOf({ HOME: home })).toBe(join(home, "home ignore"));
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

  // What starts with a dot is kept out of sight on purpose: environment
  // files, tool settings, hidden folders. It is never read, drawn or sent.
  it("reads nothing whose name starts with a dot, above all no environment file", async () => {
    await files({
      ".env": "SECRET=1",
      ".env.local.js": "export const secret = 1;",
      ".eslintrc.js": "module.exports = {};",
      ".storybook/main.ts": "export default {};",
      ".github/scripts/release.mjs": "",
      "app/.hidden/util.ts": "",
      "app/page.tsx": "",
    });
    expect(await paths()).toEqual(["app/page.tsx"]);
  });

  // Git can carry a .gitignore that is a link, to /dev/zero say: read, it
  // never ends. Only a plain file of a sane size is read for its rules.
  it.skipIf(process.platform === "win32")(
    "reads rules only from a plain file of a sane size, never through a link",
    async () => {
      await files({ "a.ts": "", "b.ts": "" });
      await symlink("/dev/zero", join(root, ".gitignore"));
      await mkdir(join(root, ".git/info"), { recursive: true });
      await writeFile(join(root, ".git/info/exclude"), `a.ts\n${"#".repeat(2 * 1024 * 1024)}\n`);
      expect(await paths()).toEqual(["a.ts", "b.ts"]);
    },
  );

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
