// SPDX-License-Identifier: Apache-2.0

import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, sep } from "node:path";
import { type Analysis, buildMap, type Place, type Project } from "@codemap/core";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";

// The local server the browser talks to. It reads the user's source code, so
// it is closed to everything but the one browser tab the terminal opened:
// bound to 127.0.0.1 only, on a random free port, every request carrying the
// session token, and any request whose Host or Origin names something else
// refused. Nothing is logged.

export interface ServerOptions {
  analysis: Analysis;
  project: Project;
  // The built web app to serve.
  webRoot: string;
  // A fixed port; without one the system picks a free one.
  port?: number;
}

export interface RunningServer {
  // What the terminal opens: carries the token once, in the query.
  url: string;
  port: number;
  close(): Promise<void>;
}

const host = "127.0.0.1";

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

// Everything the page loads comes from this server; nothing may come from
// anywhere else, and nothing may frame it.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function sameToken(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function parsePlace(query: URLSearchParams): Place | undefined {
  const level = query.get("level") ?? "system";
  const id = query.get("id") ?? "";
  if (level === "system") return { level };
  if (!id) return undefined;
  if (level === "area") return { level, area: id };
  if (level === "file") return { level, module: id };
  if (level === "function") return { level, file: id };
  return undefined;
}

export function createApp(
  options: Omit<ServerOptions, "port"> & { token: string; currentPort: () => number },
) {
  const { token } = options;
  const cookieName = () => `codemap_${options.currentPort()}`;
  const origins = () => [
    `http://${host}:${options.currentPort()}`,
    `http://localhost:${options.currentPort()}`,
  ];
  const app = new Hono();

  app.use("*", async (c, next) => {
    // A page on another site that makes the browser call this server names
    // itself in Origin, or reaches it through another name in Host.
    const origin = c.req.header("origin");
    const hostHeader = c.req.header("host");
    const allowedHosts = origins().map((o) => o.slice("http://".length));
    if (
      (origin && !origins().includes(origin)) ||
      !hostHeader ||
      !allowedHosts.includes(hostHeader)
    ) {
      return c.text("", 403);
    }

    // The token arrives once in the query and is kept in a cookie named after
    // the port, so two Codemaps on one machine do not share one. The address
    // is then shown without it.
    const fromQuery = c.req.query("token");
    if (sameToken(fromQuery, token)) {
      setCookie(c, cookieName(), token, { httpOnly: true, sameSite: "Strict", path: "/" });
      const url = new URL(c.req.url);
      url.searchParams.delete("token");
      return c.redirect(`${url.pathname}${url.search}`, 302);
    }
    if (!sameToken(getCookie(c, cookieName()), token)) return c.text("", 401);

    await next();
    c.header("Content-Security-Policy", contentSecurityPolicy);
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Cache-Control", "no-store");
  });

  // Hono's default error handler prints the error, with paths from this
  // machine, into the terminal the design lays out line by line. Nothing is
  // logged: a failure is an empty 500.
  app.onError((_error, c) => c.text("", 500));

  // The map for one place, built once and kept for the life of the server.
  const maps = new Map<string, ReturnType<typeof buildMap>>();
  app.get("/api/map", async (c) => {
    const place = parsePlace(new URL(c.req.url).searchParams);
    if (!place) return c.json({ error: "place" }, 400);
    const key = JSON.stringify(place);
    let map = maps.get(key);
    if (!map) {
      map = buildMap(options.analysis, options.project, place);
      maps.set(key, map);
    }
    try {
      return c.json(await map);
    } catch {
      maps.delete(key);
      return c.json({ error: "place" }, 404);
    }
  });

  // The built web app. Paths are resolved inside its folder and anything that
  // would leave it is refused; unknown paths get the app, which routes itself.
  app.get("*", async (c) => {
    const root = normalize(options.webRoot);
    let path: string;
    try {
      path = decodeURIComponent(new URL(c.req.url).pathname);
    } catch {
      return c.text("", 400);
    }
    const requested = normalize(join(root, path));
    if (!requested.startsWith(root + sep) && requested !== root) return c.text("", 403);
    const file = extname(requested) ? requested : join(root, "index.html");
    try {
      const body = await readFile(file);
      return c.body(body, 200, {
        "Content-Type": types[extname(file)] ?? "application/octet-stream",
      });
    } catch {
      return c.text("", 404);
    }
  });

  return app;
}

export function startServer(options: ServerOptions): Promise<RunningServer> {
  const token = randomBytes(32).toString("hex");
  let port = options.port ?? 0;
  const app = createApp({ ...options, token, currentPort: () => port });
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, hostname: host, port }, (info: AddressInfo) => {
      port = info.port;
      resolve({
        url: `http://${host}:${port}/?token=${token}`,
        port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}
