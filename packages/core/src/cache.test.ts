// SPDX-License-Identifier: Apache-2.0

import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyse } from "./analyse.js";
import { type Chat, contentHash, openCache, privateFile, schemaVersion } from "./cache.js";
import type { FileFacts } from "./parse.js";

let root: string;
const chat = (id: string, at: number): Chat => ({
  id,
  at,
  question: `Question ${id}`,
  open: ["lib/billing"],
  answer: { question: `Question ${id}`, intro: "In two steps.", steps: [] },
});
// What this machine seals its caches with, in these tests.
const secret = "a secret of this machine's";
const facts: FileFacts = { imports: [], symbols: [], calls: [], directives: ["cached"] };

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "codemap-cache-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("the cache", () => {
  it("lives in .codemap/ and ignores itself", async () => {
    const cache = await openCache(root, { secret });
    cache.close();
    expect(await readFile(join(root, ".codemap/.gitignore"), "utf8")).toBe("*\n");
  });

  // A repository can commit a filled cache: facts that hide a function,
  // explanations that say something else than the code. Only a cache sealed
  // with this machine's secret is used; any other is rebuilt, whole.
  it("uses nothing of a cache it did not seal", async () => {
    const other = await openCache(root, { secret: "someone else's" });
    other.store("a.ts", contentHash("one"), facts);
    other.explanations.set("h1", { simple: "Formats a date.", technical: "`format`" });
    other.chats.add(chat("planted", 1));
    other.close();
    const cache = await openCache(root, { secret });
    expect(cache.facts("a.ts", contentHash("one"))).toBeUndefined();
    expect(cache.explanations.get("h1")).toBeUndefined();
    expect(cache.chats.list()).toEqual([]);
    cache.store("a.ts", contentHash("one"), facts);
    cache.close();
    const again = await openCache(root, { secret });
    expect(again.facts("a.ts", contentHash("one"))).toEqual(facts);
    again.close();
  });

  // It holds the user's chats and what their code does: only they may read it.
  it.skipIf(process.platform === "win32")(
    "can be read by its user alone, even where it was made readable before",
    async () => {
      await mkdir(join(root, ".codemap"));
      await chmod(join(root, ".codemap"), 0o755);
      const cache = await openCache(root, { secret });
      cache.store("a.ts", contentHash("one"), facts);
      const mode = async (name: string) => (await stat(join(root, ".codemap", name))).mode & 0o777;
      expect(await mode("")).toBe(0o700);
      for (const name of [".gitignore", "index.sqlite", "index.sqlite-wal"])
        expect(await mode(name)).toBe(0o600);
      cache.close();
    },
  );

  // A repository can commit .codemap, or a link inside it, pointing anywhere:
  // the cache is then not used, and nothing outside the project is touched.
  describe("committed as a link", () => {
    let outside: string;
    beforeEach(async () => {
      outside = await mkdtemp(join(tmpdir(), "codemap-outside-"));
      await writeFile(join(outside, "victim.txt"), "keep me\n");
    });
    afterEach(async () => {
      await rm(outside, { recursive: true, force: true });
    });

    it("is refused when .codemap itself links elsewhere", async () => {
      await symlink(outside, join(root, ".codemap"));
      await expect(openCache(root, { secret })).rejects.toThrow();
      expect(await readdir(outside)).toEqual(["victim.txt"]);
    });

    it("is refused when its .gitignore links elsewhere", async () => {
      await mkdir(join(root, ".codemap"));
      await symlink(join(outside, "victim.txt"), join(root, ".codemap/.gitignore"));
      await expect(openCache(root, { secret })).rejects.toThrow();
      expect(await readFile(join(outside, "victim.txt"), "utf8")).toBe("keep me\n");
    });

    // Git carries no hard links, but an archive or another user can leave
    // one: the file is then the same as one outside the project.
    it("is refused when a file of it is a hard link to one elsewhere", async () => {
      for (const name of [".gitignore", "index.sqlite"]) {
        await rm(join(root, ".codemap"), { recursive: true, force: true });
        await mkdir(join(root, ".codemap"));
        await link(join(outside, "victim.txt"), join(root, ".codemap", name));
        await expect(openCache(root, { secret })).rejects.toThrow();
        expect(await readFile(join(outside, "victim.txt"), "utf8")).toBe("keep me\n");
      }
    });

    // What was looked at is not always what is opened: a link can be put in
    // its place in between. The file opened is checked before it is touched.
    it("touches no file opened through a hard link, whatever was there when looked at", async () => {
      await mkdir(join(root, ".codemap"));
      const file = join(root, ".codemap/.gitignore");
      await link(join(outside, "victim.txt"), file);
      await expect(privateFile(file, true)).rejects.toThrow();
      expect(await readFile(join(outside, "victim.txt"), "utf8")).toBe("keep me\n");
    });

    it("is refused when its database or journal links elsewhere", async () => {
      for (const name of ["index.sqlite", "index.sqlite-wal", "index.sqlite-shm"]) {
        await rm(join(root, ".codemap"), { recursive: true, force: true });
        await mkdir(join(root, ".codemap"));
        await symlink(join(outside, "victim.txt"), join(root, ".codemap", name));
        await expect(openCache(root, { secret })).rejects.toThrow();
        expect(await readFile(join(outside, "victim.txt"), "utf8")).toBe("keep me\n");
      }
    });
  });

  it("gives back facts only for the content they were read from", async () => {
    const cache = await openCache(root, { secret });
    cache.store("a.ts", contentHash("one"), facts);
    expect(cache.facts("a.ts", contentHash("one"))).toEqual(facts);
    expect(cache.facts("a.ts", contentHash("two"))).toBeUndefined();
    cache.close();
  });

  it("keeps what it stored across runs, and forgets files that are gone", async () => {
    let cache = await openCache(root, { secret });
    cache.store("a.ts", "h", facts);
    cache.store("b.ts", "h", facts);
    cache.keepOnly(["a.ts"]);
    cache.close();
    cache = await openCache(root, { secret });
    expect(cache.facts("a.ts", "h")).toEqual(facts);
    expect(cache.facts("b.ts", "h")).toBeUndefined();
    cache.close();
  });

  it("rebuilds a cache of another schema version instead of reading it", async () => {
    let cache = await openCache(root, { secret });
    cache.store("a.ts", "h", facts);
    cache.close();
    const db = new DatabaseSync(join(root, ".codemap/index.sqlite"));
    db.exec(`PRAGMA user_version = ${schemaVersion + 1}`);
    db.close();
    cache = await openCache(root, { secret });
    expect(cache.facts("a.ts", "h")).toBeUndefined();
    cache.close();
  });

  it("forgets what an older reader stored, even for unchanged content", async () => {
    let cache = await openCache(root, { secret, reader: 1 });
    cache.store("a.ts", "h", facts);
    cache.close();
    cache = await openCache(root, { secret, reader: 2 });
    expect(cache.facts("a.ts", "h")).toBeUndefined();
    cache.close();
  });

  it("rebuilds a cache file that is not a database instead of crashing", async () => {
    await openCache(root, { secret }).then((c) => c.close());
    await writeFile(join(root, ".codemap/index.sqlite"), "not a database");
    const cache = await openCache(root, { secret });
    cache.store("a.ts", "h", facts);
    expect(cache.facts("a.ts", "h")).toEqual(facts);
    cache.close();
  });

  it("spares the parser on the next start for every file that did not change", async () => {
    await writeFile(join(root, "a.ts"), "export function one() {}\n");
    let cache = await openCache(root, { secret });
    await analyse(root, { cache });
    cache.close();
    // What the cache holds is what the next run uses: plant a marker in it.
    cache = await openCache(root, { secret });
    cache.store("a.ts", contentHash("export function one() {}\n"), facts);
    const second = await analyse(root, { cache });
    cache.close();
    expect(second.graph.files.get("a.ts")?.directives).toEqual(["cached"]);
  });

  it("keeps the layout of a place across runs", async () => {
    const layout = {
      nodes: new Map([["a", { x: 12, y: 12, width: 180, height: 72 }]]),
      routes: new Map([
        [
          "a>b",
          [
            { x: 192, y: 48 },
            { x: 252, y: 48 },
          ],
        ],
      ]),
      width: 192,
      height: 84,
    };
    let cache = await openCache(root, { secret });
    cache.layouts.set('{"level":"system"}', layout);
    cache.close();
    cache = await openCache(root, { secret });
    expect(cache.layouts.get('{"level":"system"}')).toEqual(layout);
    expect(cache.layouts.get('{"level":"area","area":"x"}')).toBeUndefined();
    cache.close();
  });

  it("is only skipped, never a failure, while another Codemap writes to it", async () => {
    const writing = await openCache(root, { secret });
    const other = await openCache(root, { secret });
    const layout = { nodes: new Map(), routes: new Map(), width: 0, height: 0 };
    writing.store("a.ts", "h", facts);
    expect(() => other.store("b.ts", "h", facts)).not.toThrow();
    expect(() => other.layouts.set("p", layout)).not.toThrow();
    expect(() => other.keepOnly(["b.ts"])).not.toThrow();
    writing.close();
    other.layouts.set("p", layout);
    expect(other.layouts.get("p")).toEqual(layout);
    other.close();
  });

  it("is not thrown away by a Codemap of another version while one writes to it", async () => {
    const writing = await openCache(root, { secret, reader: 1 });
    writing.store("a.ts", "h", facts);
    await openCache(root, { secret, reader: 2 }).then(
      (other) => other.close(),
      () => undefined,
    );
    writing.close();
    const again = await openCache(root, { secret, reader: 1 });
    expect(again.facts("a.ts", "h")).toEqual(facts);
    again.close();
  });

  it("keeps explanations and chats when what was read is thrown away", async () => {
    let cache = await openCache(root, { secret, reader: 1 });
    cache.store("a.ts", "h", facts);
    cache.explanations.set("h1", { simple: "Saves.", technical: "`save()`" });
    cache.chats.add(chat("c1", 1));
    cache.close();
    cache = await openCache(root, { secret, reader: 2 });
    expect(cache.facts("a.ts", "h")).toBeUndefined();
    expect(cache.explanations.get("h1")?.simple).toBe("Saves.");
    expect(cache.chats.get("c1")?.question).toBe("Question c1");
    cache.close();
  });

  it("keeps chats, the latest first, and gives each back whole", async () => {
    let cache = await openCache(root, { secret });
    cache.chats.add(chat("older", 1));
    cache.chats.add(chat("newer", 2));
    cache.close();
    cache = await openCache(root, { secret });
    expect(cache.chats.list()).toEqual([
      { id: "newer", at: 2, question: "Question newer", open: ["lib/billing"] },
      { id: "older", at: 1, question: "Question older", open: ["lib/billing"] },
    ]);
    expect(cache.chats.get("older")).toEqual(chat("older", 1));
    expect(cache.chats.get("none")).toBeUndefined();
    cache.close();
  });

  it("leaves out a chat row that no longer reads, not the list", async () => {
    let cache = await openCache(root, { secret });
    cache.chats.add(chat("kept", 1));
    cache.close();
    const db = new DatabaseSync(join(root, ".codemap/index.sqlite"));
    db.exec("INSERT INTO chats (id, at, question, chat) VALUES ('torn', 2, 'Torn?', '{\"id\":')");
    // Reads as JSON, but not as a chat.
    db.exec("INSERT INTO chats (id, at, question, chat) VALUES ('empty', 3, 'Empty?', '{}')");
    const bent = { ...chat("bent", 4), answer: { ...chat("bent", 4).answer, steps: [{ id: 1 }] } };
    db.prepare("INSERT INTO chats (id, at, question, chat) VALUES ('bent', 4, 'Bent?', ?)").run(
      JSON.stringify(bent),
    );
    db.close();
    cache = await openCache(root, { secret });
    expect(cache.chats.list().map((c) => c.id)).toEqual(["kept"]);
    expect(cache.chats.get("torn")).toBeUndefined();
    expect(cache.chats.get("empty")).toBeUndefined();
    expect(cache.chats.get("bent")).toBeUndefined();
    cache.close();
  });

  it("adds the chats to a cache written before there were any", async () => {
    let cache = await openCache(root, { secret });
    cache.close();
    const db = new DatabaseSync(join(root, ".codemap/index.sqlite"));
    db.exec("DROP TABLE chats");
    db.close();
    cache = await openCache(root, { secret });
    cache.chats.add(chat("c1", 1));
    expect(cache.chats.list()).toHaveLength(1);
    cache.close();
  });

  it("keeps explanations across runs by the hash they were written from", async () => {
    let cache = await openCache(root, { secret });
    cache.explanations.set("h1", { simple: "Saves the invoice.", technical: "Calls `save()`." });
    cache.close();
    cache = await openCache(root, { secret });
    expect(cache.explanations.get("h1")).toEqual({
      simple: "Saves the invoice.",
      technical: "Calls `save()`.",
    });
    expect(cache.explanations.get("h2")).toBeUndefined();
    cache.close();
  });
});
