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
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  cursorRestorer,
  findWebRoot,
  followWithExplanations,
  liveBlock,
  projectReader,
  run,
} from "./run.js";
import { en } from "./strings/en.js";
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
// Where the secret caches are sealed with is kept, never the user's own.
const config = await mkdtemp(join(tmpdir(), "codemap-config-"));
afterAll(async () => {
  await rm(config, { recursive: true, force: true });
});
afterEach(async () => {
  for (const folder of folders.splice(0)) {
    await chmod(folder, 0o755);
    await rm(folder, { recursive: true, force: true });
  }
});

// A project as Codemap maps one: a folder that is a git repository.
async function project(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `codemap-${name}-`));
  folders.push(root);
  await mkdir(join(root, ".git"));
  await writeFile(join(root, ".git/HEAD"), "ref: refs/heads/main\n");
  return root;
}

describe("run", () => {
  it("maps nothing that is not in a git repository", async () => {
    const root = await mkdtemp(join(tmpdir(), "codemap-folder-"));
    folders.push(root);
    await writeFile(join(root, "a.ts"), "export function a() {}\n");
    const { out, written } = terminal(false);
    await expect(
      run({ root, open: false, version: "0.0.0", out, env: { XDG_CONFIG_HOME: config } }),
    ).rejects.toThrow(en.errors.notARepository(root));
    // Nothing was read, and nothing was served.
    expect(written()).not.toMatch(/http:\/\//);
  });

  it("maps nothing hidden, and says so", async () => {
    const root = await project("hidden");
    await mkdir(join(root, ".github"));
    const { out } = terminal(false);
    const hidden = join(root, ".github");
    await expect(
      run({ root: hidden, open: false, version: "0.0.0", out, env: { XDG_CONFIG_HOME: config } }),
    ).rejects.toThrow(en.errors.hidden(hidden));
  });

  it("reads a project it may not write to, without a cache", async () => {
    const root = await project("readonly");
    await writeFile(join(root, "a.ts"), "export function a() {}\n");
    await chmod(root, 0o555);
    const { out } = terminal(false);
    const running = await run({
      root,
      open: false,
      version: "0.0.0",
      out,
      env: { XDG_CONFIG_HOME: config },
    });
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

  it("opens the map before the explanations are written, and serves each once it is", async () => {
    const root = await project("explained");
    await writeFile(join(root, "a.ts"), "export function a() {}\n");
    // A provider that answers only when the test lets it.
    let answer: () => void = () => {};
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const provider: Provider = {
      kind: "anthropic",
      complete: async ({ prompt }) => {
        await answered;
        const names = [...prompt.matchAll(/^### (.+)$/gm)].map((m) => m[1] as string);
        return JSON.stringify(
          Object.fromEntries(names.map((n) => [n, { simple: `About ${n}`, technical: "`a()`" }])),
        );
      },
    };
    const { out, written } = terminal(false);
    const running = await run({
      root,
      open: false,
      version: "0.0.0",
      out,
      env: { XDG_CONFIG_HOME: config },
      provider,
    });
    try {
      // The address is there, the explanations are not written yet.
      const address = new URL(written().match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/)?.[0] ?? "");
      expect(written()).not.toMatch(/\d+ explanations/);
      // Taken as a browser takes it: the token once, for a session cookie.
      const signedIn = await fetch(address, { redirect: "manual" });
      const cookie = (signedIn.headers.get("set-cookie") ?? "").split(";")[0] as string;
      const described = async () => {
        const map = (await (
          await fetch(`${address.origin}/api/map?open=project&open=project%2Fa&open=a.ts`, {
            headers: { cookie },
          })
        ).json()) as { map: { nodes: { label: string; description?: string }[] } };
        return map.map.nodes.find((n) => n.label === "a")?.description;
      };
      expect(await described()).toBe("");
      answer();
      await vi.waitFor(async () => expect(await described()).toBe("About a"), { timeout: 5000 });
      await vi.waitFor(() => expect(written()).toMatch(/Writing explanations\s+\d+ explanations/));
      expect(written().indexOf("explanations ·")).toBeGreaterThan(written().indexOf("http://"));
    } finally {
      await running.stop();
    }
  });
});

describe("stopping while explanations are written", () => {
  it("asks the provider for nothing more, and reports nothing", async () => {
    const root = await project("stopped");
    for (let i = 0; i < 20; i++)
      await writeFile(join(root, `f${i}.ts`), `export function f${i}() {}\n`);
    let requests = 0;
    const provider: Provider = {
      kind: "anthropic",
      complete: async ({ prompt }) => {
        requests++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        const names = [...prompt.matchAll(/^### (.+)$/gm)].map((m) => m[1] as string);
        return JSON.stringify(
          Object.fromEntries(names.map((n) => [n, { simple: "x", technical: "y" }])),
        );
      },
    };
    const { out, written } = terminal(false);
    const running = await run({
      root,
      open: false,
      version: "0.0.0",
      out,
      env: { XDG_CONFIG_HOME: config },
      provider,
    });
    await vi.waitFor(() => expect(requests).toBeGreaterThan(0));
    await running.stop();
    const asked = requests;
    await new Promise((resolve) => setTimeout(resolve, 300));
    // At most those already under way when it stopped.
    expect(requests).toBeLessThanOrEqual(asked + 4);
    expect(requests).toBeLessThan(20);
    expect(written()).not.toMatch(/\d+ explanations ·/);
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
      let done = 0;
      const first = current;
      followWithExplanations(live, explainer, "p", first, () => announced++, {
        onProgress: () => {},
        onDone: () => done++,
      });
      // The first read is explained at once, and the browser told.
      await vi.advanceTimersByTimeAsync(0);
      expect(explained).toEqual([first]);
      expect([done, announced]).toEqual([1, 1]);
      explained.length = 0;
      announced = 0;

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

describe("liveBlock", () => {
  it("moves up by the rows its lines took, a line longer than the terminal is wide taking more", () => {
    const out = Object.assign(new PassThrough(), { isTTY: true, columns: 40 });
    let written = "";
    out.on("data", (d) => {
      written += d;
    });
    const block = liveBlock(out as unknown as NodeJS.WriteStream);
    // One short line, and one of 90 characters: three rows at 40 wide.
    block.draw(["short", "x".repeat(90)]);
    written = "";
    block.draw(["short", "x".repeat(90)]);
    expect(written.startsWith("\u001b[4F")).toBe(true);
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
