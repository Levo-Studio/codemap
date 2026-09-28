// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyse } from "./analyse.js";
import { contentHash, openCache, schemaVersion } from "./cache.js";
import type { FileFacts } from "./parse.js";

let root: string;
const facts: FileFacts = { imports: [], symbols: [], calls: [], directives: ["cached"] };

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "codemap-cache-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("the cache", () => {
  it("lives in .codemap/ and ignores itself", async () => {
    const cache = await openCache(root);
    cache.close();
    expect(await readFile(join(root, ".codemap/.gitignore"), "utf8")).toBe("*\n");
  });

  it("gives back facts only for the content they were read from", async () => {
    const cache = await openCache(root);
    cache.store("a.ts", contentHash("one"), facts);
    expect(cache.facts("a.ts", contentHash("one"))).toEqual(facts);
    expect(cache.facts("a.ts", contentHash("two"))).toBeUndefined();
    cache.close();
  });

  it("keeps what it stored across runs, and forgets files that are gone", async () => {
    let cache = await openCache(root);
    cache.store("a.ts", "h", facts);
    cache.store("b.ts", "h", facts);
    cache.keepOnly(["a.ts"]);
    cache.close();
    cache = await openCache(root);
    expect(cache.facts("a.ts", "h")).toEqual(facts);
    expect(cache.facts("b.ts", "h")).toBeUndefined();
    cache.close();
  });

  it("rebuilds a cache of another schema version instead of reading it", async () => {
    let cache = await openCache(root);
    cache.store("a.ts", "h", facts);
    cache.close();
    const db = new DatabaseSync(join(root, ".codemap/index.sqlite"));
    db.exec(`PRAGMA user_version = ${schemaVersion + 1}`);
    db.close();
    cache = await openCache(root);
    expect(cache.facts("a.ts", "h")).toBeUndefined();
    cache.close();
  });

  it("rebuilds a cache file that is not a database instead of crashing", async () => {
    await openCache(root).then((c) => c.close());
    await writeFile(join(root, ".codemap/index.sqlite"), "not a database");
    const cache = await openCache(root);
    cache.store("a.ts", "h", facts);
    expect(cache.facts("a.ts", "h")).toEqual(facts);
    cache.close();
  });

  it("spares the parser on the next start for every file that did not change", async () => {
    await writeFile(join(root, "a.ts"), "export function one() {}\n");
    let cache = await openCache(root);
    await analyse(root, { cache });
    cache.close();
    // What the cache holds is what the next run uses: plant a marker in it.
    cache = await openCache(root);
    cache.store("a.ts", contentHash("export function one() {}\n"), facts);
    const second = await analyse(root, { cache });
    cache.close();
    expect(second.graph.files.get("a.ts")?.directives).toEqual(["cached"]);
  });
});
