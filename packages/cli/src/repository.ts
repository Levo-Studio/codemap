// SPDX-License-Identifier: Apache-2.0

import { open, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

// Codemap maps code kept in git, and never just a folder: the folder must be
// in a git repository's working tree, its root or any folder inside it. The
// repository is found by the .git its root holds, a folder with HEAD in it,
// or, for a worktree or a submodule, a file that points to one. Git is not
// run for this: looking is enough, and a repository's own config can make git
// run a command of its choosing.
//
// A repository whose root is the home folder, kept in git for its dotfiles,
// or the root of the disk does not count: it would make every folder in it
// one.

// How much of a .git file is read: its first line names where the repository is.
const pointerLimit = 4096;

async function isRepositoryAt(dotGit: string): Promise<boolean> {
  const found = await stat(dotGit).catch(() => undefined);
  if (found?.isDirectory()) {
    const head = await stat(join(dotGit, "HEAD")).catch(() => undefined);
    return head?.isFile() ?? false;
  }
  if (!found?.isFile()) return false;
  const handle = await open(dotGit, "r").catch(() => undefined);
  if (!handle) return false;
  try {
    const { buffer, bytesRead } = await handle.read({ buffer: Buffer.alloc(pointerLimit) });
    return /^gitdir: \S/.test(buffer.subarray(0, bytesRead).toString("utf8"));
  } finally {
    await handle.close();
  }
}

// The root of the repository the folder is in, or nothing.
export async function repositoryOf(
  folder: string,
  home: string = homedir(),
): Promise<string | undefined> {
  const tooWide = new Set([resolve(home)]);
  for (let at = resolve(folder); ; at = dirname(at)) {
    const top = dirname(at) === at;
    if (await isRepositoryAt(join(at, ".git"))) return top || tooWide.has(at) ? undefined : at;
    if (top) return undefined;
  }
}
