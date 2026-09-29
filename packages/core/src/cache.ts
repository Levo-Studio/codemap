// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Answer } from "./ask.js";
import { shown } from "./design.js";
import { type FileFacts, readerVersion } from "./parse.js";
import type { ChatSummary, Point, Rect } from "./view.js";
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

// A question asked in Ask, with its answer and the nodes that were open when
// it was asked, so it can be shown again as it was.
export interface Chat {
  id: string;
  at: number;
  question: string;
  open: string[];
  answer: Answer;
}

export interface ChatStore {
  add(chat: Chat): void;
  // The latest first.
  list(): ChatSummary[];
  get(id: string): Chat | undefined;
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

// Raised whenever what is stored changes shape. What a cache of another
// version, or written by another reader version, read from the code is
// thrown away and read again, never used: unchanged content read by a
// changed reader gives other facts. Explanations and chats are kept: an
// explanation is found by the hash of what it was written from, and a chat
// is the user's.
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
  // The layout of the map for every set of opened nodes the user has seen,
  // so the map keeps its shape across restarts.
  layouts: LayoutStore;
  // Explanations by the hash of everything they were written from, so only
  // what changed is explained again.
  explanations: ExplanationStore;
  // The questions asked in Ask and their answers.
  chats: ChatStore;
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
    db.exec("CREATE TABLE files (path TEXT PRIMARY KEY, hash TEXT NOT NULL, facts TEXT NOT NULL)");
    db.exec("CREATE TABLE layouts (place TEXT PRIMARY KEY, layout TEXT NOT NULL)");
    db.exec(`PRAGMA user_version = ${expected}`);
  }
  db.exec(
    "CREATE TABLE IF NOT EXISTS explanations (key TEXT PRIMARY KEY, simple TEXT NOT NULL, technical TEXT NOT NULL)",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, at INTEGER NOT NULL, question TEXT NOT NULL, chat TEXT NOT NULL)",
  );
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
  const writeChat = db.prepare(
    "INSERT OR REPLACE INTO chats (id, at, question, chat) VALUES (?, ?, ?, ?)",
  );
  const listChats = db.prepare("SELECT chat FROM chats ORDER BY at DESC LIMIT ?");
  const readChat = db.prepare("SELECT chat FROM chats WHERE id = ?");

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
    chats: {
      add(chat) {
        attempt(
          () => writeChat.run(chat.id, chat.at, chat.question, JSON.stringify(chat)),
          undefined,
        );
      },
      list() {
        const rows = attempt(() => listChats.all(shown.chats) as { chat: string }[], []);
        return rows.map((row) => {
          const { id, at, question, open } = JSON.parse(row.chat) as Chat;
          return { id, at, question, open };
        });
      },
      get(id) {
        const row = attempt(() => readChat.get(id) as { chat: string } | undefined, undefined);
        return row ? (JSON.parse(row.chat) as Chat) : undefined;
      },
    },
    close() {
      flush();
      db.close();
    },
  };
}
