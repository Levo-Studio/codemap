// SPDX-License-Identifier: Apache-2.0

import { open, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const pointerLimit = 4096;

// Never runs git: a repository's config can run commands.
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

// Resolved through links, so a link cannot bring folders in.
const real = (path: string) => realpath(path).catch(() => resolve(path));

// Dot-named folders and repositories are never mapped, even by name.
function isHiddenWithin(repository: string, folder: string): boolean {
  const parts = [basename(repository), ...relative(repository, folder).split(sep)];
  return parts.some((part) => part.startsWith("."));
}

export type Mappable = { root: string } | { refused: "hidden" | "outside" };

// Home or disk-root repositories would make every folder mappable.
export async function mappable(folder: string, home: string = homedir()): Promise<Mappable> {
  const outside = { refused: "outside" } as const;
  const start = await real(folder);
  const tooWide = new Set([await real(home)]);
  for (let at = start; ; at = dirname(at)) {
    const top = dirname(at) === at;
    if (await isRepositoryAt(join(at, ".git"))) {
      if (top || tooWide.has(at)) return outside;
      return isHiddenWithin(at, start) ? { refused: "hidden" } : { root: at };
    }
    if (top) return outside;
  }
}
