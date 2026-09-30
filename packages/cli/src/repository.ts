// SPDX-License-Identifier: Apache-2.0

import { open, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

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

const real = (path: string) => realpath(path).catch(() => resolve(path));

// The root of the repository the folder is in, or nothing. The folder is
// taken as it really is: a link inside a repository to a folder outside it
// does not bring that folder in, and the home folder is known under any name.
export async function repositoryOf(
  folder: string,
  home: string = homedir(),
): Promise<string | undefined> {
  const start = await real(folder);
  const tooWide = new Set([await real(home)]);
  for (let at = start; ; at = dirname(at)) {
    const top = dirname(at) === at;
    if (await isRepositoryAt(join(at, ".git"))) {
      if (top || tooWide.has(at)) return undefined;
      // What starts with a dot is never mapped, even asked for by name: a
      // hidden folder in the repository, git's own among them, or a
      // repository that is hidden itself (a ~/.oh-my-zsh). Folders above it
      // are not the project's: a worktree an agent keeps in a hidden folder
      // is a repository of its own, and is mapped.
      const parts = [basename(at), ...relative(at, start).split(sep)];
      return parts.some((part) => part.startsWith(".")) ? undefined : at;
    }
    if (top) return undefined;
  }
}
