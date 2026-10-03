// SPDX-License-Identifier: Apache-2.0

import { open, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

// Codemap maps only code kept in git: the folder must be a git repository's
// root or a folder inside its working tree. The repository is found by the
// .git at its root: a folder with HEAD in it or, for a worktree or a
// submodule, a file that points to one. Codemap never runs git for this,
// because a repository's own config can make git run any command.
//
// A repository whose root is the home folder (kept in git for dotfiles) or
// the root of the disk does not count, because it would make every folder in
// it mappable.

// How much of a .git file is read; its first line names the repository.
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

// The repository to map for the folder, or why there is none: the folder is
// hidden, or it is outside any repository. Both the folder and the home
// folder are resolved through links, so a link inside a repository to a
// folder outside it does not bring that folder in, and the home folder is
// recognised under any name.
export type Mappable = { root: string } | { refused: "hidden" | "outside" };

export async function mappable(folder: string, home: string = homedir()): Promise<Mappable> {
  const outside = { refused: "outside" } as const;
  const start = await real(folder);
  const tooWide = new Set([await real(home)]);
  for (let at = start; ; at = dirname(at)) {
    const top = dirname(at) === at;
    if (await isRepositoryAt(join(at, ".git"))) {
      if (top || tooWide.has(at)) return outside;
      // Nothing whose name starts with a dot is mapped, even when asked for
      // by name: a hidden folder in the repository (.git among them) or a
      // hidden repository itself, such as ~/.oh-my-zsh. Folders above the
      // repository root are not checked, so a worktree kept inside a hidden
      // folder is a repository of its own and is mapped.
      const parts = [basename(at), ...relative(at, start).split(sep)];
      return parts.some((part) => part.startsWith(".")) ? { refused: "hidden" } : { root: at };
    }
    if (top) return outside;
  }
}
