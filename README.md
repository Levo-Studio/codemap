# Codemap

Understand your code, while using agents.

[**Case study**](https://juliusgrimm.dev/projects/codemap) ·
[Contributing](CONTRIBUTING.md) ·
[Architecture](#architecture) ·
[Building](#building-and-testing)

---

A coding agent can change forty files in the time it takes to read one. That is
the point of using it, and it is also the problem: after an afternoon of
prompting, there is an app that works, and nobody in the room can say how it is
put together. Where does a payment go after the button is pressed? What talks
to the database? What did the agent just add, and what did it touch on the way?

The usual answers do not fit. Reading the diff assumes you can read code, and
at the speed an agent works, nobody reads every diff anyway. Asking the agent
gets you a paragraph about the part it happens to remember. Drawing an
architecture diagram gets you a picture of last week.

Codemap draws the picture from the code itself, keeps it current while the
agent works, and explains every part of it in plain language.

|  |  |
|---|---|
| **Runs** | Locally. `codemap` in a project folder, the map opens in your browser. |
| **Shows** | The whole codebase as one map, left to right in call direction, four zoom levels: system, area, file, function. |
| **Live** | Updates as files change. Shows where the agent is reading and editing, and what changed. |
| **Explains** | Every function, file and area in plain language, Simple or Technical. Optional. |
| **AI** | Your own provider: Claude with your own login or key, or a local model through Ollama. |
| **Languages** | TypeScript, JavaScript, Python and Go to start, each with a stated support level. |
| **Network** | None, except to the provider you choose. No account, no telemetry. |
| **License** | Open source, Apache License 2.0. |

How it came about, why it looks the way it does and what got cut is in the
**[case study](https://juliusgrimm.dev/projects/codemap)**.

**Status:** in development. Nothing is published to npm yet.

## What it is

You run `codemap` in the folder of a project. The terminal shows one line per
step (scanning, parsing, resolving imports, grouping into areas, writing
explanations, starting the server) and then opens the map in your browser.

The map reads left to right, the way a request travels: entry points on the
left, then the API, then the features, then data and external services on the
right. Every arrow goes from the part that calls to the part that is called.
Zoom in on an area and you see its modules, then a module's files, then a
file's functions, each with one sentence saying what it does.

While an agent works in the same folder, the map follows it. The part it is
editing is outlined in orange and pulses; the part it is reading has a dashed
blue outline; what changed carries a green marker that fades over half an hour.
Every one of those states has a shape and a word as well as a colour. A
timeline lists the changes by how much they matter: a new area or a new
dependency before a renamed function.

The chat answers questions about the code — “how does a customer get
charged?” — and shows the answer as numbered steps on the map.

The first run on a project takes as long as it takes to parse it. Codemap keeps
an index in `.codemap/` in the project root, so the next start only looks at
files that changed and is ready in a few seconds. That folder carries its own
`.gitignore`; Codemap does not touch yours.

## What it deliberately does not have

- **No editing.** Codemap does not change your files, does not run your code
  and does not control the agent. The chat explains; there is no build mode and
  nothing to approve.
- **No account and no backend.** There is no Levo Studio server, no proxy and
  no key shipped in the package. Explanations go from your machine straight to
  the provider you chose, with your own login or key, and they are off until you
  turn them on.
- **No telemetry.** Codemap makes no request except to that provider. The
  browser loads everything from the local server.
- **No remote access.** The server listens on `127.0.0.1` only and every request
  needs the session token from the URL the terminal opens.
- **No logging of your code.** Not the key, not the code, not the prompts, not
  the replies.

## Architecture

```
packages/cli             entry point, terminal output
packages/core            parsing, graph, cache, diff, layout, explanations
packages/server          Hono, WebSocket, provider bridge
packages/web             React app; src/design/ owns every token
design/                  the design export — read-only, never edited to match the code
docs/design-screenshots/ reference renders of the design
```

**Analysis.** tree-sitter reads the structure of every file; languages are
plugins. For TypeScript and JavaScript, oxc-resolver resolves imports the way
the project's `tsconfig` and workspace do. The graph has four levels, from
system areas down to functions, classes and components, with import and call
edges. A call matched only by name carries a confidence and is drawn as
uncertain.

**Grouping.** Folder structure and framework detectors sort the code into the
map's columns: Next.js routes and API routes, database layers such as Drizzle
and Prisma, and known SDKs such as Stripe, Resend and OAuth providers as
external services.

**Layout.** elkjs computes a layered left-to-right layout off the UI thread.
Once a node has a place it keeps it: new nodes get room next to their parent,
and positions are stored in the index.

**Live.** A file watcher feeds an incremental reparse; the graph difference
goes to the browser over a WebSocket as a patch. What the agent reads and edits
is taken from file events. The watcher is the source of truth.

**Rendering.** Connections are drawn with WebGL (PixiJS), so the map stays
smooth with tens of thousands of symbols, and edges between clusters are
bundled when zoomed out. Nodes sit on top as ordinary page elements, only as
many as the zoom level can show, so their text stays sharp and selectable. Dark and light mode are built from the same named tokens, and colour is
used only for status.

**Explanations.** Written bottom-up, from functions to files to areas to the
system, each in a Simple and a Technical version, and cached by content hash.
When code changes, only what changed is explained again.

## Building and testing

You need Node.js 22.12 or newer and pnpm 10.

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm test:visual
pnpm check:licenses
pnpm build
```

`pnpm test` runs the vitest suites. `pnpm test:visual` renders the interface in
Playwright and compares it with the reference renders in
`docs/design-screenshots/`; it needs Chromium once
(`pnpm exec playwright install chromium`). `pnpm check:licenses` fails on any
dependency with a licence that cannot ship in an Apache-2.0 package.

## Contributing

How a contribution should look, what a useful issue contains, what the commits
have to look like and what `design/` being the source of truth means in
practice: **[CONTRIBUTING.md](CONTRIBUTING.md)**.

Short version: small single commits, tests with the fix, and every value taken
from the design export rather than from taste.

Security issues go through GitHub's private vulnerability reporting, never a
public issue. See [SECURITY.md](SECURITY.md).

## Credits

**Creator and maintainer**

[**Julius Grimm**](https://github.com/justthatrandomcoder) — idea, design,
architecture. [Levo Studio](https://levo-studio.com)

**Contributors**

<!-- Please append new rows at the bottom, alphabetical by name.
     Format: | Name | @github | What | PR | -->

| Name | GitHub | Contribution | PR |
|---|---|---|---|
| _nobody yet — be the first row_ | | | |

Once your PR is merged you may add yourself here. There are rules for that, and
they are not negotiable:

- **One row, one contribution.** No paragraphs, no logos, no banners, no
  company links.
- **The entry goes in the same PR as the contribution**, not as a separate
  “add me” PR.
- **Only what is actually in.** The contribution is described in one line, not
  in an essay: “Go call resolution”, “fix in the layout diff”, “keyboard access
  to the palette”.
- **GitHub handle instead of an email address.** No private contact details,
  neither yours nor anyone else's.
- **Not an advertising slot.** No links to your own products, agencies,
  services or crypto projects. A link to your GitHub profile is the link you
  get.
- **No other people's names.** You add yourself, nobody else.

An entry that ignores this gets removed without comment.

## License

Open source under the **Apache License 2.0**. Use it, change it, ship it, build
on it, commercially or not, under the terms in [`LICENSE`](LICENSE). Keep the
licence and the [`NOTICE`](NOTICE) file with any copy you distribute, and say
what you changed.

Contributions are accepted under the same licence: whatever you submit by pull
request is licensed under Apache-2.0, as section 5 says. There is no
contributor licence agreement, and you keep your authorship.

**The licence covers the code, not the name.** As section 6 says, it grants no
rights to the name “Codemap”, the Levo Studio mark, the Codemap logo or the app
icon. A fork is welcome; it needs its own name and its own logo.

© 2026 Levo Studio
