// SPDX-License-Identifier: Apache-2.0

import type { Dirent } from "node:fs";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
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

// Rules are read only from a plain file of a sane size: git can carry a
// .gitignore that is a link, to /dev/zero say, which would never end. The
// user's own excludes file lies outside every project and is followed where
// it is a link, as dotfiles often are.
const rulesLimit = 1024 * 1024;

async function rulesIn(file: string, follow = false): Promise<Ignore | undefined> {
  try {
    const found = await (follow ? stat(file) : lstat(file));
    if (!found.isFile() || found.size > rulesLimit) return undefined;
    return ignore().add(await readFile(file, "utf8"));
  } catch {
    return undefined;
  }
}

const gitignoreIn = (directory: string) => rulesIn(join(directory, ".gitignore"));

// The value of a line of git's config, without a comment after it: ";" or
// "#" outside quotes starts one.
function configValue(raw: string): string {
  let value = "";
  let quoted = false;
  for (const char of raw) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === ";" || char === "#")) break;
    else value += char;
  }
  return value.trim();
}

// The user's own excludes, where git finds them: core.excludesFile in the
// git config of their config folder, then in ~/.gitconfig, the last one to
// name it winning, as git reads them; or else git/ignore in that folder.
// Includes are not followed.
export async function excludesFileOf(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const home = env.HOME || homedir();
  const folder = env.XDG_CONFIG_HOME || join(home, ".config");
  let named: string | undefined;
  for (const file of [join(folder, "git", "config"), join(home, ".gitconfig")]) {
    const config = await readFile(file, "utf8").catch(() => "");
    let core = false;
    for (const line of config.split("\n")) {
      const text = line.trim();
      if (text.startsWith("[")) core = /^\[core\]/i.test(text);
      const found = core && text.match(/^excludesfile\s*=\s*(.+)$/i);
      if (found) named = configValue(found[1] as string);
    }
  }
  if (!named) return join(folder, "git", "ignore");
  return named.startsWith("~/") ? join(home, named.slice(2)) : named;
}

function ignoredBy(scopes: Scope[], path: string, directory: boolean): boolean {
  return scopes.some(({ base, rules }) => {
    const inner = base === "" ? path : posix.relative(base, path);
    return rules.ignores(directory ? `${inner}/` : inner);
  });
}

export interface ScanProgress {
  onFile?: (count: number) => void;
  // The user's own excludes; found where git finds them when not given.
  excludesFile?: string;
}

// Walks the project the way git sees it: every .gitignore applies to its own
// directory and below, and what git excludes on this machine alone, in
// .git/info/exclude and the user's own excludes, applies from the root, as
// do the paths Settings ignores. What the user keeps out of git only here is
// often what must not leave the machine, code with a key pasted in, say; it
// is never read, and so never sent to a provider. Symbolic links are not
// followed, so a link back up the tree cannot loop.
export async function scan(
  root: string,
  ignoredPaths: readonly string[] = defaultIgnoredPaths,
  progress: ScanProgress = {},
): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  const settings: Scope = { base: "", rules: ignore().add([...ignoredPaths]) };
  const local = await Promise.all([
    rulesIn(join(root, ".git", "info", "exclude")),
    rulesIn(progress.excludesFile ?? (await excludesFileOf()), true),
  ]);
  const machine = local.flatMap((rules) => (rules ? [{ base: "", rules }] : []));

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

  await walk(root, [settings, ...machine]);
  return files;
}
