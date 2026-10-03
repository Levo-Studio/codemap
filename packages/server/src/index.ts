// SPDX-License-Identifier: Apache-2.0

import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
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
  type Chat,
  type ChatStore,
  codeOf,
  type LayoutStore,
  longestQuestion,
  type Project,
  type Provider,
  ProviderError,
  type Session,
  type SourceReader,
  search,
  shown,
  timeline,
  type Words,
  withActivity,
  withAnswer,
  withFocus,
} from "@codemap/core";
import type { MapScreen, Screen } from "@codemap/core/view";
import { serve } from "@hono/node-server";
import { type Context, type ErrorHandler, Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie } from "hono/cookie";
import { WebSocketServer } from "ws";

export interface MapSource {
  screen?(): Screen | undefined;
  current(): Analysis;
  session?: Session | undefined;
  version?(): number;
  subscribe?(listener: (version: number) => void): () => void;
  layouts?: LayoutStore;
  read?: SourceReader;
  words?(mode: "simple" | "technical"): Words | undefined;
  provider?(): Provider | undefined;
  chats?: ChatStore;
}

// Chats stay in memory too, if the cache cannot write.
function keptChats(store?: ChatStore): ChatStore {
  const kept: Chat[] = [];
  return {
    add(chat) {
      kept.unshift(chat);
      kept.splice(shown.chats);
      store?.add(chat);
    },
    list() {
      const stored = store?.list() ?? [];
      const listed = new Set(stored.map((c) => c.id));
      const here = kept
        .filter((c) => !listed.has(c.id))
        .map(({ id, at, question, open }) => ({ id, at, question, open }));
      return [...stored, ...here].sort((a, b) => b.at - a.at).slice(0, shown.chats);
    },
    get: (id) => store?.get(id) ?? kept.find((c) => c.id === id),
  };
}

export interface ServerOptions {
  source: MapSource;
  project: Project;
  webRoot: string;
}

export interface RunningServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

const host = "127.0.0.1";

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

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

const sessionSeconds = 30 * 24 * 60 * 60;

// Named per port; other local servers still receive it (SECURITY.md).
const sessionCookie = (port: number) => `codemap_${port}`;

const heartbeat = 15_000;

// Constant-time comparison, so timing does not reveal the token.
function sameToken(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Sorted and unique, so one map has one cache key.
function openOf(query: URLSearchParams): string[] {
  return [...new Set(query.getAll("open"))].sort();
}

const allowedHosts = (port: number) => [`${host}:${port}`, `localhost:${port}`];

// Checks Host and Origin against DNS rebinding and other sites.
function fromHere(port: number, hostHeader: string | undefined, origin: string | undefined) {
  const hosts = allowedHosts(port);
  const origins = hosts.map((h) => `http://${h}`);
  return !!hostHeader && hosts.includes(hostHeader) && (!origin || origins.includes(origin));
}

const params = (c: { req: { url: string } }) => new URL(c.req.url).searchParams;

function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

// Outlives the browser, so the printed link reopens the map.
function startSession(c: Context, name: string, session: string): void {
  setCookie(c, name, session, {
    httpOnly: true,
    sameSite: "Strict",
    path: "/",
    maxAge: sessionSeconds,
  });
}

// Leading slashes are collapsed against open redirects.
function withoutToken(requestUrl: string): string {
  const url = new URL(requestUrl);
  url.searchParams.delete("token");
  return `${url.pathname.replace(/^\/+/, "/")}${url.search}`;
}

// The page loads nothing from elsewhere and cannot be framed.
function withSecurityHeaders(c: Context): void {
  c.header("Content-Security-Policy", contentSecurityPolicy);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Cache-Control", "no-store");
}

// The token is single-use and becomes a session cookie.
function sessionGate(token: string, session: string, currentPort: () => number): MiddlewareHandler {
  let unused = true;
  const cookieName = () => sessionCookie(currentPort());
  return async (c, next) => {
    if (!fromHere(currentPort(), c.req.header("host"), c.req.header("origin")))
      return c.text("", 403);

    const known = sameToken(getCookie(c, cookieName()), session);
    const fromQuery = c.req.query("token");
    if (fromQuery !== undefined && (known || (unused && sameToken(fromQuery, token)))) {
      if (!known) {
        unused = false;
        startSession(c, cookieName(), session);
      }
      return c.redirect(withoutToken(c.req.url), 302);
    }
    if (!known) return c.text("", 401);

    await next();
    withSecurityHeaders(c);
  };
}

// Failures answer an empty 500, so paths never leak.
const quietFailure: ErrorHandler = (_error, c) => c.text("", 500);

type ScreenFor = (
  query: URLSearchParams,
) => Promise<{ screen: Screen; map?: MapScreen } | undefined>;

function withPanelAsAsked(
  built: MapScreen,
  source: MapSource,
  analysis: Analysis,
  mode: "simple" | "technical",
  query: URLSearchParams,
): MapScreen {
  let screen = built;
  if ("explanation" in screen.panel)
    screen = { ...screen, panel: { ...screen.panel, explanation: mode } };
  if (source.session) screen = withActivity(screen, analysis, source.session);
  if (source.session && query.get("panel") === "changes")
    screen = {
      ...screen,
      topbar: { ...screen.topbar, changesOpen: true },
      panel: timeline(source.session, analysis),
    };
  return screen;
}

function onScreen(screen: MapScreen, chat: Chat | undefined, select: string | undefined): Screen {
  return chat
    ? withAnswer(screen, chat.answer, chat.id)
    : select
      ? withFocus(screen, select)
      : screen;
}

// A failed build removes only its own cache entry.
function screenBuilder(source: MapSource, project: Project, chats: ChatStore): ScreenFor {
  let builtFor = -1;
  const maps = new Map<string, ReturnType<typeof buildMap>>();
  const settled = async (key: string, map: ReturnType<typeof buildMap>) => {
    try {
      return await map;
    } catch {
      if (maps.get(key) === map) maps.delete(key);
      return undefined;
    }
  };
  const screenFor: ScreenFor = async (query) => {
    const open = openOf(query);
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
    const key = JSON.stringify([open, select, mode]);
    let map = maps.get(key);
    if (!map) {
      map = buildMap(analysis, project, open, {
        ...(source.layouts ? { layouts: source.layouts } : {}),
        ...(select ? { select } : {}),
        ...(source.read ? { read: source.read } : {}),
        ...(words ? { words } : {}),
      });
      maps.set(key, map);
    }
    const built = await settled(key, map);
    if (!built) return undefined;
    const screen = withPanelAsAsked(built, source, analysis, mode, query);
    const chatId = query.get("chat");
    const chat = chatId ? chats.get(chatId) : undefined;
    return { screen: onScreen(screen, chat, select), map: screen };
  };
  return screenFor;
}

// Reads only files the analysis knows, never browser paths.
function codeRoute(source: MapSource) {
  return (c: Context) => {
    const query = params(c);
    const file = query.get("file");
    if (!file || !source.read || source.screen?.()) return c.json({ error: "code" }, 404);
    const code = codeOf(source.current(), file, query.get("symbol") ?? undefined, source.read);
    return code ? c.json(code) : c.json({ error: "code" }, 404);
  };
}

// Questions are JSON; the body limit refuses oversized ones unread.
function askRoute(source: MapSource, screenFor: ScreenFor, chats: ChatStore) {
  return async (c: Context) => {
    const query = params(c);
    if (!c.req.header("content-type")?.startsWith("application/json"))
      return c.json({ error: "question" }, 415);
    let question: unknown;
    try {
      question = ((await c.req.json()) as { question?: unknown }).question;
    } catch {
      return c.json({ error: "question" }, 400);
    }
    if (typeof question !== "string" || question.trim() === "" || question.length > longestQuestion)
      return c.json({ error: "question" }, 400);
    const provider = source.provider?.();
    if (!provider) return c.json({ error: "provider" }, 409);
    const found = await screenFor(query);
    if (!found) return c.json({ error: "map" }, 500);
    if (!found.map) return c.json({ error: "map" }, 409);
    let answer: Answer;
    try {
      answer = await ask(provider, found.map, question.trim());
    } catch (error) {
      return c.json(
        { error: "provider", message: error instanceof ProviderError ? error.message : "" },
        502,
      );
    }
    const chat: Chat = {
      id: randomUUID(),
      at: Date.now(),
      question: answer.question,
      open: openOf(query),
      answer,
    };
    chats.add(chat);
    return c.json(withAnswer(found.map, answer, chat.id));
  };
}

// Static paths may not leave the web root.
function webApp(webRoot: string) {
  return async (c: Context) => {
    const root = normalize(webRoot);
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
        "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream",
      });
    } catch {
      return c.text("", 404);
    }
  };
}

export function createApp(
  options: ServerOptions & {
    token: string;
    session: string;
    currentPort: () => number;
  },
) {
  const app = new Hono();

  app.use("*", sessionGate(options.token, options.session, options.currentPort));
  app.onError(quietFailure);

  const { source } = options;
  const chats = keptChats(source.chats);
  const screenFor = screenBuilder(source, options.project, chats);

  app.get("/api/chats", (c) => c.json(chats.list()));

  app.get("/api/code", codeRoute(source));

  app.get("/api/search", (c) => {
    const query = (params(c).get("q") ?? "").slice(0, longestQuestion);
    if (source.screen?.()) return c.json({ query, functions: [], modulesAndFiles: [], ask: [] });
    return c.json(search(source.current(), query, source.session));
  });

  app.get("/api/map", async (c) => {
    const found = await screenFor(params(c));
    if (!found) return c.json({ error: "map" }, 500);
    return c.json(found.screen);
  });

  app.post(
    "/api/ask",
    bodyLimit({ maxSize: longestQuestion * 4, onError: (c) => c.json({ error: "question" }, 413) }),
    askRoute(source, screenFor, chats),
  );

  app.get("*", webApp(options.webRoot));

  return app;
}

// Tells the browser each new version; pings drop vanished browsers.
function liveSockets(source: MapSource): WebSocketServer {
  const sockets = new WebSocketServer({ noServer: true });
  sockets.on("connection", (socket) => {
    let alive = true;
    const send = (version: number) => socket.send(JSON.stringify({ version }));
    send(source.version?.() ?? 0);
    const unsubscribe = source.subscribe?.(send);
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
  return sockets;
}

// Binds 127.0.0.1 only, on a free port the system picks.
export function startServer(options: ServerOptions): Promise<RunningServer> {
  const token = randomBytes(32).toString("hex");
  const session = randomBytes(32).toString("hex");
  let port = 0;
  const app = createApp({ ...options, token, session, currentPort: () => port });
  const sockets = liveSockets(options.source);

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
      // Unhandled socket errors after an upgrade would end the process.
      socket.on("error", () => {});
      const admitted =
        request.url?.split("?")[0] === "/api/live" &&
        fromHere(port, request.headers.host, request.headers.origin) &&
        sameToken(cookieValue(request.headers.cookie, sessionCookie(port)), session);
      if (!admitted) {
        socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        return;
      }
      sockets.handleUpgrade(request, socket, head, (ws) => sockets.emit("connection", ws, request));
    });
  });
}
