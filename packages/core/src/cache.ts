// SPDX-License-Identifier: Apache-2.0

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { chmod, lstat, mkdir, open, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Answer } from "./ask.js";
import { shown } from "./design.js";
import type { LayoutStore } from "./open-layout.js";
import { type FileFacts, readerVersion } from "./parse.js";
import type { ChatSummary, Point, Rect } from "./view.js";

// .codemap/ in the project root holds what Codemap has already read, so the
// next start only reads what changed. The folder ignores itself with its own
// .gitignore; Codemap never touches the project's.

// An explanation at both levels: Simple for anyone, Technical with inline code
// in backticks.
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

// Raised whenever the stored shape changes. Facts and layouts stored under
// another schema or parser version are dropped and read again, because the
// same content read by a changed parser gives other facts. Explanations and
// chats are kept: an explanation is keyed by the hash of what it was written
// from, and a chat belongs to the user. A change to how either is stored
// therefore needs its own migration; raising this version does not clear them.
export const schemaVersion = 3;
const storedVersion = (reader: number) => schemaVersion * 1000 + reader;

export const cacheDirectory = ".codemap";
// The cache holds the user's chats and what their code does, so only the user
// may read it.
const privateFolder = 0o700;
const privateMode = 0o600;

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
  chats: ChatStore;
  close(): void;
}

// Closes the database again when preparing it fails, so openCache can delete
// and rebuild a broken file, or pass a lock error on.
function connect(file: string, expected: number, seal: string): DatabaseSync {
  const db = new DatabaseSync(file);
  try {
    return prepare(db, expected, seal);
  } catch (error) {
    db.close();
    throw error;
  }
}

// A cache carries the seal of the machine that wrote it, an HMAC of a secret
// kept outside every project. A repository can commit a filled
// .codemap/index.sqlite with facts that hide a function or invent a call,
// explanations that contradict the code, or planted chats. Its rows are keyed
// by hashes anyone can compute, so only the seal tells Codemap's own cache
// from one made elsewhere. The seal says which machine wrote the cache, not
// what is in it: it guards against a cache shipped with a repository, not
// against someone who can already write to the user's files.
function sealed(db: DatabaseSync, seal: string): boolean {
  db.exec("CREATE TABLE IF NOT EXISTS seal (seal TEXT NOT NULL)");
  const row = db.prepare("SELECT seal FROM seal").get() as { seal: string } | undefined;
  const found = Buffer.from(row?.seal ?? "");
  const wanted = Buffer.from(seal);
  return found.length === wanted.length && timingSafeEqual(found, wanted);
}

// A cache without this machine's seal is emptied completely before anything
// in it is read. A cache of another version keeps only its explanations and
// chats (see schemaVersion).
function prepare(db: DatabaseSync, expected: number, seal: string): DatabaseSync {
  db.exec("PRAGMA journal_mode = WAL");
  if (!sealed(db, seal)) {
    for (const table of ["files", "layouts", "explanations", "chats", "seal"])
      db.exec(`DROP TABLE IF EXISTS ${table}`);
    db.exec("PRAGMA user_version = 0");
    db.exec("CREATE TABLE seal (seal TEXT NOT NULL)");
    db.prepare("INSERT INTO seal (seal) VALUES (?)").run(seal);
  }
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

const isString = (value: unknown): value is string => typeof value === "string";
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isStep = (step: unknown) =>
  isObject(step) && isString(step.id) && isString(step.name) && isString(step.text);
const isAnswer = (answer: unknown) =>
  isObject(answer) &&
  isString(answer.question) &&
  isString(answer.intro) &&
  Array.isArray(answer.steps) &&
  answer.steps.every(isStep);

const isChat = (value: unknown): value is Chat =>
  isObject(value) &&
  isString(value.id) &&
  typeof value.at === "number" &&
  isString(value.question) &&
  Array.isArray(value.open) &&
  value.open.every(isString) &&
  isAnswer(value.answer);

// Returns undefined for a row that no longer reads as a chat: torn, or written
// in another shape.
function readChatRow(text: string): Chat | undefined {
  const chat = attempt(() => JSON.parse(text) as unknown, null);
  return isChat(chat) ? chat : undefined;
}

// Another Codemap on the same project may be writing to the cache, and SQLite
// then answers "database is locked". Waiting would stall this one, so whatever
// cannot be read or written right now is skipped: facts are read from the code
// again, and a chat stays in memory for the run.
function attempt<T, F>(action: () => T, fallback: F): T | F {
  try {
    return action();
  } catch {
    return fallback;
  }
}

// The cache is used only in the form Codemap makes it. A repository can commit
// .codemap, or a link inside it, pointing anywhere, and writing, truncating or
// deleting through such a link would change files outside the project. So the
// folder must be a real directory owned by this user, no file Codemap writes
// in it may be a link, and .gitignore is opened without following links.
// Anything else is refused, and Codemap runs without a cache.
async function ownFolder(directory: string): Promise<void> {
  await mkdir(directory, { mode: privateFolder }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  const found = await lstat(directory);
  const mine = process.getuid === undefined || found.uid === process.getuid();
  if (!found.isDirectory() || !mine) throw new Error(`${directory} is not Codemap's own folder`);
  // A folder that others can read, made so by hand or by an earlier version,
  // becomes private again.
  await chmod(directory, privateFolder);
}

// A cache file must be a plain file and not a hard link to a file elsewhere,
// which git cannot carry but an archive or another user can leave behind.
const isOwn = (found: Stats) => found.isFile() && found.nlink === 1;

// Creates or opens a cache file without following a link and makes it private
// before anything is written; SQLite gives its journal files the same
// permissions. The opened handle is checked before use, so a link planted
// between the earlier check and the open is never written to. With truncate,
// the file's content is replaced with "*", the .gitignore that ignores the
// whole folder.
export async function privateFile(file: string, truncate: boolean): Promise<void> {
  const flags = constants.O_WRONLY | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0);
  const handle = await open(file, flags, privateMode);
  try {
    if (!isOwn(await handle.stat())) throw new Error(`${file} is not a file Codemap wrote`);
    await handle.chmod(privateMode);
    if (truncate) {
      await handle.truncate(0);
      await handle.writeFile("*\n");
    }
  } finally {
    await handle.close();
  }
}

async function refuseLinks(files: string[]): Promise<void> {
  for (const file of files) {
    const found = await lstat(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (found && !isOwn(found)) throw new Error(`${file} is not a file Codemap wrote`);
  }
}

async function writeIgnore(file: string): Promise<void> {
  await refuseLinks([file]);
  await privateFile(file, true);
}

interface CacheOptions {
  // This machine's secret, kept outside every project (see sealed).
  secret: string;
  // A parameter only so the tests can play an older reader.
  reader?: number;
}

export async function openCache(
  root: string,
  { secret, reader = readerVersion }: CacheOptions,
): Promise<Cache> {
  const seal = createHmac("sha256", secret).update("codemap cache").digest("hex");
  const directory = join(root, cacheDirectory);
  await ownFolder(directory);
  await writeIgnore(join(directory, ".gitignore"));
  const file = join(directory, "index.sqlite");
  const files = ["", "-wal", "-shm"].map((suffix) => `${file}${suffix}`);
  await refuseLinks(files);
  await privateFile(file, false);
  for (const journal of files.slice(1)) await chmod(journal, privateMode).catch(() => {});
  let db: DatabaseSync;
  try {
    db = connect(file, storedVersion(reader), seal);
  } catch (error) {
    // Locked means another Codemap is writing to a good cache, and deleting its
    // files from under it would lose what it writes, so the error is passed on
    // and this run goes without a cache. Only a file that is not a cache, or a
    // broken one, is deleted and rebuilt.
    if (/locked|busy/i.test(error instanceof Error ? error.message : "")) throw error;
    await refuseLinks(files);
    await Promise.all(files.map((path) => rm(path, { force: true })));
    await privateFile(file, false);
    db = connect(file, storedVersion(reader), seal);
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
  let inTransaction = false;
  const flush = () => {
    if (!inTransaction) return;
    inTransaction = false;
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
      if (!inTransaction)
        inTransaction = attempt(() => {
          db.exec("BEGIN IMMEDIATE");
          return true;
        }, false);
      if (inTransaction) attempt(() => write.run(path, hash, JSON.stringify(facts)), undefined);
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
        // A row that no longer reads as a chat is skipped; the rest of the
        // list is still returned.
        return rows.flatMap((row) => {
          const chat = readChatRow(row.chat);
          return chat
            ? [{ id: chat.id, at: chat.at, question: chat.question, open: chat.open }]
            : [];
        });
      },
      get(id) {
        const row = attempt(() => readChat.get(id) as { chat: string } | undefined, undefined);
        return row ? readChatRow(row.chat) : undefined;
      },
    },
    close() {
      flush();
      db.close();
    },
  };
}
