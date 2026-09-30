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

  // Started in one folder of a repository, a package of a monorepo say, the
  // folder is read as git sees it from the repository's root: what the root
  // and the folders between keep out of git stays out.
  it("reads a folder of a repository with the rules of the repository around it", async () => {
    await files({
      ".git/HEAD": "ref: refs/heads/main\n",
      ".git/info/exclude": "local.ts\n",
      ".gitignore": "secret.ts\n/pkg/web/top.ts\n",
      "pkg/.gitignore": "*.gen.ts\n",
      "pkg/web/ok.ts": "",
      "pkg/web/secret.ts": "",
      "pkg/web/local.ts": "",
      "pkg/web/top.ts": "",
      "pkg/web/api.gen.ts": "",
      "pkg/web/src/deep.ts": "",
    });
    const found = await scan(join(root, "pkg/web"), undefined, {
      repository: root,
      excludesFile: join(root, "none"),
    });
    expect(found.map((f) => f.path)).toEqual(["ok.ts", "src/deep.ts"]);
  });

  it.skipIf(process.platform === "win32")(
    "reads a folder reached through a link by the rules of the repository it is in",
    async () => {
      await files({
        ".git/HEAD": "ref: refs/heads/main\n",
        ".gitignore": "secret.ts\n",
        "pkg/web/ok.ts": "",
        "pkg/web/secret.ts": "",
      });
      const elsewhere = await mkdtemp(join(tmpdir(), "codemap-link-"));
      try {
        await symlink(join(root, "pkg/web"), join(elsewhere, "web"));
        const found = await scan(join(elsewhere, "web"), undefined, {
          repository: root,
          excludesFile: join(root, "none"),
        });
        expect(found.map((f) => f.path)).toEqual(["ok.ts"]);
      } finally {
        await rm(elsewhere, { recursive: true, force: true });
      }
    },
  );

  it("reads nothing of a folder said to be in a repository it is not inside", async () => {
    await files({ "repo/.git/HEAD": "ref: refs/heads/main\n", "elsewhere/a.ts": "" });
    const found = await scan(join(root, "elsewhere"), undefined, {
      repository: join(root, "repo"),
      excludesFile: join(root, "none"),
    });
    expect(found).toEqual([]);
  });

  it("reads nothing of a folder the repository keeps out of git", async () => {
    await files({
      ".git/HEAD": "ref: refs/heads/main\n",
      ".gitignore": "generated/\n",
      "generated/web/a.ts": "",
    });
    const found = await scan(join(root, "generated/web"), undefined, {
      repository: root,
      excludesFile: join(root, "none"),
    });
    expect(found).toEqual([]);
  });

  // A worktree's .git is a file naming its folder in the main repository's
  // .git, whose info/exclude and config every worktree shares, as git does.
  it("respects the main repository's local excludes in a worktree", async () => {
    await files({
      "main/.git/HEAD": "ref: refs/heads/main\n",
      "main/.git/info/exclude": "keys.ts\n",
      "main/.git/config": "[core]\n\texcludesFile = /from-main\n",
      "main/.git/worktrees/wt/HEAD": "ref: refs/heads/wt\n",
      "main/.git/worktrees/wt/commondir": "../..\n",
      "wt/.git": `gitdir: ${join(root, "main/.git/worktrees/wt")}\n`,
      "wt/a.ts": "",
      "wt/keys.ts": "",
    });
    const worktree = join(root, "wt");
    const found = await scan(worktree, undefined, { excludesFile: join(root, "none") });
    expect(found.map((f) => f.path)).toEqual(["a.ts"]);
    expect(await excludesFileOf({ HOME: join(root, "home") }, worktree)).toBe("/from-main");
  });

  // A submodule's .git names its folder under the parent's .git/modules, a
  // path relative to the submodule.
  it("respects a submodule's own local excludes, where its .git file points", async () => {
    await files({
      ".git/modules/sub/HEAD": "ref: refs/heads/main\n",
      ".git/modules/sub/info/exclude": "keys.ts\n",
      "sub/.git": "gitdir: ../.git/modules/sub\n",
      "sub/a.ts": "",
      "sub/keys.ts": "",
    });
    const found = await scan(join(root, "sub"), undefined, { excludesFile: join(root, "none") });
    expect(found.map((f) => f.path)).toEqual(["a.ts"]);
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
