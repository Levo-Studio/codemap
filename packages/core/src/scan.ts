// SPDX-License-Identifier: Apache-2.0

import type { Dirent } from "node:fs";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import ignore, { type Ignore } from "ignore";
import { type Language, languageOf } from "./languages.js";

export interface SourceFile {
  // Relative to the project root, with forward slashes on every platform.
  path: string;
  language: Language;
  size: number;
}

// Never read, drawn or sent: whatever starts with a dot is kept out of sight
// on purpose. Environment files with their secrets above all, then tool
// settings and hidden folders, among them version control and Codemap's own
// cache. A .gitignore is still read for its rules, never as code.
const hidden = (name: string) => name.startsWith(".");

// The defaults Settings shows under “Ignored paths”.
export const defaultIgnoredPaths = ["node_modules", ".next", "dist"] as const;

interface Scope {
  // The directory a .gitignore sits in, relative to the repository's root.
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

// A plain file of a sane size, or nothing: what a repository's .git holds is
// the repository's to choose, a link to /dev/zero among it.
async function plainText(file: string): Promise<string | undefined> {
  try {
    const found = await lstat(file);
    if (!found.isFile() || found.size > rulesLimit) return undefined;
    return await readFile(file, "utf8");
  } catch {
    return undefined;
  }
}

// Where git keeps the repository's own files, info/exclude and config among
// them: its .git folder, or for a worktree or a submodule the folder its .git
// file names. A worktree's .git names a folder inside the main repository's
// .git, whose info/exclude and config every worktree shares; commondir says
// where that is.
async function gitDirOf(repository: string): Promise<string> {
  const dotGit = join(repository, ".git");
  const pointer = /^gitdir: (.+)$/m.exec((await plainText(dotGit)) ?? "")?.[1]?.trim();
  if (!pointer) return dotGit;
  const own = resolve(repository, pointer);
  const common = (await plainText(join(own, "commondir")))?.trim();
  return common ? resolve(own, common) : own;
}

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
// their config folder, then ~/.gitconfig), then in the repository's config,
// a worktree's being its main repository's, the last one to name it winning,
// as git reads them; or else git/ignore in that folder. Includes, a
// worktree's own config.worktree and the system's config are not read.
export async function excludesFileOf(
  env: NodeJS.ProcessEnv = process.env,
  repository?: string,
): Promise<string> {
  const home = env.HOME || homedir();
  const folder = env.XDG_CONFIG_HOME || join(home, ".config");
  const global = env.GIT_CONFIG_GLOBAL
    ? [env.GIT_CONFIG_GLOBAL]
    : [join(folder, "git", "config"), join(home, ".gitconfig")];
  const configs = [
    ...(await Promise.all(global.map((file) => readFile(file, "utf8").catch(() => "")))),
    ...(repository ? [(await plainText(join(await gitDirOf(repository), "config"))) ?? ""] : []),
  ];
  let named: string | undefined;
  for (const config of configs) named = excludesFileIn(config) ?? named;
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
  // The user's own excludes; found where git finds them when not given, in
  // the environment Codemap was started with.
  excludesFile?: string;
  // The root of the repository the project is in, when the project is a
  // folder inside it rather than its root.
  repository?: string;
  env?: NodeJS.ProcessEnv;
}

// Walks the project the way git sees it from the repository's root, whether
// the project is that root or a folder inside it: every .gitignore applies
// to its own directory and below, those of the folders above the project
// included, and what git excludes on this machine alone, in
// .git/info/exclude and the user's own excludes, applies from the
// repository's root; the paths Settings ignores apply from the project's
// root. A project inside a folder git keeps out has nothing to read. Where
// git would take a file back with a ! rule of another file, it stays out:
// the scan errs towards leaving out, never towards reading. What the user
// keeps out of git only here is often what must not leave the machine, code
// with a key pasted in, say; it is never read, and so never sent to a
// provider. Symbolic links are not followed, so a link back up the tree
// cannot loop.
export async function scan(
  root: string,
  ignoredPaths: readonly string[] = defaultIgnoredPaths,
  progress: ScanProgress = {},
): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  // Where the project lies in the repository, as git sees it: both taken as
  // they really are, so a project reached through a link is still inside.
  // A project said to be in a repository it is not inside is read by no
  // rules of that repository, so nothing of it is read at all.
  const [real, repository] = (await Promise.all(
    [root, progress.repository ?? root].map((path) => realpath(path).catch(() => resolve(path))),
  )) as [string, string];
  const above = relative(repository, real);
  if (above === ".." || above.startsWith(`..${sep}`) || isAbsolute(above)) return [];
  const prefix = above.split(sep).join("/");
  const fromGit = (path: string) =>
    prefix === "" ? path : path === "" ? prefix : `${prefix}/${path}`;
  const settings = ignore().add([...ignoredPaths]);
  const local = await Promise.all([
    rulesIn(join(await gitDirOf(repository), "info", "exclude")),
    rulesIn(progress.excludesFile ?? (await excludesFileOf(progress.env, repository)), true),
  ]);
  let scopes: Scope[] = local.flatMap((rules) => (rules ? [{ base: "", rules }] : []));
  // The folders from the repository's root down to the project: a .gitignore
  // in each applies, and one git keeps out keeps out all of the project.
  const parts = prefix === "" ? [] : prefix.split("/");
  for (let depth = 0; depth < parts.length; depth++) {
    const base = parts.slice(0, depth).join("/");
    const own = await gitignoreIn(join(repository, ...parts.slice(0, depth)));
    if (own) scopes = [...scopes, { base, rules: own }];
    if (ignoredBy(scopes, parts.slice(0, depth + 1).join("/"), true)) return [];
  }

  async function walk(directory: string, scopes: Scope[]): Promise<void> {
    const here = relative(root, directory).split(sep).join("/");
    const own = await gitignoreIn(directory);
    const active = own ? [...scopes, { base: fromGit(here), rules: own }] : scopes;
    const ignored = (path: string, isDirectory: boolean) =>
      settings.ignores(isDirectory ? `${path}/` : path) ||
      ignoredBy(active, fromGit(path), isDirectory);
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (hidden(entry.name) || entry.isSymbolicLink()) continue;
      const path = here === "" ? entry.name : `${here}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!ignored(path, true)) await walk(join(directory, entry.name), active);
        continue;
      }
      if (!entry.isFile() || ignored(path, false)) continue;
      const language = languageOf(entry.name);
      if (!language) continue;
      const { size } = await stat(join(directory, entry.name));
      files.push({ path, language, size });
      progress.onFile?.(files.length);
    }
  }

  await walk(root, scopes);
  return files;
}
