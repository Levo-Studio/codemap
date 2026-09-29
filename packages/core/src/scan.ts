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

// core.excludesFile in one file of git's config, read as git reads it: a
// section header, with a key on its line or the lines after; a value with
// quotes, escapes, a comment after it and a backslash that goes on to the
// next line. The last one named wins.
const keyAt = /[A-Za-z][A-Za-z0-9-]*/y;

function excludesFileIn(config: string): string | undefined {
  let at = 0;
  let core = false;
  let named: string | undefined;
  const skipSpace = () => {
    while (at < config.length && (config[at] === " " || config[at] === "\t")) at++;
  };
  const skipLine = () => {
    while (at < config.length && config[at] !== "\n") at++;
  };
  const value = () => {
    let text = "";
    let quoted = false;
    let spaces = "";
    while (at < config.length) {
      const char = config[at++] as string;
      if (char === "\\") {
        const next = config[at++];
        if (next === "\n") continue;
        if (next === "\r" && config[at] === "\n") {
          at++;
          continue;
        }
        text += spaces + (next === "n" ? "\n" : next === "t" ? "\t" : (next ?? ""));
        spaces = "";
      } else if (char === '"') quoted = !quoted;
      else if (char === "\n" || (!quoted && (char === ";" || char === "#"))) {
        if (char !== "\n") skipLine();
        break;
      } else if (!quoted && (char === " " || char === "\t" || char === "\r")) {
        if (text !== "") spaces += " ";
      } else {
        text += spaces + char;
        spaces = "";
      }
    }
    return text;
  };
  while (at < config.length) {
    skipSpace();
    const char = config[at];
    if (char === "[") {
      const close = config.indexOf("]", at);
      if (close < 0) break;
      core = /^\[\s*core\s*\]$/i.test(config.slice(at, close + 1));
      at = close + 1;
      continue;
    }
    keyAt.lastIndex = at;
    const key = keyAt.exec(config)?.[0];
    if (!key) {
      skipLine();
      at++;
      continue;
    }
    at += key.length;
    skipSpace();
    if (config[at] !== "=") {
      skipLine();
      continue;
    }
    at++;
    skipSpace();
    const found = value();
    if (core && key.toLowerCase() === "excludesfile") named = found;
  }
  return named;
}

// The user's own excludes, where git finds them: core.excludesFile in their
// global config (the file GIT_CONFIG_GLOBAL names, or else the git config of
// their config folder, then ~/.gitconfig), then in the project's own git
// config, the last one to name it winning, as git reads them; or else
// git/ignore in that folder. Includes and the system's config are not read.
export async function excludesFileOf(
  env: NodeJS.ProcessEnv = process.env,
  root?: string,
): Promise<string> {
  const home = env.HOME || homedir();
  const folder = env.XDG_CONFIG_HOME || join(home, ".config");
  const global = env.GIT_CONFIG_GLOBAL
    ? [env.GIT_CONFIG_GLOBAL]
    : [join(folder, "git", "config"), join(home, ".gitconfig")];
  let named: string | undefined;
  for (const file of [...global, ...(root ? [join(root, ".git", "config")] : [])]) {
    const config = await readFile(file, "utf8").catch(() => "");
    named = excludesFileIn(config) ?? named;
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
    rulesIn(progress.excludesFile ?? (await excludesFileOf(process.env, root)), true),
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
