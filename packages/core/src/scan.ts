// SPDX-License-Identifier: Apache-2.0

import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";
import ignore, { type Ignore } from "ignore";
import { type Language, languageOf } from "./languages.js";

export interface SourceFile {
  // Relative to the project root, with forward slashes on every platform.
  path: string;
  language: Language;
  size: number;
}

// Never part of the project's code: version control, Codemap's own cache.
const alwaysSkipped = new Set([".git", ".codemap"]);

// The defaults Settings shows under “Ignored paths”.
export const defaultIgnoredPaths = ["node_modules", ".next", "dist"] as const;

interface Scope {
  // The directory a .gitignore sits in, relative to the root.
  base: string;
  rules: Ignore;
}

async function gitignoreIn(directory: string): Promise<Ignore | undefined> {
  try {
    return ignore().add(await readFile(join(directory, ".gitignore"), "utf8"));
  } catch {
    return undefined;
  }
}

function ignoredBy(scopes: Scope[], path: string, directory: boolean): boolean {
  return scopes.some(({ base, rules }) => {
    const inner = base === "" ? path : posix.relative(base, path);
    return rules.ignores(directory ? `${inner}/` : inner);
  });
}

export interface ScanProgress {
  onFile?: (count: number) => void;
}

// Walks the project the way git sees it: every .gitignore applies to its own
// directory and below, plus the paths Settings ignores. Symbolic links are not
// followed, so a link back up the tree cannot loop.
export async function scan(
  root: string,
  ignoredPaths: readonly string[] = defaultIgnoredPaths,
  progress: ScanProgress = {},
): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  const settings: Scope = { base: "", rules: ignore().add([...ignoredPaths]) };

  async function walk(directory: string, scopes: Scope[]): Promise<void> {
    const here = relative(root, directory).split(sep).join("/");
    const own = await gitignoreIn(directory);
    const active = own ? [...scopes, { base: here, rules: own }] : scopes;
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (alwaysSkipped.has(entry.name) || entry.isSymbolicLink()) continue;
      const path = here === "" ? entry.name : `${here}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!ignoredBy(active, path, true)) await walk(join(directory, entry.name), active);
        continue;
      }
      if (!entry.isFile() || ignoredBy(active, path, false)) continue;
      const language = languageOf(entry.name);
      if (!language) continue;
      const { size } = await stat(join(directory, entry.name));
      files.push({ path, language, size });
      progress.onFile?.(files.length);
    }
  }

  await walk(root, [settings]);
  return files;
}
