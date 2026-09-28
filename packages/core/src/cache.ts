// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { type FileFacts, readerVersion } from "./parse.js";
import type { Point, Rect } from "./view.js";
import type { LayoutStore } from "./views.js";

// One explanation in the user's words: Simple for anyone, Technical with
// inline code in backticks.
export interface Explanation {
  simple: string;
  technical: string;
}

export interface ExplanationStore {
  get(key: string): Explanation | undefined;
  set(key: string, explanation: Explanation): void;
}

// A layout as the database keeps it: maps as lists of entries.
interface StoredLayout {
  nodes: [string, Rect][];
  routes: [string, Point[]][];
  width: number;
  height: number;
}
// .codemap/ in the project root: what Codemap has already read, so the next
// start only reads what changed. It ignores itself with its own .gitignore;
// Codemap never touches the project's.

// Raised whenever what is stored changes shape. A cache of another version,
// or written by another reader version, is thrown away and rebuilt, never
// read: unchanged content read by a changed reader gives other facts.
export const schemaVersion = 3;
const storedVersion = (reader: number) => schemaVersion * 1000 + reader;

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
  // The layout of every place the user has seen, so the map keeps its shape
  // across restarts.
  layouts: LayoutStore;
  // Explanations by the hash of everything they were written from, so only
  // what changed is explained again.
  explanations: ExplanationStore;
  close(): void;
}

// A cache that cannot be opened, or holds another version, is rebuilt: it only
// ever saves time, so losing it costs one full read and nothing else. One
// that another Codemap holds locked is left alone (see openCache).
function connect(file: string, expected: number): DatabaseSync {
  const db = new DatabaseSync(file);
  try {
    return prepare(db, expected);
  } catch (error) {
    db.close();
    throw error;
  }
}

function prepare(db: DatabaseSync, expected: number): DatabaseSync {
  db.exec("PRAGMA journal_mode = WAL");
  const version = (db.prepare("PRAGMA user_version").get() as { user_version: number })
    .user_version;
  if (version !== expected) {
    db.exec("DROP TABLE IF EXISTS files");
    db.exec("DROP TABLE IF EXISTS layouts");
    db.exec("DROP TABLE IF EXISTS explanations");
    db.exec("CREATE TABLE files (path TEXT PRIMARY KEY, hash TEXT NOT NULL, facts TEXT NOT NULL)");
    db.exec("CREATE TABLE layouts (place TEXT PRIMARY KEY, layout TEXT NOT NULL)");
    db.exec(
      "CREATE TABLE explanations (key TEXT PRIMARY KEY, simple TEXT NOT NULL, technical TEXT NOT NULL)",
    );
    db.exec(`PRAGMA user_version = ${expected}`);
  }
  return db;
}

// Another Codemap on the same project may be writing to the cache (SQLite
// then answers "database is locked"). Waiting would stall this one, and the
// cache only saves time, so whatever cannot be read or written now is simply
// not cached.
function attempt<T, F>(action: () => T, fallback: F): T | F {
  try {
    return action();
  } catch {
    return fallback;
  }
}

// The reader version is a parameter only so the tests can play an older one.
export async function openCache(root: string, reader = readerVersion): Promise<Cache> {
  const directory = join(root, cacheDirectory);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, ".gitignore"), "*\n");
  const file = join(directory, "index.sqlite");
  let db: DatabaseSync;
  try {
    db = connect(file, storedVersion(reader));
  } catch (error) {
    // Locked means another Codemap is writing to a good cache; deleting its
    // files from under it would lose what it writes. Only a file that is not
    // a cache, or a broken one, is thrown away; without the lock, this one
    // runs without a cache.
    if (/locked|busy/i.test(error instanceof Error ? error.message : "")) throw error;
    await Promise.all(
      ["", "-wal", "-shm"].map((suffix) => rm(`${file}${suffix}`, { force: true })),
    );
    db = connect(file, storedVersion(reader));
  }

  const read = db.prepare("SELECT facts FROM files WHERE path = ? AND hash = ?");
  const write = db.prepare("INSERT OR REPLACE INTO files (path, hash, facts) VALUES (?, ?, ?)");
  const all = db.prepare("SELECT path FROM files");
  const remove = db.prepare("DELETE FROM files WHERE path = ?");
  const readLayout = db.prepare("SELECT layout FROM layouts WHERE place = ?");
  const writeLayout = db.prepare("INSERT OR REPLACE INTO layouts (place, layout) VALUES (?, ?)");
  const readExplanation = db.prepare("SELECT simple, technical FROM explanations WHERE key = ?");
  const writeExplanation = db.prepare(
    "INSERT OR REPLACE INTO explanations (key, simple, technical) VALUES (?, ?, ?)",
  );

  // Writes of one run go into one transaction; one commit per file would sync
  // the disk thousands of times on a large project.
  let open = false;
  const flush = () => {
    if (!open) return;
    open = false;
    const committed = attempt(() => {
      db.exec("COMMIT");
      return true;
    }, false);
    if (!committed) attempt(() => db.exec("ROLLBACK"), undefined);
  };

  return {
    facts(path, hash) {
      const row = attempt(() => read.get(path, hash) as { facts: string } | undefined, undefined);
      return row ? (JSON.parse(row.facts) as FileFacts) : undefined;
    },
    store(path, hash, facts) {
      if (!open)
        open = attempt(() => {
          db.exec("BEGIN IMMEDIATE");
          return true;
        }, false);
      if (open) attempt(() => write.run(path, hash, JSON.stringify(facts)), undefined);
    },
    keepOnly(paths) {
      flush();
      const keep = new Set(paths);
      attempt(() => {
        for (const row of all.all() as { path: string }[])
          if (!keep.has(row.path)) remove.run(row.path);
      }, undefined);
    },
    layouts: {
      get(place) {
        const row = attempt(
          () => readLayout.get(place) as { layout: string } | undefined,
          undefined,
        );
        if (!row) return undefined;
        const stored = JSON.parse(row.layout) as StoredLayout;
        return { ...stored, nodes: new Map(stored.nodes), routes: new Map(stored.routes) };
      },
      set(place, layout) {
        const stored: StoredLayout = {
          nodes: [...layout.nodes],
          routes: [...layout.routes],
          width: layout.width,
          height: layout.height,
        };
        attempt(() => writeLayout.run(place, JSON.stringify(stored)), undefined);
      },
    },
    explanations: {
      get(key) {
        return attempt(() => readExplanation.get(key) as Explanation | undefined, undefined);
      },
      set(key, explanation) {
        attempt(
          () => writeExplanation.run(key, explanation.simple, explanation.technical),
          undefined,
        );
      },
    },
    close() {
      flush();
      db.close();
    },
  };
}
