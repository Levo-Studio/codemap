# Contributing

Codemap is a local tool that draws a live map of a codebase in the browser and
explains it in plain language, while an AI coding agent works on the same code.
It runs on your machine, talks to nobody but the explanation provider you
choose, and never changes your files.

Contributions are welcome across the whole thing: language plugins, framework
detectors, layout, the map renderer, bug fixes, UI work, refactorings,
documentation, tests. If a label is unclear, a hit area too small, a layout
crossing lines on your codebase — those are good PRs.

## Why I would like this to become more than a one-person tool

Codemap exists because I watched people build real apps with agents and then
not be able to say how their own app worked. The code was there; the picture
of it was not. So I built the tool that draws the picture.

A map of code is only as good as the code it has seen, and I have seen a small
slice of it. Your monorepo layout, your framework, your language, the way your
team names folders — each one is a case where the grouping is wrong or the
layout tangles, and I will not find it on my own. That is what other people are
for.

## Read this before you start

Four things, in this order, and the first one is not optional:

1. **`design/`** — the design export. It is the source of truth for every value
   in the interface. See “Design fidelity” below.
2. [`README.md`](README.md) — what Codemap is, what it deliberately does not
   have, how it is built.
3. [`LICENSE`](LICENSE) — Apache License 2.0.
4. [`CLAUDE.md`](CLAUDE.md) — the same rules as here, condensed for a tool that
   reads them. Where the two disagree, **this file wins**.

[`CONTEXT.md`](CONTEXT.md) says where the work stands and what is deliberately
unfinished.

## Setup

You need Node.js 22.12 or newer and pnpm 10.

```bash
pnpm install
pnpm build
```

That is the whole setup. There is no account to create and no service to run.

### You need your own provider to work on explanations and the chat

There is no shared key, no test key and no Levo Studio key anywhere in this
repository, and there will not be one. Use your own Claude login, your own
Anthropic key, or a local model through Ollama. Keys go into your operating
system's keychain at runtime and nowhere near a file you can commit.

Provider clients are tested against **recorded response shapes**, never against
a live endpoint. A test suite that costs money to run is a test suite nobody
runs.

## Project structure

```
packages/cli             entry point, terminal output
packages/core            parsing, graph, cache, diff, layout, explanations
packages/server          Hono, WebSocket, provider bridge
packages/web             React app
design/                  the design export — read-only
docs/design-screenshots/ reference renders of the design
```

**`packages/core`** is the analysis: tree-sitter parsing with one plugin per
language, module resolution, the graph, clustering into the map's columns, the
graph diff, the layout and the `.codemap/` cache. It knows no HTTP and no DOM,
which is what makes it testable in milliseconds.

**`packages/server`** is the local server: Hono on `127.0.0.1`, the WebSocket
that sends graph patches, and the bridge to the user's provider. **There is no
network code outside the server's provider bridge.** If `core` or `web` is
building a request to anywhere but the local server, the design of that feature
is wrong.

**`packages/web`** is the browser app. **`packages/web/src/design/`** is the
only source for colour, size, spacing, radius and motion — `tokens.ts`,
`tokens.css`, `motion.ts` — including the central handling of reduced motion.
**`packages/web/src/strings/en.ts`** holds every visible string. A value or a
string that is missing goes in there, not into the call site.

**`packages/cli`** is the `codemap` command and its terminal output, with its
own string catalog.

## Design fidelity

This is the rule people break first, so it gets its own section.

**`design/` is the source of truth for every colour, size, spacing value,
radius, opacity, letter-spacing, line-height, duration and state.** Not a mood
board, not a starting point. `Codemap Design Notes.md` is the written spec; the
`.dc.html` files are the pixels.

Read it before the first line of code. Yes, also for a one-line change.

- Nothing is invented, rounded, or implemented “close enough”. The sizes carry
  fractional values — `10.5px`, `12.5px`, `13.5px` — and those are design
  values, not rounding artefacts.
- **If a value you need is not in the export, that is a question, not a gap to
  fill with taste.** Ask. I would much rather answer a question than review a
  screen built on a guess.
- `design/` is never edited to match the code. **If the code and the design
  disagree, the code is wrong.** If you think the design is wrong, that is a
  question for me, not an edit you make in `design/`.
- Where the HTML and the notes disagree, **the HTML wins for pixel values** — it
  is what was actually drawn — and **the notes win for behaviour**.

To look at the export in a browser you need the design tool's runtime,
`support.js`, which is not in this repository. The rendered pages are in
`docs/design-screenshots/`, one per page and per mode, in dark and light.

Four facts about the design, so nobody rediscovers them the hard way:

- **The screens in the notes are the whole app.** Anything not on that list has
  no design and is not built.
- **Colour means status and nothing else.** Everything that is not live
  activity is neutral. The primary button is ink, not orange.
- **Status is never colour alone.** Every status has a shape and a word as well:
  `● Editing`, `◌ Reading`, `◆ Changed`, `▲ Error`.
- **The demo data is not spec.** `ledgerly-web`, its areas and its functions are
  the fixture for the static interface and the visual tests. They say nothing
  about how real code is grouped.

## Rules the tool is built on, which a PR does not get to relax

Four of them, and they are settled. You are very welcome to argue with me in an
issue; you are not welcome to argue with me by pull request.

**1. Read-only.** Codemap does not write to the user's project, does not run
their code, and does not control their agent. The one folder it writes is
`.codemap/`, which carries its own `.gitignore`. It never touches the user's
`.gitignore`. The chat explains and highlights; there is no build mode and no
approve/deny.

**2. Your provider, with no fallback.** There is no Levo Studio backend, no
proxy, no “if the user has no key, route it through us” path — not as a
convenience, not behind a flag, not temporarily. No key ships in the package.
Explanations are off until the user turns them on, and the notice says what is
sent where.

**3. Nothing is ever logged.** Not the key, not a prefix of the key, not the
code, not the prompts, not the replies. No `console.log`, no debug file. This
one bites during debugging, which is exactly when it matters.

**4. Local only.** The server binds `127.0.0.1` on a random port. Every HTTP
and WebSocket request carries the session token; a wrong `Origin` is rejected.
No telemetry, no analytics, no crash reporter, no font or script from a CDN.

## How a change happens

**Larger feature or restructuring:** open an issue first, then build. Not
because I like process, but because I would hate to tell you after two weeks of
work that I had pictured it differently.

**Small fix, typo, obvious bug:** straight to a PR, no issue needed.

A useful bug issue contains what happened and what you expected, both in one
sentence; step by step how to get there; your operating system, Node.js version
and Codemap version; and, if it is about the map, the language and framework of
the project and roughly how many files it has. **Do not paste your key or your
company's code into an issue.** A small public repository that shows the
problem is worth more than a screenshot of a private one.

From there: branch, small commits, PR, review, merge. I read every PR myself and
comment. Everything I raise gets closed before the merge — including the small
things, and including the ones where you talk me out of my position.

## Branches

You work in your fork, but the same rule applies there: **never on `main`.**

Pull once before every new branch, otherwise your PR sits on the state of the
day before yesterday:

```bash
git fetch --all --prune
```

The name carries a prefix that says what it is about. Lowercase, hyphens,
specific. `feat/go-call-resolution` says something, `feat/go` says nothing.

| Prefix | For |
|---|---|
| `feat/` | New functionality |
| `fix/` | Bug fixes |
| `hotfix/` | Urgent fixes to a released version |
| `security/` | Security, hardening, token and key handling |
| `refactor/` | Restructuring without behaviour change |
| `perf/` | Runtime and memory |
| `design/` | Interface and styling |
| `feedback/` | Changes from review feedback |
| `ci/` | Automation, pipelines |
| `deps/` | Dependencies |
| `migration/` | Cache schema and data migrations |
| `docs/` | Documentation only |
| `test/` | Tests only |
| `chore/` | Maintenance, tooling, configuration |
| `spike/` | Experiment, will be discarded |
| `release/` | Preparing a version |
| `revert/` | Undoing something |

No prefix named after the tool you used. **The branch is named after the work,
not after the hammer.**

One branch, one topic. Two topics in one PR mean I have to accept or reject
both together.

## Commits

**Conventional Commits, in English:** `type(scope): description`. Scope
optional but welcome. Types in use here: `fix`, `feat`, `test`, `refactor`,
`chore`, `design`, `docs`, `build`, `perf`, `security`, `revert`.

The description says **what now holds**, not what you did. Anything non-obvious
gets its reason in the body. A commit that adds a dependency says in its body
why it is needed and what its licence is.

**One commit = one logical change.** No collection commits, no “fix stuff”, and
formatting never in the same commit as logic.

**No tool trailers.** No `Co-Authored-By`, no “Generated with”, no session IDs,
no mention of any tool — not in commits, not in PR titles or bodies, not in code
comments, not anywhere in this repository. If something helped you write it:
good, that is your business and it does not belong in the history.

**Everything in this repository is English.** Code, comments, commit messages,
branch names, issues, pull requests, the interface.

Rebased on the current base branch, no merge commits in the PR.

## Pull requests

A PR body says three things, and it can say them in three sentences:

- **What changed.** Not a diff summary — I can read the diff. The behaviour that
  is different now.
- **Why.** The issue it closes, the bug it fixes, the design value it corrects.
  If it touches a screen, say which one.
- **How to test it.** The steps to see it working: which project to run it on,
  which zoom level, dark or light, with or without a provider.

Plus, if any of them apply: what you deliberately did **not** do, what you are
unsure about, and where you want a second opinion. A PR that flags its own weak
spot gets a faster review, not a harsher one.

Review your own PR before I see it: no commented-out remains, no `console.log`,
no unused files, no formatting outside the scope.

## Tests

```bash
pnpm test          # vitest
pnpm test:visual   # Playwright against docs/design-screenshots/
```

**The analysis core is where most tests live.** It is pure, so there is no
excuse. Things worth testing, concretely:

- a language plugin against small fixture files: every symbol, every import,
  every call it should find, and the ones it should not
- module resolution with `tsconfig` paths and workspace aliases
- clustering: which folder or framework file lands in which column
- the layout rules on real shapes: left to right, no crossing, no line through
  a node, and that **existing nodes do not move** when one is added
- the graph diff between two versions of a file
- the cache: an unchanged file is not reparsed, a changed schema version
  rebuilds instead of crashing
- the server: a request without the token, with a wrong token and with a wrong
  `Origin` is refused, over HTTP and over the WebSocket
- provider clients against **recorded response shapes** — never a live endpoint

**Every fix ships with a test that fails without it**, and the counter-check is
mandatory: pull the fix out, watch the test go red, put it back, watch it go
green. A regression test nobody has ever seen fail is decoration.

A red run does not get merged, not even when the red test “was already weird
before”. If a test is genuinely wrong, fix it in its own commit and write down
why it was wrong.

**The interface is checked by rendering it.** The Playwright suite renders
every screen and mode in dark and light and compares it with the reference
renders. A difference is a bug in the code, not in the reference.

## Code style

**Biome** formats and lints. Run `pnpm lint` before you push; CI runs it too.

- TypeScript strict. `any` only with a comment saying why.
- **No numeric or colour literals outside the design layer.** No `padding: 17`,
  no `#f0a55a` in a component. A missing value goes into
  `packages/web/src/design/`.
- **Every visible string comes from a catalog.** No literal in a component or in
  the terminal output.
- Every source file starts with `// SPDX-License-Identifier: Apache-2.0`.
- No `console.log`, no `debugger`, no commented-out leftovers, no `TODO` without
  a name and a reason beside it. Preferably no `TODO` at all.
- **Formatting is never in the same commit as logic.**

### Comments

Comments explain the **why**, not the what. A comment describing what the line
below it does is wasted. One explaining why it is not the obvious approach saves
the next person half a day.

**A comment that promises something the code does not do is worse than no
comment**, because people believe it and stop reading the code underneath. If
you change behaviour, pull the comments along — including the ones in
neighbouring files that repeat the same promise.

## Dependencies

Every dependency is a question first. Codemap runs inside other people's
projects, and everything it installs is something they have to trust.

- **Licence:** MIT, BSD, ISC, Apache-2.0, and OFL for fonts. **No GPL, AGPL or
  SSPL**, directly or transitively. `pnpm check:licenses` checks this, and CI
  runs it on every PR. Development tools that are never shipped may also be
  MPL-2.0.
- **Justified in the commit** that adds it: what it does that the code cannot
  reasonably do itself, and its licence.
- No dependency that phones home, collects telemetry or loads anything from a
  CDN at runtime.

## Documentation belongs to the change

Four files describe what Codemap is. Whoever changes the behaviour changes them
in the **same PR**, not afterwards:

| File | When it is due |
|---|---|
| [`README.md`](README.md) | When something changes that the README states: a feature, a supported language, the architecture, the build commands. |
| `CONTRIBUTING.md` | When how you contribute changes — a new test command, a new structure, a new rule. |
| [`CLAUDE.md`](CLAUDE.md) | When a rule in it no longer matches this file. It is the condensed version and it goes stale silently. |
| [`CONTEXT.md`](CONTEXT.md) | When a decision is taken, a trap is found, or something deliberately unfinished gets done. |

Documentation nobody pulls along is worse than none after three months, because
by then people believe it.

## How Claude is used here

Claude is a tool in this repository: code review, boilerplate, structure, a
second pair of eyes on a design spec. That is all it is, and I would rather say
so plainly than have you guess whether it is frowned upon here.

**It is not a substitute for understanding.** Every change is understood and
answered for before it is merged. If I cannot explain what a line does and why
it is there, it does not go in — no matter which tool produced it. That is why
the reviewer is never the writer: an agent that fixes what it just found has
reviewed nothing, and neither has a person who reviews their own diff.

It is the same bar I hold your PRs to. You open it, you stand behind it, you can
explain every line in it — including the ones you did not type yourself.

If you work with a tool that reads [`CLAUDE.md`](CLAUDE.md), point it at
`CLAUDE.md`, `CONTRIBUTING.md`, `README.md` and `design/` before it touches
anything.

And: **nothing in this repository mentions the tool.** See “Commits”.

## Hard rules

> A PR that breaks these is closed without a discussion of its contents. Not out
> of pedantry: I read every PR myself, in my own time.

1. **Small single commits.** One commit = one logical change. Formatting never
   together with logic.
2. **No tool trailers, no AI attribution**, anywhere in the repository.
3. **Conventional Commits, in English.** The description says what now holds.
4. **Everything in English**, including comments and the interface.
5. **Values come from `design/`.** Nothing invented, nothing rounded, nothing
   “close enough”.
6. **No numeric or colour literals outside the design layer**, and no visible
   string outside the catalogs.
7. **A fix ships with a test that fails without it**, counter-checked.
8. **No red tests.** A run that is not green is not delivered.
9. **Read-only.** Nothing writes to the user's project outside `.codemap/`.
10. **No key outside the keychain**, and no logging of key, code, prompt or
    reply.
11. **No Levo Studio call path, no proxy, no bundled key.** The provider is the
    user's, with no fallback.
12. **`127.0.0.1`, session token, `Origin` check** — on every request.
13. **No dependency without a reason and a compatible licence.**
14. **Nothing in `design/` is edited.** The export is read-only.
15. **Documentation pulled along in the same PR.**
16. **Rebased, no merge commits.**

## Licence of contributions

Codemap is open source under the [Apache License 2.0](LICENSE). Whatever you
submit by pull request is licensed under the same terms, as section 5 of the
licence says: inbound equals outbound. There is no contributor licence
agreement, and you keep your authorship.

The visible half of that is the credits. **Once your PR is merged you add
yourself to the [credits in the README](README.md#credits) — in the same PR as
the contribution**, not as a separate “add me” PR afterwards. One row: your
name, your GitHub handle, what you contributed in one line, and the PR number.

The rules there are not negotiable:

- **One row, one contribution.** No paragraphs, no logos, no banners, no
  company links.
- **The entry goes in the same PR as the contribution.**
- **Only what is actually in.** One line, not an essay.
- **GitHub handle instead of an email address.** No private contact details,
  neither yours nor anyone else's.
- **Not an advertising slot.** No own products, agencies, services or crypto
  projects. A link to your GitHub profile is the link you get.
- **No other people's names.** You add yourself, nobody else.

An entry that ignores this gets removed without comment.

The licence covers the code, not the name: it grants no rights to the name
“Codemap”, the Levo Studio mark, the logo or the app icon (section 6). A fork
needs its own name and its own logo.

## Security

A vulnerability goes through GitHub's private vulnerability reporting, never a
public issue. See [SECURITY.md](SECURITY.md).

## Contact

Questions, ideas, or uncertainty about whether something is worth it:
**julius@levo-studio.com**

Better to ask once too often than to build two weeks in the wrong direction.
