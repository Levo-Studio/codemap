// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mappable } from "./repository.js";

// The repository mapped for the folder, or none where it is refused.
const repositoryOf = async (folder: string, home: string) => {
  const found = await mappable(folder, home);
  return "root" in found ? found.root : undefined;
};

let folder: string;
beforeEach(async () => {
  // Real, as the working folder always is: on macOS the temporary folder is
  // reached through a link.
  folder = await realpath(await mkdtemp(join(tmpdir(), "codemap-repository-")));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const gitAt = async (path: string) => {
  await mkdir(join(path, ".git"), { recursive: true });
  await writeFile(join(path, ".git/HEAD"), "ref: refs/heads/main\n");
};

describe("the repository Codemap maps", () => {
  it("is the one the folder is the root of", async () => {
    await gitAt(folder);
    expect(await repositoryOf(folder, "/elsewhere")).toBe(folder);
  });

  it("is the one a folder inside it belongs to, a package of a monorepo say", async () => {
    await gitAt(folder);
    await mkdir(join(folder, "packages/web"), { recursive: true });
    expect(await repositoryOf(join(folder, "packages/web"), "/elsewhere")).toBe(folder);
  });

  it("is found through the file a worktree or a submodule has for .git", async () => {
    await writeFile(join(folder, ".git"), "gitdir: /somewhere/.git/worktrees/one\n");
    expect(await repositoryOf(folder, "/elsewhere")).toBe(folder);
  });

  it("is none for a folder that is not in one", async () => {
    await mkdir(join(folder, "notes"));
    expect(await repositoryOf(join(folder, "notes"), "/elsewhere")).toBeUndefined();
  });

  it("is none where .git is not a repository: empty, or a file of something else", async () => {
    await mkdir(join(folder, "empty/.git"), { recursive: true });
    expect(await repositoryOf(join(folder, "empty"), "/elsewhere")).toBeUndefined();
    await mkdir(join(folder, "other"));
    await writeFile(join(folder, "other/.git"), "not a pointer\n");
    expect(await repositoryOf(join(folder, "other"), "/elsewhere")).toBeUndefined();
  });

  it("is the one the folder really is in, not the one a link to it sits in", async () => {
    await gitAt(join(folder, "repo"));
    await mkdir(join(folder, "plain"));
    await symlink(join(folder, "plain"), join(folder, "repo/linked"));
    expect(await repositoryOf(join(folder, "repo/linked"), "/elsewhere")).toBeUndefined();
    await symlink(join(folder, "repo"), join(folder, "to-repo"));
    expect(await repositoryOf(join(folder, "to-repo"), "/elsewhere")).toBe(join(folder, "repo"));
  });

  // What starts with a dot is never mapped, and asking for it by name does
  // not change that: git's own folder, tool folders, Codemap's own cache.
  it("is none for a hidden folder in it, git's own among them", async () => {
    await gitAt(folder);
    for (const hidden of [".git", ".git/objects", ".github", ".codemap", "app/.hidden/deep"]) {
      await mkdir(join(folder, hidden), { recursive: true });
      expect(await repositoryOf(join(folder, hidden), "/elsewhere")).toBeUndefined();
    }
  });

  it("is none where the repository is hidden itself, a ~/.oh-my-zsh say", async () => {
    await gitAt(join(folder, ".dotrepo"));
    await mkdir(join(folder, ".dotrepo/lib"));
    expect(await repositoryOf(join(folder, ".dotrepo"), "/elsewhere")).toBeUndefined();
    expect(await repositoryOf(join(folder, ".dotrepo/lib"), "/elsewhere")).toBeUndefined();
  });

  // Coding agents keep their worktrees in hidden folders of the project:
  // such a worktree is a repository of its own, and is mapped.
  it("is a worktree kept in a hidden folder, which is a repository of its own", async () => {
    await gitAt(join(folder, "repo"));
    await mkdir(join(folder, "repo/.tools/worktrees/feature"), { recursive: true });
    await writeFile(
      join(folder, "repo/.tools/worktrees/feature/.git"),
      "gitdir: ../../../.git/worktrees/feature\n",
    );
    const worktree = join(folder, "repo/.tools/worktrees/feature");
    expect(await repositoryOf(worktree, "/elsewhere")).toBe(worktree);
  });

  it("says why it refuses: a folder that is hidden, or one outside any repository", async () => {
    await gitAt(join(folder, "repo"));
    await mkdir(join(folder, "repo/.github"));
    await mkdir(join(folder, "plain"));
    expect(await mappable(join(folder, "repo/.github"), "/elsewhere")).toEqual({
      refused: "hidden",
    });
    expect(await mappable(join(folder, "plain"), "/elsewhere")).toEqual({ refused: "outside" });
  });

  // A home folder kept in git, for its dotfiles, would make every folder in
  // it a repository; the whole disk, if / were one.
  it("is none where the only repository around is the home folder itself", async () => {
    await gitAt(folder);
    await mkdir(join(folder, "Downloads"));
    expect(await repositoryOf(join(folder, "Downloads"), folder)).toBeUndefined();
    expect(await repositoryOf(folder, folder)).toBeUndefined();
    // Named through a link, or with a slash at the end, it is still home.
    await symlink(folder, `${folder}-home`);
    try {
      expect(await repositoryOf(join(folder, "Downloads"), `${folder}-home`)).toBeUndefined();
      expect(await repositoryOf(join(folder, "Downloads"), `${folder}/`)).toBeUndefined();
    } finally {
      await rm(`${folder}-home`, { force: true });
    }
  });
});
