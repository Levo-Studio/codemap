// SPDX-License-Identifier: Apache-2.0

import type { Dirent } from "node:fs";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import ignore, { type Ignore } from "ignore";
import { type Language, languageOf } from "./languages.js";
import { toPosix } from "./paths.js";

export interface SourceFile {
  path: string;
  language: Language;
  size: number;
}

// Dotfiles, environment secrets above all, are never read or sent.
const hidden = (name: string) => name.startsWith(".");

export const defaultIgnoredPaths = ["node_modules", ".next", "dist"] as const;

interface Scope {
  base: string;
  rules: Ignore;
}

const rulesLimit = 1024 * 1024;

async function rulesIn(file: string, follow = false): Promise<Ignore | undefined> {
  const text = await plainText(file, follow);
  if (text === undefined) return undefined;
  try {
    return ignore().add(text);
  } catch {
    // `ignore` throws on bad patterns like [z-a]; skip the file.
    return undefined;
  }
}

const gitignoreIn = (directory: string) => rulesIn(join(directory, ".gitignore"));

// A .gitignore linked to /dev/zero is not read.
async function plainText(file: string, follow = false): Promise<string | undefined> {
  try {
    const found = await (follow ? stat(file) : lstat(file));
    if (!found.isFile() || found.size > rulesLimit) return undefined;
    return await readFile(file, "utf8");
  } catch {
    return undefined;
  }
}

// A worktree shares info/exclude and config via its commondir.
async function gitDirOf(repository: string): Promise<string> {
  const dotGit = join(repository, ".git");
  const pointer = /^gitdir: (.+)$/m.exec((await plainText(dotGit)) ?? "")?.[1]?.trim();
  if (!pointer) return dotGit;
  const own = resolve(repository, pointer);
  const common = (await plainText(join(own, "commondir")))?.trim();
  return common ? resolve(own, common) : own;
}

const keyAt = /[A-Za-z][A-Za-z0-9-]*/y;

// Git is never run, because repository config can run commands.
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

// Global config, then repository config; the last value set wins.
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
  excludesFile?: string;
  repository?: string;
  env?: NodeJS.ProcessEnv;
}

// Real paths keep a symlinked project inside its repository.
async function projectInRepository(
  root: string,
  givenRepository: string,
): Promise<{ repository: string; prefix: string } | undefined> {
  const truePath = (path: string) => realpath(path).catch(() => resolve(path));
  const [real, repository] = await Promise.all([truePath(root), truePath(givenRepository)]);
  const above = relative(repository, real);
  if (above === ".." || above.startsWith(`..${sep}`) || isAbsolute(above)) return undefined;
  return { repository, prefix: toPosix(above) };
}

// An ignored folder above the project ignores all of it.
async function scopesDownTo(
  prefix: string,
  repository: string,
  machineScopes: Scope[],
): Promise<Scope[] | undefined> {
  let scopes = machineScopes;
  const parts = prefix === "" ? [] : prefix.split("/");
  for (let depth = 0; depth < parts.length; depth++) {
    const base = parts.slice(0, depth).join("/");
    const own = await gitignoreIn(join(repository, ...parts.slice(0, depth)));
    if (own) scopes = [...scopes, { base, rules: own }];
    if (ignoredBy(scopes, parts.slice(0, depth + 1).join("/"), true)) return undefined;
  }
  return scopes;
}

// Files excluded on this machine are never read or followed.
export async function scan(
  root: string,
  ignoredPaths: readonly string[] = defaultIgnoredPaths,
  progress: ScanProgress = {},
): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  const located = await projectInRepository(root, progress.repository ?? root);
  if (!located) return [];
  const { repository, prefix } = located;
  const fromGit = (path: string) =>
    prefix === "" ? path : path === "" ? prefix : `${prefix}/${path}`;
  const settings = ignore().add([...ignoredPaths]);
  const local = await Promise.all([
    rulesIn(join(await gitDirOf(repository), "info", "exclude")),
    rulesIn(progress.excludesFile ?? (await excludesFileOf(progress.env, repository)), true),
  ]);
  const scopes = await scopesDownTo(
    prefix,
    repository,
    local.flatMap((rules) => (rules ? [{ base: "", rules }] : [])),
  );
  if (!scopes) return [];

  async function walk(directory: string, inherited: Scope[]): Promise<void> {
    const here = toPosix(relative(root, directory));
    const own = await gitignoreIn(directory);
    const active = own ? [...inherited, { base: fromGit(here), rules: own }] : inherited;
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
