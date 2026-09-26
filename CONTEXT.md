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
- **Reference renders** in `docs/design-screenshots/` are taken with CSS
  animations disabled, so the editing pulse and the edge flow are always in
  their first frame. The visual tests must render the same way or they compare
  a moving target.
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
runtime fetches imported components over HTTP. Put a copy of `support.js` from
the original export next to the pages (outside the repo, or delete it
afterwards) and serve the folder, e.g. `python3 -m http.server`. Opening a page
with `file://` shows nothing. Component props (`theme`, `mode`) are set by
wrapping the component in a small page with `<dc-import name="Map System"
theme="light" mode="ask">`, which is how `06 Screens` does it.

**npm name similarity.** `npm view <name>` returning 404 does not mean npm will
accept the name. npm rejects a new name that matches a taken one after removing
`-`, `_` and `.`. Check the variants too.

**A 404 in the console while rendering the export** is the favicon request, not
a missing component.

**iCloud Drive and similar sync clients make conflict copies.** A checkout
inside a synced folder (such as a synced Desktop) gets files named
`file 2.json`, `index 2.ts` when git rewrites files under it (reset, rebase,
checkout), and inside `node_modules`. They are untracked and break the
typecheck with duplicate declarations. Symptom: errors in a file whose name
ends in ` 2`. Delete them (after checking `git ls-files` does not list them)
and reinstall `node_modules`, or keep the checkout outside the synced folder.

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
pnpm test:visual
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

Milestone 1, the foundation, is in progress: licence and notice, the design
export with its notes and reference renders, and the foundation documents are
on `main`. The monorepo scaffold and CI come next, on a branch.
