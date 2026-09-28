// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { FileFacts } from "./parse.js";

// .codemap/ in the project root: what Codemap has already read, so the next
// start only reads what changed. It ignores itself with its own .gitignore;
// Codemap never touches the project's.

// Raised whenever what is stored changes shape. A cache of another version is
// thrown away and rebuilt, never read.
export const schemaVersion = 1;

export const cacheDirectory = ".codemap";

export function contentHash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

export interface Cache {
  // The facts stored for this path, if they were read from this content.
  facts(path: string, hash: string): FileFacts | undefined;
  store(path: string, hash: string, facts: FileFacts): void;
  // Forgets every path not in this list: files that were deleted or ignored.
  keepOnly(paths: readonly string[]): void;
  close(): void;
}

// A cache that cannot be opened, or holds another version, is rebuilt: it only
// ever saves time, so losing it costs one full read and nothing else.
function connect(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  const version = (db.prepare("PRAGMA user_version").get() as { user_version: number })
    .user_version;
  if (version !== schemaVersion) {
    db.exec("DROP TABLE IF EXISTS files");
    db.exec("CREATE TABLE files (path TEXT PRIMARY KEY, hash TEXT NOT NULL, facts TEXT NOT NULL)");
    db.exec(`PRAGMA user_version = ${schemaVersion}`);
  }
  return db;
}

export async function openCache(root: string): Promise<Cache> {
  const directory = join(root, cacheDirectory);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, ".gitignore"), "*\n");
  const file = join(directory, "index.sqlite");
  let db: DatabaseSync;
  try {
    db = connect(file);
  } catch {
    await Promise.all(
      ["", "-wal", "-shm"].map((suffix) => rm(`${file}${suffix}`, { force: true })),
    );
    db = connect(file);
  }

  const read = db.prepare("SELECT facts FROM files WHERE path = ? AND hash = ?");
  const write = db.prepare("INSERT OR REPLACE INTO files (path, hash, facts) VALUES (?, ?, ?)");
  const all = db.prepare("SELECT path FROM files");
  const remove = db.prepare("DELETE FROM files WHERE path = ?");

  // Writes of one run go into one transaction; one commit per file would sync
  // the disk thousands of times on a large project.
  let open = false;
  const flush = () => {
    if (open) db.exec("COMMIT");
    open = false;
  };

  return {
    facts(path, hash) {
      const row = read.get(path, hash) as { facts: string } | undefined;
      return row ? (JSON.parse(row.facts) as FileFacts) : undefined;
    },
    store(path, hash, facts) {
      if (!open) db.exec("BEGIN");
      open = true;
      write.run(path, hash, JSON.stringify(facts));
    },
    keepOnly(paths) {
      flush();
      const keep = new Set(paths);
      for (const row of all.all() as { path: string }[])
        if (!keep.has(row.path)) remove.run(row.path);
    },
    close() {
      flush();
      db.close();
    },
  };
}
