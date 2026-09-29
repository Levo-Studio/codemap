# CONTEXT.md — where Codemap stands, and how to pick it up

This file is for an agent or a person opening this repository with no memory of
what came before. Read it first, then read what it tells you to read. It is kept
current: **anything that changes what the next session needs to know is written
here in the same commit that changes it.**

It is not a design document, a changelog or a roadmap. It is the state of the
work, why the work is shaped the way it is, and the traps that have already cost
time.

---

## 1. Read these, in this order

| | |
|---|---|
| `CLAUDE.md` | The working instructions. Settled decisions, the hard rules, the architecture, the commit and branch conventions, and the list of things to ask about before touching. **It wins over anything in this file.** |
| `design/Codemap Design Notes.md` | The design, as concrete values, plus the open questions. Read before the first line of UI work. |
| `design/*.dc.html` | The pixels. Where the HTML and the notes disagree, the HTML wins for pixel values. |
| `README.md` | What Codemap is, for somebody who is not going to work on it. |
| This file | What has actually happened, and what is unfinished. |

---

## 2. The core idea, in one paragraph

Codemap is a local developer tool. `codemap` in a project folder indexes the
code, starts a server on `127.0.0.1` and opens one zoomable map of the whole
codebase in the browser, left to right in call direction, four zoom levels deep.
While an AI coding agent works in the same folder, the map shows where it reads
and where it edits, and marks what changed. It is for people with little
technical background who want to understand what is being built. **It watches
and explains; it never changes code**, and nothing leaves the machine except
requests to the explanation provider the user chose.

---

## 3. Decisions, and why

- **Package `codemapkit`, binary `codemap`.** `codemap`, `codemap-cli`, `cmap`
  and `cmaps` are taken on npm, and npm refuses names that differ from a taken
  one only by punctuation. The owner chose an unscoped name over
  `@levo-studio/codemap`. The product, the repository and the wordmark stay
  “Codemap”. The owner published 0.1.0 (2026-09-29), tried on macOS and on
  Linux in CI; Windows is not tested.
- **The mark has no name.** The export calls it “Call”. The owner does not want
  that name used; in this repository it is “the mark”.
- **`support.js` is not committed.** It is the design tool's runtime, not ours,
  and carries no design. `design/` is otherwise byte-identical to the export.
- **The export is English.** The brief expected German labels; there are none.
  `Codemap Design Notes.md` says so instead of carrying an empty translation
  table.
- **Reference renders** in `docs/design-screenshots/` are made by
  `scripts/render-design/render.mjs` in the Playwright container CI uses
  (`CODEMAP_SUPPORT_JS=/path/to/support.js pnpm render:design`), with CSS
  animations disabled, so the editing pulse and the edge flow are always in
  their first frame, and without subpixel text antialiasing. The visual tests
  render the same way, with `?motion=reduce` on the fixture page, or they
  compare a moving target. The export's standalone Node renders are not among
  them: the Node component collapses to the height of its text outside a
  sized container, so those renders show no design; nodes are compared on the
  screens instead.
- **Workspace packages.** `packages/cli` is the one that is published, as
  `codemapkit`. `core`, `server` and `web` are internal (`@codemap/core` and
  so on), `"private": true`, bundled into the published package and never
  published on their own. Only the owner publishes, with `pnpm publish` in
  `packages/cli` from `main`; `prepack` assembles the package.
- **The licence check has two lists.** Shipped dependencies: exactly the
  licences CONTRIBUTING.md names — MIT, BSD, ISC, Apache-2.0, and OFL for
  Fontsource font packages only. Development tools: the same plus MPL-2.0,
  because Vite, which vitest and the web build need, depends on `lightningcss`
  under MPL-2.0, and development tools are never distributed.
- **Fonts ship as files.** Hanken Grotesk and JetBrains Mono (OFL-1.1) are
  vendored as `woff2` in `packages/web/src/design/fonts/` with their licence
  texts. They are the exact files the export loads from Google Fonts: one
  variable font per subset for all weights. The static per-weight builds on
  npm rasterise weight 600 a few pixels differently, which the visual tests
  catch. No font package is a dependency and no font is loaded from a CDN,
  because Codemap makes no request except to the user's provider.
- **elkjs under EPL-2.0.** The layout engine is offered under EPL-2.0 or
  GPL-3.0. EPL-2.0 is file-level copyleft and allows shipping elkjs unchanged
  inside an Apache-2.0 package; the owner approved it for this one package.
  The licence check names the exception for elkjs only.
- **One catalog for the map and the browser, in core.** The server writes
  the counts and names on the map (“27 files”, “41 routes”), so the English
  catalog lives in `packages/core/src/strings/en.ts` and the web app
  re-exports it. Workspace packages export a `source` condition pointing at
  their TypeScript, which Vite and vitest use, so neither needs core built.
- **The cache is node:sqlite.** `.codemap/index.sqlite` uses Node's built-in
  SQLite, so the cache adds no dependency. It needs Node.js 22.13, where it
  is available without a flag. A cache of another schema version, or one that
  cannot be opened, is deleted and rebuilt: it only saves time.
- **The terminal prints the real address.** 01 Brand shows
  `http://localhost:4317`. The server listens on a random port on 127.0.0.1
  and the browser needs the session token once, so the line shows
  `http://127.0.0.1:<port>/?token=…`; the page drops the token from the address
  on arrival. Whether the Settings port field stays is still open.
- **Explanations off is a pending step.** Without a provider, “Writing
  explanations” stays ○ with the result “off”; the design has no skipped
  state. Layout runs inside “Grouping into areas”, because the design has no
  line for it.
- **Motion, not GSAP.** DOM transitions use Motion (`motion/react`, MIT).
  GSAP is under its own no-charge licence, not an open-source one, so it
  cannot be part of an Apache-2.0 project. Every duration, curve and loop
  comes from `packages/web/src/design/motion.ts`, which also decides reduced
  motion: the system preference or the Settings switch, whichever asks for
  less. The WebGL map runs its loops on the Pixi ticker from the same values.
- **WebGL for connections, DOM for nodes.** PixiJS draws the connections,
  their arrowheads and the flowing dashes. Nodes stay DOM elements above the
  canvas: semantic zoom keeps the number on screen readable, and only the DOM
  draws text, dashed borders and outlines the way the design does.
  Zoomed in, the camera zooms the nodes with CSS zoom, not a scale
  transform, so the browser lays them out again at the new size and their
  text stays sharp. Zoomed out, it scales them: in the owner's Safari,
  CSS-zoomed text stopped shrinking below a smallest size while its boxes
  went on shrinking, which pushed the names out of the nodes (a smallest
  font size, set or WebKit's own, is the likely reason; headless browsers
  did not show it). Scaled text has no such floor. The connections are
  drawn again at each scale.
- **Visual comparisons run without subpixel text antialiasing.** Chrome gives
  text above a WebGL canvas greyscale antialiasing instead of subpixel
  antialiasing, so a render with the map's canvas never matches a render
  without it. The references and the visual tests both run Chromium with
  `--disable-lcd-text`.
- **How exact the visual tests are.** Screens without the map (the parts,
  indexing, empty, settings) must match their references in every pixel and
  channel. The map screens cannot: WebGL antialiases the connections
  differently from the design's SVG, and the GPU does not rasterise the same
  line identically twice (two renders of the same reference differ by ±2 in a
  few pixels). Measured with colour differences up to 0.01 counted as equal
  (about ±2 of 255 in a grey), at most 865 of 1,296,000 pixels differ, all
  along connections; the map tests allow 1,000. A node fill off by 4 of 255
  changes about 25,000 pixels and fails; that was checked. Playwright's default
  tolerance of 0.2 per pixel is far too loose for this project, and even 0.02
  lets a grey off by 4 through.
- **Design values outside the browser have one home per package.** The
  analysis computes the map's geometry, so node sizes, margins, container
  padding and layout spacing live in `packages/core/src/design.ts`; the
  terminal's palette and column widths in `packages/cli/src/design.ts`. The
  browser's camera reads the map margin from core rather than copying it.
- **The session token becomes a cookie.** The first request carries
  `?token=…`; the server answers with an HttpOnly, SameSite=Strict cookie
  named after the port and redirects to the address without the token. Every
  later request, assets included, carries the cookie; the server also checks
  `Host` and `Origin`, and its CSP allows nothing but itself.
- **A map fits its viewport; a static screen does not move.** The camera
  shows a map that fits at 1:1 and unmoved, exactly as the design draws it,
  and scales a larger one down to fit. The fixture screens get no navigation
  and keep the design's 1:1 camera, so the visual tests stay exact.
- **What is open is in the address fragment** (`#open=<id>&open=<id>`), so a
  reload keeps it. There is one map; the server builds it once per set of
  opened nodes and version, and the browser takes what the server could not
  open (gone, or inside something closed) out of the address.
- **The command palette stays centred.** The export draws it at 400 px on a 1440
  px screen, which is its content centred. It sits at the centre minus half its
  width: exactly as drawn at 1440, centred at other widths. How the rest of the
  layout behaves at other widths is still open.
- **The stable layout is Codemap's own, around elk.** elk lays out the map
  the first time. Its interactive strategies, seeded with the old positions,
  still moved nodes by up to a column when one was added, so a live change
  extends the stored layout instead (`stable.ts`): existing nodes and the
  routes a new node is not in the way of stay, a new node takes the nearest
  free place in its role's column, below its parent where they share one, and
  new connections are routed by `route.ts` over the gaps between nodes and,
  where there is a way, around the connections already drawn. Layouts are
  stored in the cache for the top level and for what each opened node
  holds; layouts an older version kept for each set of opened nodes stay in
  the cache unused. Only a change to code or its
  configuration makes a new version, and the camera belongs to the window,
  so neither a change nor an opened node moves it by itself.
- **A node opens in place, at the owner's request** (2026-09-28). There is
  no second map: an opened area shows its modules inside it, a module its
  files, a file its functions, and the rest of the system stays around it.
  Each opened node is the design's filled container around its contents,
  with the container's padding and title, grown where its card was (below);
  a connection is drawn between the innermost nodes on the map that hold
  its ends. The system's columns stay
  the columns. The four zoom levels are how deep the opened nodes reach.
  One path is open at a time, as the owner asked (2026-09-28), so the map
  does not fill up: opening a node closes every opened node that does not
  hold it, and a search result opens only what its node is in. An address
  that names several paths still shows them all, as it names them.
- **Live states come from the session** (`session.ts`, `activity.ts`): what
  changed since Codemap started, compared batch by batch. A change that only
  moves lines is minor: it marks nothing but counts as editing while it
  happens. A connection is new when nothing it stands for existed at the
  start, and active while it is new and the agent writes in its caller.
- **Two Codemaps may share a project.** They share `.codemap/`; whatever one
  cannot read or write while the other holds the database is not cached.
- **Providers without SDKs.** The Anthropic API and Ollama are plain HTTP,
  reached with `fetch`; Claude with the user's own login goes through the
  `claude` command they installed, in print mode, with all tools, MCP
  servers, skills, the user's settings and hooks and session saving off, in
  a fresh temporary folder removed afterwards. Every request gives up after
  two minutes; a run of explanations stops at a refused key or five failures
  in a row; a provider that says it is busy (429, or Anthropic's 529) is
  asked again after 2, 4 and 8 seconds first, since thousands of
  explanations reach a limit in the ordinary way. The Claude Agent SDK is
  not used: its
  licence (“see LICENSE in README”) is not one Codemap may ship. Explanations
  use the fast model (Haiku 4.5, or `haiku` for the command), answers the
  best one (Sonnet 5, or `sonnet`); Ollama uses the model the user names.
- **Settings and keys live in the system keychain** (`@napi-rs/keyring`):
  the provider, the Ollama model and whether explanations are on as one
  entry, the Anthropic key as another. Nothing is written to a file.
- **Explanations follow the code.** After the first run, what changed is
  explained again once the agent has paused. Everything is cached by the
  hash of what it was written from, in `.codemap/index.sqlite`, so the next
  start explains only what is new or changed since.
- **Ask reads the map on screen.** The question goes to the provider with the
  nodes on the map shown, what they do and which calls which; the answer
  may only name nodes of that map. Each question stands alone; “Explain step
  N” asks about that step by its name and text.
- **codemapkit is one bundle with its npm dependencies beside it.** Vite,
  which already builds the web app, bundles the CLI with the workspace's core
  and server into `packages/cli/bundle`; the npm dependencies stay imports and
  are the package's dependencies, since several bring binaries built for the
  user's platform. The package carries the built web app, the grammars and
  the licence texts of the fonts and grammars and the notices of everything
  the web app bundles (`licenses/THIRD-PARTY-NOTICES.txt`). Packing assembles
  it (`prepack`); `pnpm test:package` installs the tarball and runs it, in CI
  too.
- **Codemap is open source (Apache-2.0).** Fuel, Score and Retain are
  source-available; Codemap is the exception and says so.

---

## 4. Design, which is not decoration here

`design/` **is** the design, and it is read-only. Every colour, size, radius,
padding, weight, line-height and duration is in it as a concrete value. Take
them exactly: no rounding to a grid, no “close enough”. The screens use sizes
that are not in the Foundations tables (`10.5`, `11.5`, `13.5`, off-scale
spacings); those are drawn values and transfer as written.

The export has a few values that disagree with each other: the Topbar has its
own light-mode line and field colours, the error background is `#221416` in
one place and `#211416` in another, the mark's light orange is `#d9822b` on the
brand sheet and `#c2651a` in the app. They are open questions 1–3 in the notes.
Until the owner answers, **the HTML of the screen being built wins**.

**If a value you need is not in the export, that is a question for the owner —
not a gap to fill with taste.** A number nobody can trace is worse than a number
that is slightly wrong.

---

## 5. The traps

**The export does not render from disk.** The pages load `./support.js` and the
runtime fetches imported components over HTTP. `pnpm render:design` serves
them with a `support.js` from the original export that you point it at; the
file never enters the repository. Component props (`theme`, `mode`) are set by
wrapping the component in a small page with `<dc-import name="Map System"
theme="light" mode="ask">`, which is how `06 Screens` does it. **An attribute
is always a string**: a number prop such as the zoom control's `level` has to
come from the wrapper's own logic, or the component compares `"2"` with `2`
and marks nothing. The first reference renders had exactly that bug.

**npm name similarity.** `npm view <name>` returning 404 does not mean npm will
accept the name. npm rejects a new name that matches a taken one after removing
`-`, `_` and `.`. Check the variants too.

**A 404 in the console while rendering the export** is the favicon request, not
a missing component.

**Tests run in Vite's server environment.** Export conditions set only under
`resolve` do not reach it: the `source` condition has to be under
`ssr.resolve` as well, or tests import the other packages' last build.
`packages/server/src/workspace.test.ts` fails if that happens again.

**Deleting a `dist` folder by hand breaks `pnpm typecheck`**: `tsc -b` still
thinks the project is built. Delete the `*.tsbuildinfo` files with it.

**Vite inlines small assets as `data:` addresses**, which the server's CSP
refuses. `assetsInlineLimit` is 0; `pnpm test:app` fails on any refused or
missing resource, so a change there shows up.

**Visual tests only match inside the container.** Fonts rasterise
differently on macOS and on Linux, so `pnpm test:visual` on a Mac fails
against the Linux references. Run `pnpm test:visual:container`, which runs the
same command in the Playwright image CI uses, with its own `node_modules` in
Docker volumes.

**iCloud Drive and similar sync clients make conflict copies.** A checkout
inside a synced folder (such as a synced Desktop) gets files named
`file 2.json`, `index 2.ts` when git rewrites files under it (reset, rebase,
checkout), and inside `node_modules`. They are untracked and break the
typecheck with duplicate declarations. Symptom: errors in a file whose name
ends in ` 2`. Delete them (after checking `git ls-files` does not list them)
and reinstall `node_modules`, or keep the checkout outside the synced folder.

**pnpm puts its store next to the project in a container.** Without its own
volume, `pnpm install` inside the container writes `.pnpm-store/` into the
checkout. `scripts/in-container.sh` gives the store a Docker volume, and
`.pnpm-store/` is ignored in case anything else runs pnpm there.

**pnpm is pinned to 10.x on purpose.** `packageManager` says `pnpm@10.34.5`.
pnpm 10 cannot start pnpm 12 through the `packageManager` switch (it fails with
`ENOEXEC` on the downloaded shim), so pinning 12 breaks every machine that
still has pnpm 10 installed globally. Move to 12 only together with the
global install.

---

## 6. What is deliberately unfinished

These have no design and are **not built** until the owner answers. Work that
does not depend on them continues.

- Onboarding steps 2 and 3. Only step 1 of 3 is drawn.
- Hover states on the map beyond the node hover state: edge hover, when the
  tooltip appears, hover on panel rows.
- Settings sections Map, Explanations, Server, Shortcuts. Only General is drawn.
- **The provider setup and the opt-in are asked in the terminal**, because no
  screen draws them: `codemap setup` chooses the provider, and the first start
  in a terminal says that parts of the code go to it and asks once whether to
  turn explanations on. `--no-explain` keeps them off for one run. The texts
  are in `packages/cli/src/strings/en.ts`. When the design draws the Settings
  sections Explanations and the first-run notice, they move to the browser.
- **The map opens before the explanations are written, at the owner's
  request** (2026-09-29): an average project of theirs has about 2,700, and
  waiting for them took long. The terminal keeps “Writing explanations”
  above the server line, counting under the address until they are done;
  the indexing screen shows them still to come; the browser is told of new
  ones every two seconds, so the map fills in. A file is explained with its
  functions in one request, an area's modules in one, the areas in one, at
  most twelve things a request and four requests at a time: a few hundred
  requests where there were thousands. Each explanation is still cached by
  the hash of what it is written from, so a restart asks only for what is
  new or changed. The design draws the explanations written before the
  server starts; how the map should show them arriving is not drawn.
  A file's key is now made from its functions' code, so the first start
  after 0.1 writes every file, module and area once more; the functions are
  kept. A local model (Ollama) is asked for at most four things in 6,000
  characters, since its context is short. The terminal redraws its block,
  address included, while they are written; a terminal resized meanwhile
  may leave a line of it behind.
- **What the `claude` command may still read.** Its settings, hooks, tools
  and MCP servers are off, but the user's own memory file
  (`~/.claude/CLAUDE.md`) may still reach it with the prompt. Only the
  user's own text, not the project's; `--bare` would drop it but also the
  sign-in, which lives in the keychain.
- **Two functions of the same name in one file share an id** (`path#name`),
  and so one explanation: methods called the same in two classes, or
  overloads. The id comes from Milestone 3; telling them apart means an id
  that names the owner.
- **CLAUDE.md names the Claude Agent SDK** for the user's own login. Its
  licence rules it out, and the `claude` command stands in for it; the owner
  confirms that, or names another way.
- **How a node is selected and opened is not in the design**, which draws the
  selected state only. A click selects (the panel shows it), a double click or
  Enter opens the node in place and selects it, Space selects, and a click on
  the empty map clears the selection. An opened node is selected and closed
  (with everything opened inside it) by its box's title, and drawn selected
  with the node's outline around the whole box; the rest of the box drags
  the map. A crumb selects the area, module or file it names. The focus
  follows Enter from a node to its box's title and back.
- **An opened node grows where its card was, as the owner asked**
  (2026-09-28): the map moving around on every opened node disoriented.
  The top level stays exactly as the system map lays it out; the opened
  node grows from its card's top left corner, what lies right of it moves
  right by as much as it widened, what lies below it in its column moves
  down by as much as it grew, and everything else stays. What a node holds
  is laid out, and kept, the same way inside it. The movers glide over
  480 ms, and the camera moves only when the opened node does not fit
  where the map is shown. Connections whose ends moved alike keep their
  routes; the others are routed around the nodes near their ends, which
  may cross where a wide search would not have: routing every connection
  into a large opened area with the wide search took over a second. Those
  routes go around the nodes, not the boxes, so one between two nodes in
  the same box may leave it and come back; whether a box's border should
  count as a node's is a question for the owner. What lies right of an
  opened node moves right however far above or below it lies, which keeps
  the columns aligned; two opened side by side, which only an address can
  ask for, push it twice.
- **`codemap --help` has no design.** The export draws the terminal's
  banner and progress, not a help; it prints the usage plainly, in the
  CLI's catalog.
- **Opened nodes inside opened nodes have no design.** The design notes say
  the focused area, module or file is the one filled container on screen;
  an opened area's box now holds the boxes of its opened modules, and those
  of their files, all with the container's fill and border, told apart only
  by the border. Following a selection dims nodes, not boxes: an opened box
  it does not reach stays as drawn while what is in it dims. How nested
  boxes, and dimmed ones, should look is a question for the owner.
- **An opened node's box is at least as wide as its title**, as the owner
  asked (2026-09-28): its name and count, with the 20 px either side. The
  layout runs on the server, which cannot measure text, so the width of
  every title character is measured once from the shipped fonts
  (`scripts/text-widths.mjs` writes `packages/core/src/design-text.ts`);
  run it again when a font or the title's style changes.
- **Following a selected node goes beyond the design, at the owner's request**
  (2026-09-28). S4 draws a selected node with its outline only; asked for a
  click to single out a node's connections, a selection now dims every node
  it does not connect to and draws its connections in the look of an
  answer's path. That look belongs to Ask in the design notes; whether the
  selection gets a look of its own is a question for the owner. What the
  agent does is never dimmed by it.
- Defined in the design layer but not built yet: the changed border fading
  continuously over the setting's minutes (the fading state is one fixed
  value, with its minutes ago counted once a minute) and the semantic zoom,
  whose 480 ms (`duration.zoom`) the camera's flights and the gliding nodes
  take for now.
- **Reading is not shown.** 04 Map Language has a Reading state and the panel
  lists what the agent reads, but reading a file leaves no file event, and
  CLAUDE.md makes the watcher the source of truth. Without another source
  (the agent's own log, for instance) the state stays unused; a question for
  the owner.
- **How long the live states last is not in the export.** A node counts as
  being edited while its files changed in the last 10 seconds, shows Changed
  for a minute, then fades until the setting's 30 minutes are over; the
  disconnected banner counts down from 5 seconds, and an open map is fetched
  again every minute so the minutes ago keep counting. The values live in
  `live` in `packages/core/src/design.ts` and `packages/web/src/design/metrics.ts`.
- **Started in the wrong folder.** Codemap reads whatever folder it is started
  in, the home folder or the whole disk included; nothing warns first or
  stops at a size. The design has the empty screen for a folder without code,
  nothing for one with far too much. A question for the owner: refuse the
  home folder and the disk's root, or warn above a number of files.
- **Which call is Active.** 04 Map Language: “the agent is writing along this
  call”. Codemap makes a call active when it is new this session and the
  agent is writing in its caller; an existing call out of the file being
  edited stays a plain call, since a file event does not say which call the
  agent works on. A question for the owner.
- **The changes timeline without a provider** (design question 13) says what
  the code shows for certain: “New area Mail”, “New module Dunning”, “Uses
  Stripe”, “New file retry.ts”, “charge.ts changed” with the functions it
  added, changed or removed. Summaries such as “Payments handled once” need a
  model and come with Milestone 5. Minor's “Show” stays as drawn: the timeline
  holds only their count. The filter shows Structure or Behavior alone.
- Calls matched only by name, not through an import, have no look in the map
  language. They are kept in the graph (`confidence: "name"`) and drawn like
  any call; the design should say whether they look different.
- Without explanations the panels' texts stay empty. The changes timeline
  still says what the code shows for certain; written summaries of changes
  (“Payments handled once”) are not built yet.
- **The code view is not in the export.** The owner asked for it
  (2026-09-28): a “Show code” button in the file and function panels shows
  the function's lines, or the file's first 400, in the signature's box. Its
  button, gaps and 360 px height are Codemap's own values, not the design's.
- **The palette searches by name.** It finds functions, modules and files
  whose names contain what was typed; what they do is not searched, which
  would need the explanations to be on. The design draws the result, not how
  it is found.
- **How the camera moves is not in the export.** The owner asked for a more
  responsive zoom (2026-09-28): the zoom buttons step by 1.5, a pinch or a
  wheel with Ctrl zooms by e^(0.01 × delta), each event counted at most 50 px,
  a line of a line-based wheel as 16 px and a page of a page-based one as
  800 px; zoom stays between 0.1 and 4,
  and the fit keeps 60 px right and 64 px below (the layout's own left and
  top margins, mirrored). All of it lives in `camera` in `metrics.ts`.
  Opening a node, or picking it in the palette or a crumb, flies the camera
  to it over the semantic zoom's 480 ms, framed like an answer's steps (with
  the fit's margins, never beyond 1:1), the zoom growing evenly on the way.
- **“No lines cross” cannot hold for every codebase.** Two callers that both
  call the same two callees cannot be drawn in two columns without one
  crossing, and real call graphs are full of that. elk removes most crossings
  (on taxonomy, 932 without crossing minimisation, 247 with it, in 11 of 229
  maps; on this repository 145, in 11 of 148). The layout tests hold the rule
  on graphs that can be drawn without crossings, and a connection added live
  goes around the ones drawn where a way within 960 px of its ends exists.
  Whether the rest should look different (a hop or a gap at the crossing,
  which the map language does not draw) is a question for the owner.
- **The live map is told, not patched.** CLAUDE.md says “graph diff →
  WebSocket patch”. `/api/live` sends only the project's version, and the
  browser fetches the map again: a map is a few kilobytes over
  loopback, and one source for every map keeps states, panels and timeline
  in step. A patch protocol would cost a diff of every view and a second way
  to arrive at the same map. Built this way pending the owner's word.
- **A live change can still move nodes in one case.** Where a new node cannot
  be placed without moving others (no room for a new column between two),
  the map is laid out anew by elk, and nodes move. CLAUDE.md says existing
  nodes never move; whether a map should rather grow sideways, or show the
  node elsewhere, is a question for the owner.
- **Two layout spacings are not in the export.** How far a connection keeps
  from a node (12 px) and from the next connection (10 px) are passed to elk
  and live in `packages/core/src/design.ts`.
- **Terminal text the export does not show.** “open this address in your
  browser” (when no browser could be opened), the three error lines (“… is
  not a folder Codemap can read.”, “Unknown option …”, “Codemap stopped: …”)
  and the options `--no-open` and `--version`. All of it is in
  `packages/cli/src/strings/en.ts` and is a question for the owner. In the
  browser, the names for assistive technology on controls that show only a
  glyph are not in the export either: “Zoom in”, “Zoom out”, “Fit the map to
  the window”, “Close changes”. The shares of the progress bar per phase
  (`phaseWeight` in core's design module) are Codemap's own too.
- **The cache holds file facts and layouts.** The graph is not stored: it is
  rebuilt from the cached facts in milliseconds. Explanations come with
  Milestone 5.
- **The `ignore` package (MIT)** reads `.gitignore` files. It is not among the
  dependencies CLAUDE.md names, and is justified in the commit that adds it;
  the owner confirms it.
- **The `ws` package (MIT)**, with `@types/ws` (MIT) for development, is the
  WebSocket server of `/api/live`. CLAUDE.md names a WebSocket, not a
  package; `@hono/node-ws` would wrap `ws` but requires the older
  `@hono/node-server` 1.x. The owner confirms it.
- **The `@napi-rs/keyring` package (MIT)** reaches the system keychain, which
  CLAUDE.md requires for keys without naming a package. The owner confirms
  it.
- **Chat texts the export does not show**: the spoken names “Send” and “Close
  the answer”, “Ask needs a provider of your own. Run codemap setup in the
  terminal.” and “No answer from the provider: …”, in the core catalog.
- **The favicon is the mark as drawn at 16 px**, from 02 Brand Sheet. The
  pixel-fitted favicon the notes describe is not in the export (question 17).
- Bundled connections have no design render to compare against: no screen of
  the export bundles edges.
- Everything else in “Open questions” at the end of the design notes: the port
  and URL shown in the terminal versus the random port and session token, the
  terminal line for the layout phase, rules for back-edges and external
  service placement, the source of the error state, the changes timeline
  without a provider, “Choose a folder…”, and behaviour at widths other than
  1440.

---

## 7. The owner, and how work is delivered to them

Julius Grimm, Levo Studio. High technical knowledge: skip beginner
explanations, name trade-offs, say what you would do rather than listing
options. Once a decision is made, stop arguing and build it.

The company name is **Levo Studio**, both words, always.

Reports come in German, typed fast; spelling is not a signal. Write back in
German, directly. When a request could mean two materially different things,
build the reading you believe and say in one sentence which one you built.
Questions that only the owner can answer are asked together, with a
recommendation, not one at a time.

Standing instructions:

- **Work in milestones.** Each is finished, reviewed and merged by the owner
  before the next one starts. At the end of each: a short report of what works,
  what does not, what was decided and why, and which questions need the owner.
- **Only the owner merges to `main`.** Sub-agents never merge. Pushing to
  `main` is asked about first.
- **Writer, reviewer and main gate are three different agents.** Findings go
  back to the writer.
- **One commit per logical change**, pushed as each piece is finished. No AI
  attribution anywhere.

---

## 8. How to work in this repository

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm test:visual:container
pnpm check:licenses
pnpm build
pnpm test:app          # builds, runs the CLI on this repository, walks the map
pnpm package           # assembles codemapkit in packages/cli
pnpm test:package      # packs it, installs the tarball, runs it
scripts/fetch-test-repos.sh   # the external projects Codemap is tried on
```

A new feature starts from a fresh branch in its own worktree:

```bash
git fetch --all --prune
git worktree add ../codemap-wt-<slug> -b feat/<slug> main
```

---

## 9. Where the work stands

Milestones 1 and 2 are done: the foundation, and the browser interface as static
screens with the design's demo data, every screen and mode matching its design
render in dark and light, within the tolerances above. Milestone 3 is done:
`codemap` reads a project with tree-sitter, groups and lays it out, caches it
in `.codemap/`, serves it on 127.0.0.1 and opens a map that can be panned,
zoomed and walked from the system down to functions. It is tried on this
repository and on taxonomy (`scripts/fetch-test-repos.sh`). Milestone 4 is
done: the browser opens at once on the first read, the map follows every
change without a reload and without moving what the user has seen, shows what
the agent is editing and what changed, keeps a changes timeline, and shows
itself disconnected when Codemap stops. Milestone 5 is done: with a provider
of the user's own, every function, file, module, area and the app are
explained in Simple and Technical words, bottom-up and cached, and questions
are answered in numbered steps on the map; a click selects a node for the
panel. Milestone 6 is done: codemapkit is assembled as one package, with the
notices of everything it bundles, and tried as a user installs it; CI runs
that on Node.js 22.13.0, the oldest it supports, and the app's end-to-end
tests on 24. An older Node.js is told what Codemap needs. The dependencies
have no known vulnerabilities, and a generated project of 2,000 files and
10,000 functions is read in a third of a second, each map built in at most
about a second.

**Installing with npm shows one notice:** npm does not run
`@parcel/watcher`'s install script unless allowed, and says so. The script
only compiles the watcher where no prebuilt binary fits the platform; macOS,
Linux and Windows on x64 and arm64 have one, so nothing is missing.

**Publishing is the owner's step**, and nothing has been published. To
publish: remove `"private": true` from `packages/cli/package.json`, set the
version, run `pnpm test:package`, then `pnpm publish` in `packages/cli`,
which assembles the package first (pnpm, not npm: it turns the workspace's
`workspace:*` versions into real ones), from an npm account that owns
`codemapkit` (the name, and the similar `codemap-kit`, were free on
2026-09-28). The package's
`devDependencies` name the workspace's private packages; npm does not install
a dependency's development dependencies, so they do no harm, but they can be
left out of the published manifest if the owner prefers.
