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
// is the user's. So a change to how either is stored needs a migration of its
// own; raising this version does not clear them.
export const schemaVersion = 3;
const storedVersion = (reader: number) => schemaVersion * 1000 + reader;

export const cacheDirectory = ".codemap";
// The cache holds the user's chats and what their code does: theirs alone.
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
  // The questions asked in Ask and their answers.
  chats: ChatStore;
  close(): void;
}

// A cache that cannot be opened is rebuilt, and one of another version reads
// the code again (see prepare): what it keeps of the user's, their chats and
// the explanations they paid for, is only lost where it is not Codemap's own.
// One that another Codemap holds locked is left alone (see openCache).
function connect(file: string, expected: number, seal: string): DatabaseSync {
  const db = new DatabaseSync(file);
  try {
    return prepare(db, expected, seal);
  } catch (error) {
    db.close();
    throw error;
  }
}

// A cache carries the seal of the machine that wrote it. A repository can
// commit a filled .codemap/index.sqlite: facts that hide a function or invent
// a call, explanations that say something else than the code, planted chats.
// Its rows are keyed by hashes anyone can compute, so only the seal tells
// Codemap's own cache from one made elsewhere; one without this machine's is
// emptied, all of it, before anything in it is read. The seal says which
// machine wrote the cache, not what is in it: it guards against a cache that
// comes with a repository, not against someone who can write to the user's
// own files.
function sealed(db: DatabaseSync, seal: string): boolean {
  db.exec("CREATE TABLE IF NOT EXISTS seal (seal TEXT NOT NULL)");
  const row = db.prepare("SELECT seal FROM seal").get() as { seal: string } | undefined;
  const found = Buffer.from(row?.seal ?? "");
  const wanted = Buffer.from(seal);
  return found.length === wanted.length && timingSafeEqual(found, wanted);
}

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

// A chat as stored, or nothing if the row no longer reads as one: torn, or
// written in another shape.
function readChatRow(text: string): Chat | undefined {
  const chat = attempt(() => JSON.parse(text) as unknown, null);
  return isChat(chat) ? chat : undefined;
}

// Another Codemap on the same project may be writing to the cache (SQLite
// then answers "database is locked"). Waiting would stall this one, so
// whatever cannot be read or written now is simply not kept: what was read
// from the code is read again, and a chat stays in memory for the run.
function attempt<T, F>(action: () => T, fallback: F): T | F {
  try {
    return action();
  } catch {
    return fallback;
  }
}

// The cache is only used as Codemap makes it. A repository can commit
// .codemap, or a link inside it, pointing anywhere; writing, truncating or
// deleting through it would change files outside the project. So the folder
// must be a real one of this user's, nothing in it that Codemap writes may be
// a link, and .gitignore is opened without following one. Anything else is
// refused, and Codemap runs without a cache.
async function ownFolder(directory: string): Promise<void> {
  await mkdir(directory, { mode: privateFolder }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  const found = await lstat(directory);
  const mine = process.getuid === undefined || found.uid === process.getuid();
  if (!found.isDirectory() || !mine) throw new Error(`${directory} is not Codemap's own folder`);
  // Made readable by an older Codemap, or by hand: the user's alone again.
  await chmod(directory, privateFolder);
}

// A new file of the cache's, made the user's alone before anything is in it,
// without following a link. SQLite gives its journal the same permissions.
// The file opened is checked before anything is done to it, so one put
// there as a link between the look and the open is never written to.
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

// A file of the cache's own: a plain file, and no hard link to one elsewhere,
// which git cannot carry but an archive or another user can leave.
const isOwn = (found: Stats) => found.isFile() && found.nlink === 1;

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
    // Locked means another Codemap is writing to a good cache; deleting its
    // files from under it would lose what it writes. Only a file that is not
    // a cache, or a broken one, is thrown away; without the lock, this one
    // runs without a cache.
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
        // A row that no longer reads as a chat is left out, not the list.
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
