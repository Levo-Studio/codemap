// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { repositoryOf } from "./repository.js";

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "codemap-repository-"));
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

  // A home folder kept in git, for its dotfiles, would make every folder in
  // it a repository; the whole disk, if / were one.
  it("is none where the only repository around is the home folder itself", async () => {
    await gitAt(folder);
    await mkdir(join(folder, "Downloads"));
    expect(await repositoryOf(join(folder, "Downloads"), folder)).toBeUndefined();
    expect(await repositoryOf(folder, folder)).toBeUndefined();
  });
});
