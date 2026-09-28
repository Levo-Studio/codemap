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
  “Codemap”. Nothing has been published; publishing waits for the owner.
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
- **Workspace packages.** `packages/cli` is the one that will be published, as
  `codemapkit`; it is `"private": true` until the owner approves publishing.
  `core`, `server` and `web` are internal (`@codemap/core` and so on) and are
  bundled into the published package later, never published on their own.
  Until their milestone they are empty modules.
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
- **The command palette stays centred.** The export draws it at 400 px on a 1440
  px screen, which is its content centred. It sits at the centre minus half its
  width: exactly as drawn at 1440, centred at other widths. How the rest of the
  layout behaves at other widths is still open.
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
- The provider setup (Claude login, Anthropic key, Ollama) and the first-run
  explanations opt-in notice. Milestone 5 depends on these.
- Defined in the design layer but not built yet, because nothing on the
  static screens moves: the changed marker fading over 30 minutes
  (`changedFadeMinutes`; `neuFaded` is still one fixed value), a new node
  entering (`duration.enter`, `enterScale`) and the semantic zoom
  (`duration.zoom`).
- The production entry renders nothing yet. `App` returns no screen until the
  server gives it data; the screens are reachable only through the dev-only
  fixture page.
- The map has no camera yet. Nodes and connections are placed in map pixels
  over a canvas the size of the viewport; pan and zoom need one transform
  shared by the DOM layer and the Pixi stage.
- The built app loads its assets from `/assets/…`. When the server requires
  the session token on every request, assets and the WebSocket need a way to
  carry it: a cookie set on the first page load, or a path prefix through
  Vite's `base`.
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
render in dark and light, within the tolerances above. Milestone 3, real data
from the code (CLI, index, cache, server), is next.
