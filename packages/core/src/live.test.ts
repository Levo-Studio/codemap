// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyse } from "./analyse.js";
import { live as live_ } from "./design.js";
import { startLive } from "./live.js";
import { type ChangeBatch, watchEarly } from "./watch.js";

let root: string;
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "codemap-live-")));
  await writeFile(join(root, "a.ts"), "export function a() {}\n");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// Changes handed in by the test instead of the file watcher.
function manual() {
  let emit: (batch: ChangeBatch) => void = () => {};
  return {
    emit: (paths: string[]) => emit({ paths, at: Date.now() }),
    changes: async (onChange: (batch: ChangeBatch) => void) => {
      emit = onChange;
      return { close: async () => {} };
    },
  };
}

const nextVersion = (live: { subscribe(l: (v: number) => void): () => void }, wanted: number) =>
  new Promise<void>((resolve) => {
    const stop = live.subscribe((v) => {
      if (v >= wanted) {
        stop();
        resolve();
      }
    });
  });

describe("startLive", () => {
  it("reads a change, records it in the session and raises the version", async () => {
    const source = manual();
    const live = await startLive(root, await analyse(root), { changes: source.changes });
    try {
      await writeFile(join(root, "a.ts"), "export function a() {}\nexport function b() {}\n");
      const done = nextVersion(live, 1);
      source.emit(["a.ts"]);
      await done;
      expect(live.version()).toBe(1);
      expect(
        live
          .current()
          .graph.files.get("a.ts")
          ?.symbols.map((s) => s.name),
      ).toEqual(["a", "b"]);
      expect(live.session.changeOf("a.ts")?.symbolsAdded).toEqual(["b"]);
    } finally {
      await live.close();
    }
  });

  it("reads the batches that arrive while one is being read together, after it", async () => {
    const source = manual();
    const live = await startLive(root, await analyse(root), { changes: source.changes });
    try {
      await writeFile(join(root, "b.ts"), "export function b() {}\n");
      await writeFile(join(root, "c.ts"), "export function c() {}\n");
      const done = nextVersion(live, 2);
      source.emit(["a.ts"]);
      source.emit(["b.ts"]);
      source.emit(["c.ts"]);
      await done;
      await new Promise((r) => setTimeout(r, 50));
      expect(live.version()).toBe(2);
      expect([...live.current().graph.files.keys()].sort()).toEqual(["a.ts", "b.ts", "c.ts"]);
    } finally {
      await live.close();
    }
  });

  it("raises the version only for changes to the code or its configuration", async () => {
    const source = manual();
    const live = await startLive(root, await analyse(root), { changes: source.changes });
    try {
      await mkdir(join(root, "test-results/run"), { recursive: true });
      await writeFile(join(root, "test-results/run/trace.png"), "x");
      source.emit(["test-results/run/trace.png"]);
      source.emit(["test-results/run", "test-results"]);
      await new Promise((r) => setTimeout(r, 200));
      expect(live.version()).toBe(0);

      // A folder renamed: the platform may name only the folders.
      await mkdir(join(root, "lib"));
      await writeFile(join(root, "lib/x.ts"), "export function x() {}\n");
      const renamed = nextVersion(live, 1);
      source.emit(["lib"]);
      await renamed;
      expect(live.current().graph.files.has("lib/x.ts")).toBe(true);
      await rename(join(root, "lib"), join(root, "src"));
      const moved = nextVersion(live, 2);
      source.emit(["lib", "src"]);
      await moved;
      expect([...live.current().graph.files.keys()].sort()).toEqual(["a.ts", "src/x.ts"]);
    } finally {
      await live.close();
    }
  });

  it("follows the project's own file events", async () => {
    const live = await startLive(root, await analyse(root));
    try {
      const done = nextVersion(live, 1);
      await writeFile(join(root, "d.ts"), "export function d() {}\n");
      await done;
      expect(live.current().graph.files.has("d.ts")).toBe(true);
      expect(live.session.changeOf("d.ts")?.added).toBe(true);
    } finally {
      await live.close();
    }
  });

  it("takes in what changed while the project was first read", async () => {
    const early = await watchEarly(root);
    const first = await analyse(root);
    await writeFile(join(root, "e.ts"), "export function e() {}\n");
    await new Promise((r) => setTimeout(r, 500));
    const live = await startLive(root, first, { changes: early.changes });
    try {
      if (live.version() === 0) await nextVersion(live, 1);
      expect(live.current().graph.files.has("e.ts")).toBe(true);
    } finally {
      await live.close();
    }
  });

  it("announces a new version when a change stops counting as editing, and later ones", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const source = manual();
    const live = await startLive(root, await analyse(root), { changes: source.changes });
    try {
      await writeFile(join(root, "a.ts"), "export function a() {}\nexport function b() {}\n");
      const read = nextVersion(live, 1);
      source.emit(["a.ts"]);
      await read;
      expect(live.version()).toBe(1);
      await vi.advanceTimersByTimeAsync(live_.editingSeconds * 1000);
      expect(live.version()).toBe(2);
      await vi.advanceTimersByTimeAsync((live_.justNowSeconds - live_.editingSeconds) * 1000);
      expect(live.version()).toBe(3);
      await vi.advanceTimersByTimeAsync(live_.keepMinutes * 60_000);
      expect(live.version()).toBe(4);
    } finally {
      vi.useRealTimers();
      await live.close();
    }
  });
});
