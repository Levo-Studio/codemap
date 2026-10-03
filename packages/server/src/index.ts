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
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie } from "hono/cookie";
import { WebSocketServer } from "ws";

// The local server the browser talks to. It reads the user's source code, so
// it is closed to everything but the one browser tab the terminal opened:
// bound to 127.0.0.1 only, on a random free port, every request carrying the
// session the one-time token was exchanged for, and any request whose Host or
// Origin names something else refused. Nothing is logged.

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
  // Where the chats are kept, across starts; without it, for this run only.
  chats?: ChatStore;
}

// The chats of this run, kept here as well as in the cache: a chat the cache
// could not write (a full disk, a locked file) is still listed and shown
// again for as long as Codemap runs. Without a cache, only here.
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
  // The built web app to serve.
  webRoot: string;
}

export interface RunningServer {
  // What the terminal opens: carries the token once, in the query.
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

// How long the browser keeps its session: longer than any run, which ends
// it anyway, since every start makes a new one.
const sessionSeconds = 30 * 24 * 60 * 60;

// The cookie the session is kept in, named after the port, so two Codemaps
// on one machine do not share one.
const sessionCookie = (port: number) => `codemap_${port}`;

// How often an open live connection is checked, so one whose browser went
// away without closing it is dropped.
const heartbeat = 15_000;

function sameToken(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// The nodes the browser has opened on the map, each once and in one order,
// so the same map is asked for by the same key.
function openOf(query: URLSearchParams): string[] {
  return [...new Set(query.getAll("open"))].sort();
}

// The hosts the browser may use to reach this server.
const hostsOf = (port: number) => [`${host}:${port}`, `localhost:${port}`];

// Whether a request's Host and Origin name this server, and nothing else: a
// page on another site that makes the browser call it names itself in
// Origin, or reaches it through another name in Host.
function fromHere(port: number, hostHeader: string | undefined, origin: string | undefined) {
  const hosts = hostsOf(port);
  const origins = hosts.map((h) => `http://${h}`);
  return !!hostHeader && hosts.includes(hostHeader) && (!origin || origins.includes(origin));
}

// The query of a request.
const params = (c: { req: { url: string } }) => new URL(c.req.url).searchParams;

function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

export function createApp(
  options: ServerOptions & {
    // What the address the terminal prints carries, once.
    token: string;
    // What the browser that brought it keeps in its cookie instead.
    session: string;
    currentPort: () => number;
  },
) {
  const { token, session } = options;
  // The address may be seen by others: in the process list while a browser
  // started with it runs, in the browser's history. So its token lets one
  // browser in, once, and that browser goes on with a session of its own
  // that never appears in an address.
  let unused = true;
  const cookieName = () => sessionCookie(options.currentPort());
  const app = new Hono();

  app.use("*", async (c, next) => {
    if (!fromHere(options.currentPort(), c.req.header("host"), c.req.header("origin")))
      return c.text("", 403);

    // The session is kept in its cookie (see sessionCookie), which outlives
    // the browser's own session, so the printed link opens the map again
    // after the browser was closed. The address is then shown without the
    // token, on this server only.
    const known = sameToken(getCookie(c, cookieName()), session);
    const fromQuery = c.req.query("token");
    if (fromQuery !== undefined && (known || (unused && sameToken(fromQuery, token)))) {
      if (!known) {
        unused = false;
        setCookie(c, cookieName(), session, {
          httpOnly: true,
          sameSite: "Strict",
          path: "/",
          maxAge: sessionSeconds,
        });
      }
      const url = new URL(c.req.url);
      url.searchParams.delete("token");
      return c.redirect(`${url.pathname.replace(/^\/+/, "/")}${url.search}`, 302);
    }
    if (!known) return c.text("", 401);

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

  // The map with the nodes the browser opened, built once per version of the
  // project and given the session's activity. With panel=changes, and a
  // session, the panel is the changes timeline.
  const { source } = options;
  let builtFor = -1;
  const maps = new Map<string, ReturnType<typeof buildMap>>();
  const chats = keptChats(source.chats);
  // The screen as the query asks for it, or none when its map failed to build.
  const screenFor = async (
    query: URLSearchParams,
  ): Promise<{ screen: Screen; map?: MapScreen } | undefined> => {
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
      map = buildMap(analysis, options.project, open, {
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
      return undefined;
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
    // A chat the browser shows lays its answer on the map, as when it was
    // asked; otherwise the selection is followed. The map the question is
    // asked about stays unfocused.
    const chatId = query.get("chat");
    const chat = chatId ? chats.get(chatId) : undefined;
    const onScreen = chat
      ? withAnswer(screen, chat.answer, chat.id)
      : select
        ? withFocus(screen, select)
        : screen;
    return { screen: onScreen, map: screen };
  };

  // The chats asked, the latest first, for the browser to list.
  app.get("/api/chats", (c) => c.json(chats.list()));

  // The code of a function or a file for its panel: only files the analysis
  // knows, read through the source, never a path the browser makes up.
  app.get("/api/code", (c) => {
    const query = params(c);
    const file = query.get("file");
    if (!file || !source.read || source.screen?.()) return c.json({ error: "code" }, 404);
    const code = codeOf(source.current(), file, query.get("symbol") ?? undefined, source.read);
    return code ? c.json(code) : c.json({ error: "code" }, 404);
  });

  // The command palette's search over the project as it is now.
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

  // Ask: a question about the map the user is looking at, answered with the
  // user's own provider in steps on it. It only explains.
  app.post(
    "/api/ask",
    bodyLimit({ maxSize: longestQuestion * 4, onError: (c) => c.json({ error: "question" }, 413) }),
    async (c) => {
      const query = params(c);
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
      if (
        typeof question !== "string" ||
        question.trim() === "" ||
        question.length > longestQuestion
      )
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
        "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream",
      });
    } catch {
      return c.text("", 404);
    }
  });

  return app;
}

export function startServer(options: ServerOptions): Promise<RunningServer> {
  const token = randomBytes(32).toString("hex");
  const session = randomBytes(32).toString("hex");
  // The system picks a free one; the address it bound is known once it listens.
  let port = 0;
  const app = createApp({ ...options, token, session, currentPort: () => port });

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
        sameToken(cookieValue(request.headers.cookie, sessionCookie(port)), session);
      if (!admitted) {
        socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        return;
      }
      sockets.handleUpgrade(request, socket, head, (ws) => sockets.emit("connection", ws, request));
    });
  });
}
