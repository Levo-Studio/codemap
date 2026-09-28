// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ChangeBatch } from "./watch.js";

// The first live read fails, as an unexpected error would make it.
let failNext = false;
vi.mock("./analyse.js", async (original) => {
  const real = await original<typeof import("./analyse.js")>();
  return {
    ...real,
    analyse: (...args: Parameters<typeof real.analyse>) => {
      if (failNext) {
        failNext = false;
        return Promise.reject(new Error("unexpected"));
      }
      return real.analyse(...args);
    },
  };
});

const { analyse } = await import("./analyse.js");
const { startLive } = await import("./live.js");

describe("startLive", () => {
  it("reads the files of a batch whose read failed again with the next batch", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "codemap-live-retry-")));
    try {
      await writeFile(join(root, "a.ts"), "export function a() {}\n");
      await writeFile(join(root, "b.ts"), "export function b() {}\n");
      let emit: (batch: ChangeBatch) => void = () => {};
      const live = await startLive(root, await analyse(root), {
        changes: async (onChange) => {
          emit = onChange;
          return { close: async () => {} };
        },
      });
      try {
        await writeFile(join(root, "a.ts"), "export function a() {}\nexport function a2() {}\n");
        failNext = true;
        emit({ paths: ["a.ts"], at: Date.now() });
        await new Promise((r) => setTimeout(r, 50));
        expect(live.version()).toBe(0);

        await writeFile(join(root, "b.ts"), "export function b() {}\nexport function b2() {}\n");
        const done = new Promise<void>((resolve) => live.subscribe(() => resolve()));
        emit({ paths: ["b.ts"], at: Date.now() });
        await done;
        const symbols = (path: string) =>
          live
            .current()
            .graph.files.get(path)
            ?.symbols.map((s) => s.name);
        expect(symbols("b.ts")).toEqual(["b", "b2"]);
        expect(symbols("a.ts")).toEqual(["a", "a2"]);
      } finally {
        await live.close();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reads them with a batch that was already waiting", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "codemap-live-retry-")));
    try {
      await writeFile(join(root, "a.ts"), "export function a() {}\n");
      await writeFile(join(root, "b.ts"), "export function b() {}\n");
      let emit: (batch: ChangeBatch) => void = () => {};
      const live = await startLive(root, await analyse(root), {
        changes: async (onChange) => {
          emit = onChange;
          return { close: async () => {} };
        },
      });
      try {
        await writeFile(join(root, "a.ts"), "export function a() {}\nexport function a2() {}\n");
        await writeFile(join(root, "b.ts"), "export function b() {}\nexport function b2() {}\n");
        failNext = true;
        const done = new Promise<void>((resolve) => live.subscribe(() => resolve()));
        emit({ paths: ["a.ts"], at: Date.now() });
        emit({ paths: ["b.ts"], at: Date.now() });
        await done;
        const symbols = (path: string) =>
          live
            .current()
            .graph.files.get(path)
            ?.symbols.map((s) => s.name);
        expect(symbols("a.ts")).toEqual(["a", "a2"]);
      } finally {
        await live.close();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
