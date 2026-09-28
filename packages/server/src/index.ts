// SPDX-License-Identifier: Apache-2.0

import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, sep } from "node:path";
import type { Duplex } from "node:stream";
import {
  type Analysis,
  type Answer,
  ask,
  buildMap,
  type LayoutStore,
  type Place,
  type Project,
  type Provider,
  ProviderError,
  type Session,
  type SourceReader,
  search,
  timeline,
  type Words,
  withActivity,
  withAnswer,
} from "@codemap/core";
import type { MapScreen, Screen } from "@codemap/core/view";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie } from "hono/cookie";
import { WebSocketServer } from "ws";

// The local server the browser talks to. It reads the user's source code, so
// it is closed to everything but the one browser tab the terminal opened:
// bound to 127.0.0.1 only, on a random free port, every request carrying the
// session token, and any request whose Host or Origin names something else
// refused. Nothing is logged.

// Where the maps come from: the project as it is now and, while it is live,
// the session that says what changed.
export interface MapSource {
  // A screen that stands in for every map: while the project is read for the
  // first time, or when the folder holds no code.
  screen?(): Screen | undefined;
  current(): Analysis;
  session?: Session | undefined;
  version?(): number;
  subscribe?(listener: (version: number) => void): () => void;
  layouts?: LayoutStore;
  // Reads a file of the project, for what a panel shows of the code itself.
  read?: SourceReader;
  // The explanations there are, Simple or Technical, when they are on.
  words?(mode: "simple" | "technical"): Words | undefined;
  // The user's own provider, for Ask, when they set one up.
  provider?(): Provider | undefined;
}

// A question longer than this is not a question about a map.
const maxQuestion = 2000;

export interface ServerOptions {
  source: MapSource;
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

// The hosts and origins the browser may use to reach this server.
const reachableAs = (port: number) => [`http://${host}:${port}`, `http://localhost:${port}`];

// Whether a request's Host and Origin name this server, and nothing else: a
// page on another site that makes the browser call it names itself in
// Origin, or reaches it through another name in Host.
function fromHere(port: number, hostHeader: string | undefined, origin: string | undefined) {
  const origins = reachableAs(port);
  return (
    !!hostHeader &&
    origins.map((o) => o.slice("http://".length)).includes(hostHeader) &&
    (!origin || origins.includes(origin))
  );
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

export function createApp(
  options: Omit<ServerOptions, "port"> & { token: string; currentPort: () => number },
) {
  const { token } = options;
  const cookieName = () => `codemap_${options.currentPort()}`;
  const app = new Hono();

  app.use("*", async (c, next) => {
    if (!fromHere(options.currentPort(), c.req.header("host"), c.req.header("origin")))
      return c.text("", 403);

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

  // The map of one place, built once per version of the project and given
  // the session's activity. With panel=changes, and a session, the panel is
  // the changes timeline.
  const { source } = options;
  let builtFor = -1;
  const maps = new Map<string, ReturnType<typeof buildMap>>();
  // The screen of a place as the query asks for it, or why there is none.
  const screenFor = async (
    query: URLSearchParams,
  ): Promise<{ screen: Screen; map?: MapScreen } | { error: "place"; status: 400 | 404 }> => {
    const place = parsePlace(query);
    if (!place) return { error: "place", status: 400 };
    const instead = source.screen?.();
    if (instead) return { screen: instead };
    const version = source.version?.() ?? 0;
    if (version !== builtFor) {
      maps.clear();
      builtFor = version;
    }
    const analysis = source.current();
    const select = query.get("select") ?? undefined;
    const mode = query.get("explain") === "technical" ? "technical" : "simple";
    const words = source.words?.(mode);
    const key = JSON.stringify([place, select, mode]);
    let map = maps.get(key);
    if (!map) {
      map = buildMap(analysis, options.project, place, {
        ...(source.layouts ? { layouts: source.layouts } : {}),
        ...(select ? { select } : {}),
        ...(source.read ? { read: source.read } : {}),
        ...(words ? { words } : {}),
      });
      maps.set(key, map);
    }
    let screen: MapScreen;
    try {
      screen = await map;
    } catch {
      // Only this build's entry: the version may have moved on meanwhile.
      if (maps.get(key) === map) maps.delete(key);
      return { error: "place", status: 404 };
    }
    // The panel shows the mode asked for, with explanations or still without.
    if ("explanation" in screen.panel)
      screen = { ...screen, panel: { ...screen.panel, explanation: mode } };
    if (source.session) screen = withActivity(screen, analysis, source.session);
    if (source.session && query.get("panel") === "changes")
      screen = {
        ...screen,
        topbar: { ...screen.topbar, changesOpen: true },
        panel: timeline(source.session, analysis),
      };
    // The answer to the last question about this place stays on it while
    // the browser shows it.
    const answer = answers.get(JSON.stringify(place));
    const shown = query.get("ask") === "1" && answer ? withAnswer(screen, answer) : screen;
    return { screen: shown, map: screen };
  };

  const answers = new Map<string, Answer>();

  // The command palette's search over the project as it is now.
  app.get("/api/search", (c) => {
    const query = (new URL(c.req.url).searchParams.get("q") ?? "").slice(0, maxQuestion);
    if (source.screen?.()) return c.json({ query, functions: [], modulesAndFiles: [], ask: [] });
    return c.json(search(source.current(), query, source.session));
  });

  app.get("/api/map", async (c) => {
    const found = await screenFor(new URL(c.req.url).searchParams);
    if ("error" in found) return c.json({ error: found.error }, found.status);
    return c.json(found.screen);
  });

  // Ask: a question about the place the user is looking at, answered with
  // the user's own provider in steps on that map. It only explains.
  app.post(
    "/api/ask",
    bodyLimit({ maxSize: maxQuestion * 4, onError: (c) => c.json({ error: "question" }, 413) }),
    async (c) => {
      const query = new URL(c.req.url).searchParams;
      // A question is JSON text; a body larger than the longest question is
      // refused by the limit above before it is read.
      if (!c.req.header("content-type")?.startsWith("application/json"))
        return c.json({ error: "question" }, 415);
      let question: unknown;
      try {
        question = ((await c.req.json()) as { question?: unknown }).question;
      } catch {
        return c.json({ error: "question" }, 400);
      }
      if (typeof question !== "string" || question.trim() === "" || question.length > maxQuestion)
        return c.json({ error: "question" }, 400);
      const provider = source.provider?.();
      if (!provider) return c.json({ error: "provider" }, 409);
      const found = await screenFor(query);
      if ("error" in found) return c.json({ error: found.error }, found.status);
      if (!found.map) return c.json({ error: "place" }, 409);
      let answer: Answer;
      try {
        answer = await ask(provider, found.map, question.trim());
      } catch (error) {
        return c.json(
          { error: "provider", message: error instanceof ProviderError ? error.message : "" },
          502,
        );
      }
      answers.set(JSON.stringify(parsePlace(query)), answer);
      return c.json(withAnswer(found.map, answer));
    },
  );

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

// How often an open live connection is checked, so one whose browser went
// away without closing it is dropped.
const heartbeat = 15_000;

export function startServer(options: ServerOptions): Promise<RunningServer> {
  const token = randomBytes(32).toString("hex");
  let port = options.port ?? 0;
  const app = createApp({ ...options, token, currentPort: () => port });

  // /api/live: the browser's WebSocket, told the project's version on
  // connecting and on every change, so it knows when its map is out of date.
  // The upgrade is admitted by the same rules as every request.
  const sockets = new WebSocketServer({ noServer: true });
  sockets.on("connection", (socket) => {
    let alive = true;
    const send = (version: number) => socket.send(JSON.stringify({ version }));
    send(options.source.version?.() ?? 0);
    const unsubscribe = options.source.subscribe?.(send);
    socket.on("pong", () => {
      alive = true;
    });
    const beat = setInterval(() => {
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
    }, heartbeat);
    socket.on("close", () => {
      clearInterval(beat);
      unsubscribe?.();
    });
  });

  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, hostname: host, port }, (info: AddressInfo) => {
      port = info.port;
      resolve({
        url: `http://${host}:${port}/?token=${token}`,
        port,
        close: () =>
          new Promise<void>((done) => {
            for (const socket of sockets.clients) socket.terminate();
            sockets.close();
            server.close(() => done());
          }),
      });
    });
    server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      // Once a connection asks for an upgrade the HTTP server no longer
      // handles its errors; a peer gone before the answer would otherwise
      // end the process.
      socket.on("error", () => {});
      const admitted =
        request.url?.split("?")[0] === "/api/live" &&
        fromHere(port, request.headers.host, request.headers.origin) &&
        sameToken(cookieValue(request.headers.cookie, `codemap_${port}`), token);
      if (!admitted) {
        socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        return;
      }
      sockets.handleUpgrade(request, socket, head, (ws) => sockets.emit("connection", ws, request));
    });
  });
}
