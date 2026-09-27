# CLAUDE.md — Working instructions for Codemap

This file describes **Codemap** and nothing else. No infrastructure, no servers,
no deployment, no other projects. What is written here applies to work in this
repository.

## Read first

Four files in the repo apply alongside this one. Read them before touching
anything:

- `CONTEXT.md` — where the work stands, the decisions behind it, the traps that
  have already cost time, and what is deliberately unfinished.
- `CONTRIBUTING.md` — the same rules as here, in full prose and written for
  humans. In case of doubt, what it says wins.
- `README.md` — what Codemap is, how it is built, what it does not have.
- `LICENSE` — Apache License 2.0. Open source. The licence does not cover the
  name “Codemap”, the Levo Studio mark, the logo or the app icon.

And one folder: **`design/`** — the design export. See “Design fidelity” below.
It is the first thing you read and the last thing you check, and it is never
edited.

## Language

**Everything in this repository is English.** Interface, string catalogs, code,
comments, commit messages, branch names, documentation, issues, pull requests.
There is no German anywhere, not even in a comment.

The export turned out to be English already; `Codemap Design Notes.md` records
that. Should a later refresh bring German labels, **the labels are translated
and only the words change. Geometry, weight, letter-spacing, casing, opacity
and colour do not.**

## What Codemap is

Codemap is a local developer tool. You run `codemap` in a project folder. It
prints a short progress sequence in the terminal, indexes the codebase, starts a
local web server and opens a browser UI: one zoomable, live map of the whole
codebase. It exists so that someone with little technical background can
understand how an app is built, end to end, while an AI coding agent changes it
at high speed.

- The npm package is **`codemapkit`**; the binary it installs is **`codemap`**.
  `codemap`, `codemap-cli`, `cmap` and `cmaps` belong to other people on npm.
  Nothing is published without the owner asking for it.
- Codemap **watches**. It never controls the agent, never edits the user's
  files and never runs their code.
- The map reads left to right in call direction, has four zoom levels (System →
  Area → File → Function), and shows what the agent reads and edits as it
  happens.
- Explanations and the Ask chat run on **the user's own provider**, opt-in.
  Without one, everything else works.

## Design fidelity — the hard rule

`design/` holds the design export, committed so that every writer and every
reviewer reads the same bytes:

- `Index.dc.html` — the entry page. Links to every other page.
- `03 Foundations.dc.html`, `04 Map Language.dc.html`,
  `05 Components.dc.html` — the tokens, the map language, the components.
- `Map System`, `Map Area`, `Map File`, `Map Function`, `App States` — the
  screens, each with `theme` and `mode` props. **The files with the pixels in
  them.**
- `Node`, `Topbar`, `ChatBar`, `Legend`, `ZoomCtl` — the shared parts.
- `01 Brand.dc.html`, `02 Brand Sheet.dc.html` — the mark and the terminal
  output.
- `Codemap Design Notes.md` — the written spec: every token, the map language,
  the component inventory, the screen list and the open questions.
- `Modern Dark.dc.html`, `Codemap Directions.dc.html` — the Phase 1 mockup.
  History only; nothing is built from them.

`support.js`, the generic dc-runtime, is not in the repo and never ships. It
contains no design information. Do not spend a token on it. Reference renders
of every page and mode are in `docs/design-screenshots/`.

**Every writer and every reviewer reads `design/` before the first line of code
or the first line of a review. No exceptions, including for a one-line change.**

- **`design/` is read-only.** It is never edited to match the code. If the code
  and the design disagree, the code is wrong. If you think the design itself is
  wrong, that is a question for the owner.
- Where the HTML and the notes disagree, **the HTML wins for pixel values** — it
  is what was actually drawn — and **the notes win for behaviour**.
- No colour, size, spacing, radius, opacity, letter-spacing, line-height or
  duration is invented, rounded, or implemented “close enough”. Fractional
  values (`10.5`, `12.5`, `13.5`) are design values. HTML pixels are CSS pixels.
- If a value you need is not in the export, that is a question for the owner,
  not a gap you fill with taste. The known ones are listed at the end of the
  design notes.
- **A reviewer who waves through a deviation from the design has not done the
  job.** The deviation is the thing the review is for.

The export is a snapshot. A refresh lands as its own commit, so a design change
is visible as a diff rather than appearing inside a feature.

### What the design settles

Settled by the owner. Not reopened by an agent.

- **Left to right in call direction.** System columns: Entry → API → Features →
  Data & Services. Every arrow goes from caller to callee. No line runs through
  a node. No lines cross. The layout engine holds these rules for real
  codebases, not only for the demo, and after every live patch.
- **Four zoom levels:** System → Area → File → Function. At function level every
  function carries its plain-language explanation.
- **Status is never colour alone.** Colour plus shape plus word:
  `● Agent editing`, `◌ Reading`, `◆ Dunning added`.
- **The chat only explains.** Ask mode only. No build mode, no allow/deny
  prompt. The chat never changes code. Answers show numbered steps on the map.
- **Colour carries status only.** Everything else is neutral. Dark and light
  are equal and built from the same named tokens. The primary button is ink,
  never orange: orange belongs to the agent.
- **The mark** is two nodes and a connection on a 24 grid, the right node filled
  orange. It has no name of its own; the export's name for it is not used. The
  terminal banner is the real mark in block characters. The cursor blinks while
  indexing and stays still once Codemap is ready.

### The screens

Anything not on this list has no design and therefore is not built:

```
Terminal   banner, indexing output, start output
Start      indexing in the browser, onboarding card (step 1 of 3)
Map        System, Area, File, Function
Ask        answer with numbered steps on the map
Changes    changes timeline
Search     command palette
Edge       empty state, server disconnected, settings
Light      light-mode versions as drawn
```

Onboarding steps 2 and 3, hover states on the map beyond the node hover, the
Settings sections other than General, and the provider setup have **no design**.
They are questions for the owner, recorded in `CONTEXT.md`, not gaps to fill.

## Architecture rules — not negotiable

```
design/                  export, read-only (+ Codemap Design Notes.md)
docs/design-screenshots/ reference renders of design/
packages/cli             entry point, terminal output
packages/core            parsing, graph, cache, diff, layout, explanations
packages/server          Hono, WebSocket, provider bridge
packages/web             React app; src/design/ owns every token
```

pnpm workspace, TypeScript strict, ES modules, Node.js LTS.

**CLI (`packages/cli`).** Binary `codemap`. Terminal output exactly as in
`01 Brand` and `02 Brand Sheet`: banner, one line per phase with live counters,
blinking cursor while indexing, then the URL. Opens the browser. Phases: scan
(respects `.gitignore`) → parse → resolve → graph → layout → explain (optional)
→ serve. Every visible string comes from the CLI's own catalog.

**Cache (`.codemap/` in the project root).** Contains its own `.gitignore` with
`*`. **Codemap never touches the user's `.gitignore`.** `index.sqlite` holds the
graph, symbols, content hashes, explanations and persisted layout positions,
with a schema version. The next start only reprocesses changed files by
content hash; an unchanged repo is ready in a few seconds. A schema-version
change rebuilds automatically instead of crashing.

**Analysis (`packages/core`).** tree-sitter for structure; languages are
plugins, starting with TypeScript/JavaScript, Python and Go, each with a support
tier the UI states honestly. oxc-resolver for TS/JS module resolution (tsconfig
paths, monorepo aliases). Graph levels: system area → area/module → file →
function/class/method/component. Edges: imports and calls; name-matched calls
carry a confidence and are drawn as uncertain. Clustering into the design's
columns plus external services, from folder structure and framework detectors
(Next.js routes, API routes, server actions; Drizzle/Prisma → database; known
SDKs such as Stripe, Resend, OAuth → external nodes).

**Layout.** elkjs, layered, left to right. Computed in a worker or on the
server, **never on the UI thread**. **Stable:** existing nodes never move, new
nodes get space next to their parent, positions persist in the cache.

**Live.** @parcel/watcher → incremental reparse → graph diff → WebSocket patch.
Changed nodes take the changed/new states. The changes timeline groups by
importance: new area, new dependency, database or auth changes first. Agent
activity (reading, editing) comes from file access and change events. **The file
watcher is the source of truth.**

**Explanations and chat.** Hierarchical, bottom-up: function → file → area →
system. Every explanation has a Simple and a Technical level, is cached by
content hash, and on a change only what changed is re-explained and propagated
upward, debounced while the agent is editing. The chat is **Ask-only and
read-only**: it answers and highlights numbered steps on the map. It never
edits a file.

**Server (`packages/server`).** Hono, bound to **`127.0.0.1` only**, random free
port. A random session token is required on **every** HTTP and WebSocket
request, passed in the URL the CLI opens. A wrong `Origin` is rejected.

**Web (`packages/web`).** React, Vite, TypeScript, prebuilt and shipped inside
the package. The map is WebGL (PixiJS) and stays smooth at 10k+ symbols.
Semantic zoom across the four levels; edges bundled between clusters when zoomed
out.

**Tokens only from the design layer.** `packages/web/src/design/` owns every
colour, size, radius, spacing and motion value (`tokens.ts`, `tokens.css`,
`motion.ts`). **No numeric or colour literal in a feature file.** A missing
value goes into the design layer, not into the call site. *Reduced motion* is
handled centrally in `motion.ts` — at a hundred call sites it would be forgotten
at ninety of them. DOM transitions use Motion (`motion/react`); GSAP is not
used, because its licence is not open source.

**Every visible string comes from one catalog.** `packages/web/src/strings/en.ts`
for the browser, `packages/cli/src/strings/en.ts` for the terminal. English only;
no second language.

## Bring your own provider — not negotiable

- Providers are the user's own: Claude (Agent SDK with the user's own login, or
  an Anthropic API key) or a local model through Ollama.
- **No Levo Studio backend. No proxy. No fallback key. No key in the package**
  — not in source, not in a config file, not base64-encoded in a comment.
- **Keys live in the OS keychain**, never in a plain file, never in
  `localStorage`, never in `.codemap/`.
- **Nothing is logged.** Not the key, not a prefix of it, not code, not prompts,
  not replies. No `console.log` of any of it, no debug file.
- Explanations are **opt-in** at first run, with a clear notice of what is sent
  where. Without a provider, everything else works fully.

## Security — not negotiable

- The server binds `127.0.0.1`, never `0.0.0.0`, never `localhost` resolved to
  something else.
- The session token is checked on every HTTP request and every WebSocket
  upgrade, in constant time. A request without it gets nothing, including
  static assets that reveal project data.
- `Origin` is checked on every request that has one.
- **No telemetry. No outgoing request** except to the provider the user chose.
  No fonts, scripts or images from a CDN at runtime: everything the browser
  loads is served by the local server.
- Paths from the browser are resolved against the project root and rejected if
  they leave it.

## Toolchain and commands

- **pnpm** workspace. Node.js LTS (see `engines` in the root `package.json`).
- **TypeScript strict.** `any` only with a comment saying why.
- **Biome** for formatting and linting. Nothing else formats.
- **vitest** for logic, **Playwright** for UI and the visual checks against
  `docs/design-screenshots/`.

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm test:visual
pnpm check:licenses
pnpm build
```

## Code style

- Biome decides formatting. Do not hand-format against it.
- **No numeric or colour literals outside the design layer.** See above.
- **No visible string outside the catalogs.**
- No `console.log`, no `debugger`, no commented-out code, no `TODO` without a
  name and a reason beside it. Preferably no `TODO` at all.
- Every source file starts with `// SPDX-License-Identifier: Apache-2.0`.
- Never change formatting in the same commit as logic.

## Comments

Comments explain the **why**, not the what. A comment describing what the line
below it does is wasted. One explaining why it is not the obvious approach saves
the next person half a day.

**A comment that promises something the code does not do is worse than no
comment.** If you change behaviour, pull the comments above it along —
including the ones in neighbouring files repeating the same promise.

## Tests

vitest for logic, Playwright for UI. A red run is not delivered; a genuinely
wrong test is fixed in its own commit, with a reason.

The tests live where the logic is pure: parsing, resolution, clustering, the
graph diff, layout stability (existing nodes do not move; no crossings, no line
through a node, left to right), cache invalidation and schema rebuild, token and
Origin checks on the server. Provider clients are tested against recorded
response shapes, never a live endpoint. The UI is checked with Playwright
renders against `docs/design-screenshots/`.

Every fix ships with a test that fails **without** the fix. The counter-check
is mandatory: pull the fix, watch it go red, put it back, watch it go green. A
regression test nobody has seen fail is decoration.

## The agent workflow

Codemap is built with a writer/reviewer split, and the split is the point.

- One agent **writes** a feature in its own worktree
  (`git worktree add ../codemap-wt-<slug> feat/<slug>`).
- A **different** agent, with its own context, reviews the diff in that
  worktree against `design/` and against this file. It does not write the fix.
- Before anything reaches `main`, a **main-gate** agent — independent again,
  never the feature's reviewer — sees the full diff and checks: clean build, no
  warnings, no dead code, no debug output, design fidelity a second time,
  formatting, no AI attribution anywhere, and the security and provider rules
  above.
- Findings go **back to the writer**, never into the reviewer's own hands. An
  agent that fixes what it just found has reviewed nothing.
- **Sub-agents never merge.** Only the owner merges to `main`.

Work that touches the same files runs **in sequence**, not in parallel. Check
for file overlap before parallelising anything.

## Commits

- Conventional Commits, in English: `type(scope): description`. Scope optional
  but welcome.
- Types: `fix`, `feat`, `test`, `refactor`, `chore`, `design`, `docs`, `build`,
  `perf`, `security`, `revert`.
- The description says **what now holds**, not what was done. Anything
  non-obvious is justified in the body. A new dependency is justified in the
  body of the commit that adds it.
- **One commit = one logical change.** Formatting never in the same commit as
  logic. Commit and push each small finished piece.
- **No tool trailers.** No `Co-Authored-By`, no “Generated with”, no session
  links, no mention of AI tooling — not in commits, PR titles or bodies, code
  comments, or anywhere else in the repository.
- Rebase onto the base branch before a PR. Merges to `main` are the owner's.

## Branches

**Never commit directly to `main`.** The only exception was the bootstrap of
the empty repository.

Before every new branch: `git fetch --all --prune`, and if the base is behind
its remote, pull before branching.

Prefixes: `feat/`, `fix/`, `hotfix/`, `security/`, `refactor/`, `perf/`,
`design/`, `feedback/`, `ci/`, `deps/`, `migration/`, `docs/`, `test/`,
`chore/`, `spike/`, `release/`, `revert/`. Lowercase, hyphens, specific:
`feat/incremental-reparse`, not `feat/live`.

**No `claude/` prefix** and no other named after the tool that was used.

## How Claude is used here

Claude is a tool in this repository: code review, boilerplate, structure, a
second pair of eyes on a design spec. It is not a substitute for understanding.
**Every change is understood and answered for before it is merged.** That is
the reason the reviewer is never the writer.

Nothing in the repository mentions the tool. See “Commits”.

## The repository is public

`github.com/levo-studio/codemap` is public **now**. Every change on `main` has
to look like it was always there. No secrets, tokens, personal paths or
personal data anywhere — including fixtures, screenshots and commit messages.

## License context

Codemap is **open source under the Apache License 2.0**, unlike Fuel, Score and
Retain, which are source-available.

- `"license": "Apache-2.0"` in every `package.json`.
- `// SPDX-License-Identifier: Apache-2.0` at the top of every source file.
- Contributions are accepted under section 5 of the licence: inbound equals
  outbound. There is no CLA.
- Section 6: the licence grants no rights to the name “Codemap”, the Levo Studio
  mark, the logo or the app icon.
- Dependencies must be compatible: MIT, BSD, ISC, Apache-2.0, and OFL for fonts.
  **No GPL, AGPL or SSPL.** Development tools, which are never shipped, may
  also be MPL-2.0. `pnpm check:licenses` enforces this and runs in CI.

## None of this happens without asking

Ask first, then touch:

- **Anything in `design/`.** The export is read-only.
- **Adding a dependency** beyond the ones named in the architecture above.
  Each one is justified in its commit body.
- **Any network call** other than the explanation provider the user chose.
- **The npm package name, and publishing anything to npm.**
- **Pushing to `main`.** Work happens on a branch; merging is the owner's call.
