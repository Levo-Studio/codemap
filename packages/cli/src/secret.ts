// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// What seals the caches Codemap writes on this machine, so that one a
// repository commits is never used (see the seal in core's cache): a random
// secret of the user's, in their own config folder, which no project reaches.
// Where it cannot be kept there, one for this run: every cache is then
// rebuilt at the start, and nothing planted in one is read.

const bytes = 32;
const privateFolder = 0o700;
const privateMode = 0o600;

const fresh = () => randomBytes(bytes).toString("hex");

function folderOf(env: NodeJS.ProcessEnv): string {
  const base =
    env.XDG_CONFIG_HOME ||
    (process.platform === "win32" ? env.APPDATA : undefined) ||
    join(env.HOME || homedir(), ".config");
  return join(base, "codemap");
}

// Never shown: any failure here ends in a secret for this run.
const notCodemaps = (file: string) => `${file} is not Codemap's`;

// The secret kept, if there is one: undefined where there is none, null
// where the file does not hold one. A symbolic link in its place is refused;
// a second name for it is what putting it in place makes for a moment, and
// only the user can make one in their own config folder.
async function keptIn(file: string): Promise<string | null | undefined> {
  const found = await lstat(file).catch(() => undefined);
  if (!found) return undefined;
  if (!found.isFile()) throw new Error(notCodemaps(file));
  const kept = (await readFile(file, "utf8")).trim();
  return /^[0-9a-f]+$/.test(kept) && kept.length === bytes * 2 ? kept : null;
}

// What a file system without hard links answers when asked for one.
const noLinks = new Set(["EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS", "EXDEV"]);

// A file made new, or not at all, never through a link, the user's alone.
async function writeNew(file: string, text: string): Promise<void> {
  const flags =
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0);
  const handle = await open(file, flags, privateMode);
  try {
    await handle.writeFile(text);
  } finally {
    await handle.close();
  }
}

// The secret another Codemap put in place first, or one for this run.
const theirs = async (file: string) => (await keptIn(file)) || fresh();

// Puts the drafted secret in place as the file, and answers the secret the
// file then holds.
async function putInPlace(
  draft: string,
  file: string,
  secret: string,
  place: (from: string, to: string) => Promise<void>,
): Promise<string> {
  try {
    await place(draft, file);
    return secret;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "";
    if (code === "EEXIST") return theirs(file);
    if (!noLinks.has(code)) throw error;
  }
  // A file system without second names for a file: made in place, which
  // only one Codemap can do, if not whole at once.
  try {
    await writeNew(file, secret);
    return secret;
  } catch {
    return theirs(file);
  }
}

// How the secret is put in place; the tests play a file system without links.
export async function cacheSecret(
  env: NodeJS.ProcessEnv,
  place: (from: string, to: string) => Promise<void> = link,
): Promise<string> {
  const folder = folderOf(env);
  const file = join(folder, "cache-secret");
  try {
    await mkdir(folder, { recursive: true, mode: privateFolder });
    const kept = await keptIn(file);
    if (kept) return kept;
    // One that does not read is taken away first, so that putting the new
    // one in place is the same one step for every Codemap starting now. One
    // that found it unreadable just before another put a new one there takes
    // that away too, and goes on with its own: the cost is one rebuild.
    if (kept === null) await rm(file, { force: true });
    // Written whole beside it first, then put in place in one step: a second
    // Codemap starting at the same moment finds either none or this one, and
    // takes the one that is there.
    const secret = fresh();
    const draft = `${file}.${fresh()}`;
    await writeNew(draft, secret);
    try {
      return await putInPlace(draft, file, secret, place);
    } finally {
      await rm(draft, { force: true });
    }
  } catch {
    return fresh();
  }
}
