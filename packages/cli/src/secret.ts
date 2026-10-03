// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

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

const notCodemaps = (file: string) => `${file} is not Codemap's`;

// Symbolic links refused; hard links exist briefly while placing.
async function keptIn(file: string): Promise<string | null | undefined> {
  const found = await lstat(file).catch(() => undefined);
  if (!found) return undefined;
  if (!found.isFile()) throw new Error(notCodemaps(file));
  const kept = (await readFile(file, "utf8")).trim();
  return /^[0-9a-f]+$/.test(kept) && kept.length === bytes * 2 ? kept : null;
}

const noHardLinkCodes = new Set(["EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS", "EXDEV"]);

// O_EXCL and O_NOFOLLOW: new files only, never through links.
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

const keptOrFresh = async (file: string) => (await keptIn(file)) || fresh();

// Without hard links, O_EXCL allows one creator, not atomically.
async function createDirectly(file: string, secret: string): Promise<string> {
  try {
    await writeNew(file, secret);
    return secret;
  } catch {
    return keptOrFresh(file);
  }
}

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

// Moved aside at once; a secret placed meanwhile returns.
async function removeInvalid(
  file: string,
  place: (from: string, to: string) => Promise<void>,
): Promise<string | undefined> {
  const aside = `${file}.${fresh()}`;
  try {
    await rename(file, aside);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    const moved = await keptIn(aside);
    return moved ? await putInPlace(aside, file, moved, place) : undefined;
  } finally {
    await rm(aside, { force: true });
  }
}

// Linked in one step, so racing starts never see half.
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

// Seals this machine's caches; errors give a one-run secret.
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
    const back = kept === null ? await removeInvalid(file, place) : undefined;
    return back ?? (await placeNewSecret(file, place));
  } catch {
    return fresh();
  }
}
