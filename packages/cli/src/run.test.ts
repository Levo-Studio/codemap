// SPDX-License-Identifier: Apache-2.0

import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "node:url";
import {
  type Analysis,
  type Explainer,
  type LiveProject,
  live as liveTimes,
  type Provider,
} from "@codemap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cursorRestorer, findWebRoot, followWithExplanations, projectReader, run } from "./run.js";
import { cursor } from "./terminal.js";

// A terminal that records what is written to it.
function terminal(isTTY: boolean) {
  const stream = new PassThrough() as PassThrough & { isTTY: boolean };
  stream.isTTY = isTTY;
  let written = "";
  stream.on("data", (chunk: Buffer) => {
    written += chunk.toString();
  });
  return { out: stream as unknown as NodeJS.WriteStream, written: () => written };
}

const folders: string[] = [];
afterEach(async () => {
  for (const folder of folders.splice(0)) {
    await chmod(folder, 0o755);
    await rm(folder, { recursive: true, force: true });
  }
});

describe("run", () => {
  it("reads a project it may not write to, without a cache", async () => {
    const root = await mkdtemp(join(tmpdir(), "codemap-readonly-"));
    folders.push(root);
    await writeFile(join(root, "a.ts"), "export function a() {}\n");
    await chmod(root, 0o555);
    const { out } = terminal(false);
    const running = await run({ root, open: false, version: "0.0.0", out, env: {} });
    await running.stop();
  });

  it("gives the terminal its own cursor back once, however Codemap ends", () => {
    const tty = terminal(true);
    const restore = cursorRestorer(tty.out);
    restore();
    restore();
    expect(tty.written()).toBe(cursor.restore);
    const pipe = terminal(false);
    cursorRestorer(pipe.out)();
    expect(pipe.written()).toBe("");
  });

  it("reads files of the project for the panels, and nothing outside it", async () => {
    const root = await mkdtemp(join(tmpdir(), "codemap-reader-"));
    folders.push(root);
    await writeFile(join(root, "a.ts"), "export function a() {}\n");
    const read = projectReader(root);
    expect(read("a.ts")).toBe("export function a() {}\n");
    expect(read("../outside.ts")).toBeUndefined();
    expect(read("/etc/hosts")).toBeUndefined();
    expect(read("missing.ts")).toBeUndefined();
    const outside = await mkdtemp(join(tmpdir(), "codemap-outside-"));
    folders.push(outside);
    await writeFile(join(outside, "secret.ts"), "export const secret = 1;\n");
    await symlink(join(outside, "secret.ts"), join(root, "link.ts"));
    expect(read("link.ts")).toBeUndefined();
  });

  it("writes the explanations before the map opens, and serves them", async () => {
    const root = await mkdtemp(join(tmpdir(), "codemap-explained-"));
    folders.push(root);
    await writeFile(join(root, "a.ts"), "export function a() {}\n");
    const provider: Provider = {
      kind: "anthropic",
      complete: async ({ prompt }) =>
        JSON.stringify({ simple: `About ${prompt.split("\n")[0]}`, technical: "`a()`" }),
    };
    const { out, written } = terminal(false);
    const running = await run({ root, open: false, version: "0.0.0", out, env: {}, provider });
    try {
      expect(written()).toMatch(/Writing explanations\s+\d+ explanations/);
      const address = new URL(written().match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/)?.[0] ?? "");
      const token = address.searchParams.get("token");
      const cookie = `codemap_${address.port}=${token}`;
      const map = (await (
        await fetch(`${address.origin}/api/map?level=function&id=a.ts`, { headers: { cookie } })
      ).json()) as { map: { nodes: { label: string; description?: string }[] } };
      expect(map.map.nodes.find((n) => n.label === "a")?.description).toBe(
        "About Explain the function a in a.ts:",
      );
    } finally {
      await running.stop();
    }
  });
});

describe("followWithExplanations", () => {
  it("explains again once the code has changed and the agent paused, not for a timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const listeners: (() => void)[] = [];
      let current = { id: 1 } as unknown as Analysis;
      const live = {
        current: () => current,
        subscribe: (listener: () => void) => {
          listeners.push(listener);
          return () => {};
        },
      } as unknown as LiveProject;
      const explained: unknown[] = [];
      const explainer = {
        explain: async (analysis: Analysis) => void explained.push(analysis),
      } as unknown as Explainer;
      let announced = 0;
      const first = current;
      followWithExplanations(live, explainer, "p", first, () => announced++);

      for (const listener of listeners) listener();
      await vi.advanceTimersByTimeAsync(liveTimes.editingSeconds * 1000);
      expect(explained).toEqual([]);

      current = { id: 2 } as unknown as Analysis;
      for (const listener of listeners) listener();
      await vi.advanceTimersByTimeAsync(liveTimes.editingSeconds * 1000 - 1);
      expect(explained).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(explained).toEqual([current]);
      expect(announced).toBe(1);

      // A version a timer raises, with the same code, does not put the
      // explanation off again.
      current = { id: 3 } as unknown as Analysis;
      for (const listener of listeners) listener();
      await vi.advanceTimersByTimeAsync(liveTimes.editingSeconds * 1000 - 1);
      for (const listener of listeners) listener();
      await vi.advanceTimersByTimeAsync(1);
      expect(explained).toEqual([{ id: 2 }, current]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("findWebRoot", () => {
  it("takes the web app beside the bundle when run from the bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "codemap-package-"));
    folders.push(root);
    const from = pathToFileURL(join(root, "bundle", "run-abc.js")).href;
    expect(findWebRoot(from)).toBe(join(root, "web"));
  });

  it("takes the workspace's web app when run from the workspace, a copied one beside it or not", async () => {
    const root = await mkdtemp(join(tmpdir(), "codemap-workspace-"));
    folders.push(root);
    await mkdir(join(root, "dist"));
    await mkdir(join(root, "web"));
    await writeFile(join(root, "web", "index.html"), "<!doctype html>");
    const from = pathToFileURL(join(root, "dist", "run.js")).href;
    expect(findWebRoot(from)).toBe(join(root, "..", "web", "dist"));
  });
});
