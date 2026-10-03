// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// The secret that seals the caches Codemap writes on this machine, so a cache
// a repository commits is never used (see the seal in core's cache). It is
// random and kept in the user's config folder, which no project reaches.
// Where it cannot be kept there, a fresh secret is made for this run: every
// cache is then rebuilt at start, and nothing planted in one is read.

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

// This message is never shown: cacheSecret turns any failure into a secret
// for this run.
const notCodemaps = (file: string) => `${file} is not Codemap's`;

// The kept secret: undefined when there is no file, null when the file does
// not hold a valid secret. Anything but a regular file, a symbolic link
// included, is refused. A hard link is accepted: putting the secret in place
// creates one for a moment, and only the user can create one in their own
// config folder.
async function keptIn(file: string): Promise<string | null | undefined> {
  const found = await lstat(file).catch(() => undefined);
  if (!found) return undefined;
  if (!found.isFile()) throw new Error(notCodemaps(file));
  const kept = (await readFile(file, "utf8")).trim();
  return /^[0-9a-f]+$/.test(kept) && kept.length === bytes * 2 ? kept : null;
}

// The error codes a file system without hard links answers with.
const noHardLinkCodes = new Set(["EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS", "EXDEV"]);

// Creates the file only if it does not exist (O_EXCL), never through a
// symbolic link (O_NOFOLLOW), readable by the user alone.
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
const keptOrFresh = async (file: string) => (await keptIn(file)) || fresh();

// On a file system without hard links the file is created directly with
// O_EXCL: only one Codemap can create it, but the write is not atomic.
async function createDirectly(file: string, secret: string): Promise<string> {
  try {
    await writeNew(file, secret);
    return secret;
  } catch {
    return keptOrFresh(file);
  }
}

// Puts the draft in place as the secret file and returns the secret the file
// then holds.
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
    if (code === "EEXIST") return keptOrFresh(file);
    if (!noHardLinkCodes.has(code)) throw error;
  }
  return createDirectly(file, secret);
}

// A file without a valid secret is removed first, so every Codemap
// starting now puts its new secret in place in the same single step. A
// Codemap that found the file invalid just before another wrote a new one
// removes that one too and goes on with its own; the cost is one rebuild.
async function removeInvalid(file: string): Promise<void> {
  await rm(file, { force: true });
}

// The secret is written whole to a draft beside the file, then linked into
// place in one step: a second Codemap starting at the same moment finds
// either no file or a complete one, and uses the one that is there.
async function placeNewSecret(
  file: string,
  place: (from: string, to: string) => Promise<void>,
): Promise<string> {
  const secret = fresh();
  const draft = `${file}.${fresh()}`;
  await writeNew(draft, secret);
  try {
    return await putInPlace(draft, file, secret, place);
  } finally {
    await rm(draft, { force: true });
  }
}

// The secret that seals this machine's caches. `place` puts it in place, a
// hard link by default; the tests pass one that plays a file system without
// links.
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
    if (kept === null) await removeInvalid(file);
    return await placeNewSecret(file, place);
  } catch {
    return fresh();
  }
}
