// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Analysis, analyse } from "@codemap/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
    analysis,
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

  it("listens on 127.0.0.1 only, on a free port, and hands out a URL with the token", async () => {
    const running = await startServer({
      analysis,
      project: { name: "p", kind: "TypeScript" },
      webRoot: web,
    });
    expect(running.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?token=[0-9a-f]{64}$/);
    expect(running.port).toBeGreaterThan(0);
    await running.close();
  });
});
