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
| **Shows** | The whole codebase as one map, left to right in call direction. A node opens in place to show what it holds: areas their modules, modules their files, files their functions. |
| **Live** | Updates as files change. Shows where the agent is editing, and what changed. |
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
editing is outlined in orange and pulses; what changed carries a green marker
that fades over half an hour. What the agent only reads leaves no trace in the
files, so the map cannot show it.
Every one of those states has a shape and a word as well as a colour. A
timeline lists the changes by how much they matter: a new area or a new
dependency before a renamed function.

The chat answers questions about the code — “how does a customer get
charged?” — and shows the answer as numbered steps on the map.

Explanations and the chat need an AI provider of your own. The first time you
run `codemap` in a terminal it asks whether to turn explanations on; `codemap
setup` chooses the provider at any time:

- **Claude**, through the `claude` command you have installed and signed in to.
- **The Anthropic API**, with your key, kept in the system keychain.
- **Ollama**, a model on your own machine.

Parts of the code are sent to the provider you choose, and nowhere else.
`codemap --no-explain` keeps explanations off for one run.

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
On the map with nothing open, a node keeps its place once it has one: new
nodes get room next to their parent, and positions are stored in the index.
A node opened in place grows where its card was into a box around what it
holds, laid out the same way inside it; what lies right of it and below it
moves aside, and the rest of the map stays where it was.

**Live.** A file watcher feeds an incremental reparse: only changed files are
read again. The browser is told over a WebSocket that the project changed and
fetches the map again, with what it has open. What the agent edits is taken
from file events; the watcher is the source of truth. What it only reads
leaves no file event, so reading is not shown.

**Rendering.** Connections are drawn with WebGL (PixiJS), so the map stays
smooth with tens of thousands of symbols, and edges between clusters are bundled
when zoomed out. Nodes sit on top as ordinary page elements, only as many as the
zoom level can show, so their text stays sharp and selectable. Dark and light
mode are built from the same named tokens, and colour is used only for status.

**Explanations.** Written bottom-up, from functions to files to modules to
areas to the system, each in a Simple and a Technical version, and cached by
the hash of everything they were written from. When code changes, only what
changed is explained again, once the agent pauses. Providers are reached over
plain HTTP or the `claude` command, which runs without tools, so no provider
SDK ships with Codemap.

## Installing

Codemap will be installed from npm as `codemapkit`, which brings the command
`codemap`. It is not published yet; until it is, build it from this
repository as below and run `node packages/cli/dist/bin.js` in place of
`codemap`, or assemble the package with `pnpm package` and install the
tarball `pnpm pack` makes in `packages/cli`. It needs Node.js 22.13 or newer.

## Building and testing

You need Node.js 22.13 or newer and pnpm 10.

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm test:visual:container
pnpm test:app
pnpm check:licenses
pnpm build
pnpm test:package
```

`pnpm test` runs the vitest suites. `pnpm test:visual` renders every screen
in Playwright and compares it with the reference renders in
`docs/design-screenshots/`: pixel for pixel on screens without the map; on the
map screens every pixel within about ±2 of 255, apart from up to 1,000 along
the WebGL connections. The references come from the Playwright Linux
container, and fonts render differently elsewhere, so on another system run
`pnpm test:visual:container`, which needs Docker. `pnpm check:licenses` fails
on any dependency with a licence that cannot ship in an Apache-2.0 package.
`pnpm test:app` builds everything and runs the command on this repository, a
project it changes and an empty folder, in a browser, with explanations off.
`pnpm test:package` assembles `codemapkit`, installs it from its tarball into an
empty folder and runs it from there.

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
