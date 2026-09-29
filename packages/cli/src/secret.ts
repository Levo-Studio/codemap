// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile } from "node:fs/promises";
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

export async function cacheSecret(env: NodeJS.ProcessEnv): Promise<string> {
  const folder = folderOf(env);
  const file = join(folder, "cache-secret");
  try {
    await mkdir(folder, { recursive: true, mode: privateFolder });
    const found = await lstat(file).catch(() => undefined);
    if (found && !found.isFile()) return fresh();
    if (found) {
      const kept = (await readFile(file, "utf8")).trim();
      if (/^[0-9a-f]+$/.test(kept) && kept.length === bytes * 2) return kept;
    }
    const secret = fresh();
    const flags =
      constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0);
    const handle = await open(file, flags, privateMode);
    try {
      await handle.chmod(privateMode);
      await handle.writeFile(secret);
    } finally {
      await handle.close();
    }
    return secret;
  } catch {
    return fresh();
  }
}
