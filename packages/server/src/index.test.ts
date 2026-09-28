// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Analysis,
  analyse,
  loadingScreen,
  type Provider,
  ProviderError,
  Session,
} from "@codemap/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { createApp, startServer } from "./index.js";

let project: string;
let web: string;
let analysis: Analysis;
const token = "a".repeat(64);
const port = 43210;
const origin = `http://127.0.0.1:${port}`;

beforeAll(async () => {
  project = await mkdtemp(join(tmpdir(), "codemap-server-"));
  web = await mkdtemp(join(tmpdir(), "codemap-web-"));
  await writeFile(join(project, "a.ts"), "export function a() {}\n");
  await mkdir(join(web, "assets"), { recursive: true });
  await writeFile(join(web, "index.html"), "<!doctype html><title>Codemap</title>");
  await writeFile(join(web, "assets/app.js"), "export {};");
  analysis = await analyse(project);
});

afterAll(async () => {
  await rm(project, { recursive: true, force: true });
  await rm(web, { recursive: true, force: true });
});

const app = () =>
  createApp({
    source: { current: () => analysis },
    project: { name: "p", kind: "TypeScript" },
    webRoot: web,
    token,
    currentPort: () => port,
  });

const request = (path: string, headers: Record<string, string> = {}) =>
  app().request(`${origin}${path}`, { headers: { host: `127.0.0.1:${port}`, ...headers } });

const cookie = { cookie: `codemap_${port}=${token}` };

describe("the server", () => {
  it("refuses a request without the session token", async () => {
    expect((await request("/")).status).toBe(401);
    expect((await request("/api/map")).status).toBe(401);
    expect((await request("/assets/app.js")).status).toBe(401);
  });

  it("refuses a wrong token, in the query or in the cookie", async () => {
    expect((await request(`/?token=${"b".repeat(64)}`)).status).toBe(401);
    expect((await request("/", { cookie: `codemap_${port}=${"b".repeat(64)}` })).status).toBe(401);
    expect((await request(`/?token=short`)).status).toBe(401);
  });

  it("takes the token once from the query, keeps it in a cookie and drops it from the address", async () => {
    const response = await request(`/?token=${token}`);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect(response.headers.get("set-cookie")).toContain(`codemap_${port}=${token}`);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Strict");
  });

  it("serves the app and the map with the cookie, with a strict content security policy", async () => {
    const page = await request("/", cookie);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("default-src 'self'");
    const map = await request("/api/map?level=system", cookie);
    expect(map.status).toBe(200);
    expect(await map.json()).toMatchObject({ kind: "map", topbar: { crumbs: ["System"] } });
  });

  it("refuses a request from another origin, even with the token", async () => {
    expect((await request("/api/map", { ...cookie, origin: "https://example.com" })).status).toBe(
      403,
    );
    expect((await request("/api/map", { ...cookie, origin })).status).toBe(200);
  });

  it("refuses a request that reaches it under another host name", async () => {
    expect((await request("/api/map", { ...cookie, host: "attacker.example:43210" })).status).toBe(
      403,
    );
  });

  it("serves nothing outside the web app's folder", async () => {
    const response = await request("/..%2f..%2fetc%2fpasswd.txt", cookie);
    expect([403, 404]).toContain(response.status);
  });

  it("answers a malformed address with 400 and prints nothing", async () => {
    const printed = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await request("/%E0%A4%A", cookie)).status).toBe(400);
      expect(printed).not.toHaveBeenCalled();
    } finally {
      printed.mockRestore();
    }
  });

  it("builds the map again for every new version of the project", async () => {
    let current = analysis;
    let version = 0;
    const live = createApp({
      source: { current: () => current, version: () => version },
      project: { name: "p", kind: "TypeScript" },
      webRoot: web,
      token,
      currentPort: () => port,
    });
    const get = async () =>
      (await (
        await live.request(`${origin}/api/map?level=system`, {
          headers: { host: `127.0.0.1:${port}`, ...cookie },
        })
      ).json()) as { map: { nodes: unknown[] } };
    const before = (await get()).map.nodes.length;
    await mkdir(join(project, "billing"), { recursive: true });
    await writeFile(join(project, "billing/charge.ts"), "export function charge() {}\n");
    current = await analyse(project);
    expect((await get()).map.nodes.length).toBe(before);
    version = 1;
    expect((await get()).map.nodes.length).toBe(before + 1);
    await rm(join(project, "billing"), { recursive: true, force: true });
  });

  it("gives a selected node its own panel", async () => {
    const response = await request(
      `/api/map?level=function&id=a.ts&select=${encodeURIComponent("a.ts#a")}`,
      cookie,
    );
    expect(await response.json()).toMatchObject({ panel: { kind: "function", name: "a" } });
  });

  it("shows the panel in the explanation mode asked for", async () => {
    const technical = await request("/api/map?level=system&explain=technical", cookie);
    expect(await technical.json()).toMatchObject({ panel: { explanation: "technical" } });
    const simple = await request("/api/map?level=system", cookie);
    expect(await simple.json()).toMatchObject({ panel: { explanation: "simple" } });
  });

  it("answers a question with the user's provider, and keeps the answer on the map", async () => {
    const asking = (provider?: () => Provider | undefined) =>
      createApp({
        source: { current: () => analysis, ...(provider ? { provider } : {}) },
        project: { name: "p", kind: "TypeScript" },
        webRoot: web,
        token,
        currentPort: () => port,
      });
    const post = (
      app: ReturnType<typeof createApp>,
      body: unknown,
      extra: Record<string, string> = {},
    ) =>
      app.request(`${origin}/api/ask?level=function&id=a.ts`, {
        method: "POST",
        headers: {
          host: `127.0.0.1:${port}`,
          origin,
          "content-type": "application/json",
          ...cookie,
          ...extra,
        },
        body: JSON.stringify(body),
      });

    expect((await post(asking(), { question: "What does a do?" })).status).toBe(409);
    const provider: Provider = {
      kind: "anthropic",
      complete: async () =>
        '{"intro": "In one step.", "steps": [{"node": "a.ts#a", "text": "does nothing."}]}',
    };
    const app = asking(() => provider);
    expect((await post(app, { question: "" })).status).toBe(400);
    expect((await post(app, { question: "x".repeat(2001) })).status).toBe(400);
    expect((await post(app, { question: "What?" }, { origin: "https://example.com" })).status).toBe(
      403,
    );

    const answered = await post(app, { question: "What does a do?" });
    expect(answered.status).toBe(200);
    expect(await answered.json()).toMatchObject({
      chat: {
        question: "What does a do?",
        intro: "In one step.",
        steps: [{ id: "a.ts#a", name: "a" }],
      },
    });
    const kept = await app.request(`${origin}/api/map?level=function&id=a.ts&ask=1`, {
      headers: { host: `127.0.0.1:${port}`, ...cookie },
    });
    expect(await kept.json()).toMatchObject({ chat: { intro: "In one step." } });
    const without = await app.request(`${origin}/api/map?level=function&id=a.ts`, {
      headers: { host: `127.0.0.1:${port}`, ...cookie },
    });
    expect(await without.json()).toMatchObject({ chat: { kind: "idle" } });

    const failing = asking(() => ({
      kind: "anthropic",
      complete: async () => {
        throw new ProviderError("overloaded", 529);
      },
    }));
    const failed = await post(failing, { question: "What?" });
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "provider", message: "overloaded" });
  });

  it("answers every place with the source's own screen while it has one", async () => {
    const loading = loadingScreen("p", new Map());
    const app = createApp({
      source: {
        screen: () => loading,
        current: () => {
          throw new Error("no analysis yet");
        },
      },
      project: { name: "p", kind: "TypeScript" },
      webRoot: web,
      token,
      currentPort: () => port,
    });
    for (const path of ["/api/map?level=system", "/api/map?level=area&id=x"]) {
      const response = await app.request(`${origin}${path}`, {
        headers: { host: `127.0.0.1:${port}`, ...cookie },
      });
      expect(await response.json()).toEqual(loading);
    }
  });

  it("gives the changes timeline as the panel when asked for, with a session", async () => {
    const withSession = createApp({
      source: { current: () => analysis, session: new Session(analysis) },
      project: { name: "p", kind: "TypeScript" },
      webRoot: web,
      token,
      currentPort: () => port,
    });
    const response = await withSession.request(`${origin}/api/map?level=system&panel=changes`, {
      headers: { host: `127.0.0.1:${port}`, ...cookie },
    });
    expect(await response.json()).toMatchObject({
      topbar: { changesOpen: true },
      panel: { kind: "changes", structure: [], behavior: [], minor: 0 },
    });
  });

  it("listens on 127.0.0.1 only, on a free port, and hands out a URL with the token", async () => {
    const running = await startServer({
      source: { current: () => analysis },
      project: { name: "p", kind: "TypeScript" },
      webRoot: web,
    });
    expect(running.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?token=[0-9a-f]{64}$/);
    expect(running.port).toBeGreaterThan(0);
    await running.close();
  });

  it("tells the browser the project's version on /api/live, and every new one", async () => {
    const listeners = new Set<(version: number) => void>();
    let version = 3;
    const running = await startServer({
      source: {
        current: () => analysis,
        version: () => version,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      project: { name: "p", kind: "TypeScript" },
      webRoot: web,
    });
    const token = new URL(running.url).searchParams.get("token") as string;
    const address = `ws://127.0.0.1:${running.port}/api/live`;
    const allowed = { origin: `http://127.0.0.1:${running.port}` };
    const messages: number[] = [];
    const open = (headers: Record<string, string>, path = address) =>
      new Promise<{ socket: WebSocket; status?: number }>((resolve) => {
        const socket = new WebSocket(path, { headers });
        socket.on("message", (data) =>
          messages.push((JSON.parse(String(data)) as { version: number }).version),
        );
        socket.on("open", () => resolve({ socket }));
        socket.on("unexpected-response", (_request, response) =>
          resolve({ socket, status: response.statusCode ?? 0 }),
        );
        socket.on("error", () => resolve({ socket, status: -1 }));
      });
    try {
      const cookie = `codemap_${running.port}=${token}`;
      const { socket } = await open({ ...allowed, cookie });
      const until = async (count: number) => {
        while (messages.length < count) await new Promise((r) => setTimeout(r, 10));
      };
      await until(1);
      version = 4;
      for (const listener of listeners) listener(4);
      await until(2);
      expect(messages).toEqual([3, 4]);
      socket.close();

      for (const [headers, path] of [
        [allowed, address],
        [{ ...allowed, cookie: `codemap_${running.port}=${"b".repeat(64)}` }, address],
        [{ origin: "https://example.com", cookie }, address],
        [{ ...allowed, cookie }, `ws://127.0.0.1:${running.port}/elsewhere`],
      ] as const) {
        const refused = await open(headers, path);
        expect(refused.status, JSON.stringify(headers)).not.toBeUndefined();
        refused.socket.terminate();
      }
    } finally {
      await running.close();
    }
  });

  it("survives a refused upgrade whose connection is gone before the answer", async () => {
    const running = await startServer({
      source: { current: () => analysis },
      project: { name: "p", kind: "TypeScript" },
      webRoot: web,
    });
    try {
      for (let i = 0; i < 20; i++) {
        await new Promise<void>((resolve) => {
          const socket = connect(running.port, "127.0.0.1", () => {
            socket.write(
              [
                "GET /api/live HTTP/1.1",
                `Host: 127.0.0.1:${running.port}`,
                "Origin: http://evil.test",
                "Connection: Upgrade",
                "Upgrade: websocket",
                "Sec-WebSocket-Version: 13",
                "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
                "",
                "",
              ].join("\r\n"),
            );
            socket.resetAndDestroy();
            resolve();
          });
          socket.on("error", () => {});
        });
      }
      await new Promise((r) => setTimeout(r, 100));
      const token = new URL(running.url).searchParams.get("token") as string;
      const alive = await fetch(`http://127.0.0.1:${running.port}/api/map`, {
        headers: { cookie: `codemap_${running.port}=${token}` },
      });
      expect(alive.status).toBe(200);
    } finally {
      await running.close();
    }
  });
});
