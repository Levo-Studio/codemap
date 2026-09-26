# Codemap Design Notes

The written spec next to the export. Every value here is read out of the HTML
in this folder, not measured from a render. Where this file and the HTML
disagree, **the HTML wins for pixel values** and **this file wins for
behaviour**. Anything the export does not answer is listed under
[Open questions](#open-questions) and is not filled in with taste.

The chosen direction is **3a, Modern Dark, with an equal light mode**. The
other Phase 1 directions were discarded. `Modern Dark.dc.html` and
`Codemap Directions.dc.html` are the Phase 1 origin mockup and are kept for
history only: they use an older mark and older values, and nothing is built
from them.

## Files

| File | What it is |
|---|---|
| `Index.dc.html` | Entry page, links to everything |
| `01 Brand.dc.html` | Five candidate marks (B was chosen) and the terminal output |
| `02 Brand Sheet.dc.html` | The chosen mark: construction, lockups, app icon, favicon, terminal banner |
| `03 Foundations.dc.html` | Neutral tokens, status, type, spacing, radii, elevation, motion, icons |
| `04 Map Language.dc.html` | Nodes per zoom level, all node states, all connection types |
| `05 Components.dc.html` | Buttons, inputs, controls, badges, chat, timeline, toasts, palette row, tooltip, detail panel, banner |
| `06 Screens.dc.html` | S1–S12 in dark, five of them in light |
| `Map System.dc.html` | S2, S3, S7, S8, S9, S11. Props `theme`, `mode` |
| `Map Area.dc.html` | S4. Prop `theme` |
| `Map File.dc.html` | S5. Prop `theme` |
| `Map Function.dc.html` | S6. Prop `theme` |
| `App States.dc.html` | S1, S10, S12. Props `theme`, `mode` |
| `Node.dc.html` | The map node. Props `theme`, `level`, `state`, `label`, `meta`, `desc`, `statusText`, `badge`, `err`, `selected`, `dim` |
| `Topbar.dc.html` | Props `theme`, `crumbs`, `status`, `project`, `changes`, `changesOpen` |
| `ChatBar.dc.html` | Props `theme`, `kind`, `statusText`, `file`, `placeholder` |
| `Legend.dc.html` | Prop `theme` |
| `ZoomCtl.dc.html` | Props `theme`, `level` (0–3) |
| `.thumbnail` | Preview image written by the design tool |

`support.js`, the generic dc-runtime, is part of the original export but is not
committed. To render the pages, put a copy of it next to them and serve the
folder over HTTP (the runtime fetches imported components, so `file://` does
not work). Reference renders of every page and every mode are in
`docs/design-screenshots/`.

## Colour

Dark and light are built from the same named tokens. **Colour carries status
only. Everything else is neutral.** Selection and search use neutral ink so they
never compete with status. The one primary button is ink, never orange: orange
belongs to the agent.

### Neutral tokens

From the table in `03 Foundations`.

| Token | Dark | Light | Use |
|---|---|---|---|
| `bg` | `#0b0c0e` | `#f7f7f5` | Map canvas, app background |
| `panel` | `#0f1012` | `#ffffff` | Detail panel, settings |
| `container` | `#121316` | `#ffffff` | Expanded area on the map |
| `card` | `#17181c` | `#fafaf8` | Module, file and function nodes |
| `field` | `#141518` | `#f1f1ee` | Inputs, segmented controls, floating bars |
| `hover` | `#1c1d21` | `#efefeb` | Hover and active rows |
| `line-1` | `#1c1d21` | `#ebebe7` | Dividers |
| `line-2` | `#24262b` | `#e0e0db` | Node and control borders |
| `line-3` | `#2a2c31` | `#d3d3cd` | Container borders, strong dividers |
| `edge` | `#3a3d44` | `#b4b4ad` | Connections |
| `text-1` | `#ececef` | `#0f1012` | Titles, node names, primary text |
| `text-2` | `#c4c6cc` | `#3a3c41` | Explanations, body text |
| `text-3` | `#9a9ca3` | `#62646b` | Secondary info |
| `text-4` | `#62646b` | `#8e9096` | Labels, meta, placeholders |

### Neutral values used by the screens but not in the table

These appear in the per-component token objects (`const T = {…}`) of the screen
files. They are real values of the design; the Foundations table just does not
list them.

| Name in the HTML | Dark | Light | Where |
|---|---|---|---|
| `float` | `#141518` | `#ffffff` | Chat bar, Ask panel, palette, toasts, banner, onboarding card, loading card, zoom control |
| `edgeDim` | `#1f2024` | `#e6e6e1` | Dimmed connection |
| `dot` | `#16171a` | `#e4e4df` | Map dot grid, `radial-gradient(dot 1px, transparent 1px)`, `20px 20px` |
| `inv` | `#0b0c0e` | `#ffffff` | Text on ink (primary button, answer-step badge, tooltip) |
| `shadow` | `0 12px 32px rgba(0,0,0,.45)` | `0 12px 32px rgba(15,16,18,.10)` | Floating elevation |
| `scrim` | `rgba(5,6,7,.62)` | `rgba(15,16,18,.30)` | Palette and onboarding scrim |

The Topbar uses its own values for some of these in light mode, and one in
dark. See open question 1.

### Status

Every status is **colour plus shape plus word**. Nothing relies on colour
alone.

| Status | Glyph and word | Shape rule | Colour dark / light | Tinted background dark / light |
|---|---|---|---|---|
| Editing | `● Editing` | Solid 1.5 px border, pulse, filled dot | `#f0a55a` / `#c2651a` | `#1f1a14` / `#fbf1e7` |
| Reading | `◌ Reading` | Dashed 1 px border, hollow dot | `#7fb2f0` / `#2f6fd0` | `#131920` / `#eef3fb` |
| Changed | `◆ Changed` | Diamond, fades over 30 min | `#6fcf97` / `#1f8a57` | `#131a16` / `#ecf6f0` |
| Error | `▲ Error` | Triangle, corner badge | border `#e5484d` / `#d23b40`, text `#f2787c` / `#c0343a` | `#221416` / `#fcefef` (see open question 2) |
| Selected | `Selected` | 2 px ink outline, 2 px offset | `text-1` | none |
| Search match | `⌕ Match` | Ink border (`text-2`), everything else dims | `text-2` border, `text-1` word | none |

The Foundations status swatches are pills: `padding 6px 12px`, radius 8, 13/500.
The badges in `05 Components` and the detail panel are `padding 3px 8px`,
radius 6, 12/500, tinted background, status colour text.

### Brand colours

| | Dark | Light |
|---|---|---|
| Mark outline and link | `#ececef` | `#0f1012` |
| Mark filled node, brand sheet and app icon | `#f0a55a` | `#d9822b` |
| Mark filled node, in the app's Topbar | `#f0a55a` (`edit`) | `#c2651a` (`edit`) |
| App icon background | `#141518` + `inset 0 0 0 1px #2a2c31` | `#f7f7f5` |

See open question 3 for the two light oranges.

### Terminal

From `01 Brand` and `02 Brand Sheet`.

| | Value |
|---|---|
| Window background | `#08090a`, border `1px #1c1d21`, radius 12 |
| Title bar | height 36, bottom border `#16171a`, three 10 px dots `#24262b`, title 12 `#62646b` |
| Body | JetBrains Mono 13, line-height 1.75, `#c4c6cc`, padding `24px 28px 28px` |
| Prompt `$` | `#62646b` |
| Done `✓` | `#6fcf97` |
| Running `◐` and its counter | `#f0a55a`, label `#ececef` |
| Pending `○` | `#3a3d44`, label `#62646b` |
| Counters | `#62646b` |
| Progress | track 240 × 4, radius 2, `#1c1d21`; fill `#f0a55a`; percentage `#62646b` |
| Step grid | `grid-template-columns: 20px 1fr auto; column-gap: 10px` |
| URL line | `→` and URL `#ececef`, URL underlined `#3a3d44`, offset 3; hint `#62646b` |

## Brand

**The mark** is mark B from `01 Brand`: two nodes and the link between them.
The caller on the left is outlined, the callee on the right is filled with the
live colour. It is the smallest picture of what Codemap shows: something calls
something else. The export calls it “Call”; the project does not use that name.
It is “the mark”.

- 24-unit grid. Nodes `7 × 7`, corner radius `1.8`, at `x 2.5` and `x 15`,
  `y 8.5`. Link `M9.5 12H15`, `5.5` long. All strokes `2`.
- The outlined node is always on the left: the call reads left to right, like
  the map.
- Clear space: one node on every side. Mark alone from 16 px.
- Wordmark: Hanken Grotesk 600, letter-spacing `-.02em`, “Codemap”.
- Lockup gap: `0.32 × mark size` (brand sheet: mark 44, word 38).
- One-colour version: link and callee in the outline colour, when orange is not
  available.
- App icon: 128/28, 64/15, 32/8 (size/radius), mark at `0.56 × size`.
- Favicon at 16 px: the link drops to one pixel, the nodes stay 5 px, drawn as a
  separate pixel-fitted file (see open question 17).
- **Motion:** while indexing, the link draws from caller to callee, then the
  callee fills. Once live, the callee breathes slowly. Nothing else in the mark
  moves. Keyframes: link `stroke-dasharray 5.5`, `stroke-dashoffset 5.5 → 0`
  between 15 % and 45 %; callee `opacity 0 → 1` between 40 % and 55 %;
  `ease-in-out`, infinite. Cycle 3 s on the brand sheet, 2.4 s in the loading
  screen (see open question 8).

### Terminal banner

The real mark in half-block characters, so the nodes come out square in any
monospace font. The callee is the only coloured part.

```
▄▄▄▄    ▄▄▄▄
█  █━━━━████   codemap
▀▀▀▀    ▀▀▀▀   0.4.0 · ledgerly-web
```

- Outline node white `#ececef`, link `━━━━` `#62646b`, callee `#f0a55a`.
- `codemap` `#ececef` 700; version line `#62646b` 400, `<version> · <project>`.
- JetBrains Mono, line-height 1.05; 14 in the CLI mockups, 18 on the brand
  sheet.
- Without colour support the callee stays white. Without Unicode:
  `[ ]--[#] codemap`.
- Padding around the banner in the CLI mockup: `18px 0 20px`.

### Terminal output

```
$ codemap
<banner>
✓ Scanning files          1,284 files · 0.4s
✓ Parsing                 TypeScript, TSX · 2.1s
✓ Resolving imports       3,912 links · 0.8s
◐ Grouping into areas     8 areas · 38 modules
○ Writing explanations
○ Starting server
██████████░░░░░░  62%
```

Ready state: every line `✓` with its counter (`412 functions · 6.3s`,
`0.1s`), then

```
→ http://localhost:4317  opened in your browser
Watching for changes · q to quit
```

The cursor blinks while indexing and stays still once ready.

## Typography

Hanken Grotesk for interface and explanations. JetBrains Mono for anything that
exists in code: file names, functions, paths, numbers from the codebase. Weights
loaded: Hanken Grotesk 400/500/600/700, JetBrains Mono 400/500 (700 only in the
terminal banner).

| Role | Spec | Sample |
|---|---|---|
| `display` | 44 / 1.05 · 700 · −2 % | Your app, as a map |
| `title-1` | 28 / 1.2 · 700 · −1 % | Webhooks |
| `title-2` | 20 / 1.3 · 600 | Changes since 14:02 |
| `heading` | 15 / 1.4 · 600–700 | Billing |
| `body` | 15 / 1.6 · 400 | Explanation text |
| `ui` | 13 / 1.4 · 400–500 | Called by · Calls · Recent |
| `label` | 12 / 1.3 · 400 | Billing · Module |
| `code` | 12.5 / 1.5 · 500 mono | `handleInvoicePaid(event)` |

The screens use further sizes that are not in the table. They are design
values and transfer as written: 10, 10.5 (node meta, mono), 11 (column labels
600 with `letter-spacing .08em`, uppercase; badges; keys), 11.5, 12.5, 13.5
(chat), 14, 16 (palette input), 18 (onboarding title), 20 (settings title,
function name), 22 (changes title, loading title, file name), 24, 26 (empty
title).

## Spacing

4-point scale. Panels use 32, cards 12–14, stacks 8–12, sections 28.

`space-1 … space-10` = `4 8 12 16 20 24 32 40 56 72`.

The screens also use off-scale values (2, 3, 5, 6, 7, 9, 10, 11, 14, 18, 22,
26, 28, 36 …). They are drawn values, not rounding errors, and transfer as
written.

## Radii

| Token | Value | Use |
|---|---|---|
| `radius-xs` | 4 | Keys, tiny tags |
| `radius-sm` | 6 | Badges |
| `radius-md` | 8 | Buttons, inputs |
| `radius-node` | 10 | Nodes on the map |
| `radius-lg` | 14 | Containers, floating bars |
| `radius-full` | 999 | Dots, switches |

Also drawn: 2 (progress bar, onboarding step pills), 3 (legend swatches), 5
(count badge, `esc` key), 10 (palette rows, zoom control), 12 (area node, toasts,
banner, terminal), 16 (Ask panel, palette, onboarding card), 18 (loading card), 20
(section frames on the design pages only). The area node is 12 and the file
node 8, not 10.

## Elevation

The map sits flat. Only things that float over the map get a shadow.

| Level | Dark | Use |
|---|---|---|
| 0 Canvas | `bg` + dot grid | Map background |
| 1 Surface | `#121316`, border `1px #2a2c31`, no shadow | Nodes, containers, panel |
| 2 Floating | `#141518`, border `1px #24262b`, `0 12px 32px rgba(0,0,0,.45)` | Chat bar, banners, zoom control |
| 3 Overlay | `#141518`, border `1px #2a2c31`, `0 0 0 6px rgba(5,6,7,.6), 0 24px 48px rgba(0,0,0,.55)` | Command palette, onboarding. With scrim |

Light shadow for floating elements: `0 12px 32px rgba(15,16,18,.10)`. In the
screens the palette and the onboarding card use the level-2 shadow plus the
scrim, not the level-3 ring (see open question 18).

## Motion

Calm and informative. Motion only signals that something is happening in the
code. It never decorates. No bounce, no overshoot. **With “Reduce motion” every
loop becomes a static marker.**

| Token | Value | Use |
|---|---|---|
| `motion.fast` | 120 ms | Hover, press, toggles |
| `motion.base` | 200 ms | Panels, chat opening, palette |
| `motion.zoom` | 480 ms | Semantic zoom between levels |
| `ease` | `cubic-bezier(.2,0,0,1)` | Everything that is not a loop |

| Loop or transition | Spec |
|---|---|
| Editing pulse | 2600 ms, ease-in-out, infinite. Ring `0 → 6px`, dark `rgba(240,165,90,.12)`, light `rgba(194,101,26,.14)` |
| Active edge flow | 1000 ms, linear, infinite. `stroke-dasharray 6 4`, `stroke-dashoffset 0 → -18` |
| New node enters | 320 ms, `scale .96 → 1` plus fade, `ease` |
| Changed fades out | 30 min linear (setting “Keep changed marker for”), border `neu → line-2` |
| Chat bar editing dot | 1400 ms, infinite, `opacity 1 → .35 → 1` |
| Node opacity (dim) | `transition: opacity .2s` |
| Mark while indexing | see Brand |

## Icons

16 px grid, 1.5 px stroke, round caps and joins, no fills except status glyphs.
Used sparingly: the interface prefers words. Drawn at 20 px in Foundations,
stroke `text-2`.

| Name | Path |
|---|---|
| search | `circle 7,7 r4.5` + `M10.5 10.5L14 14` |
| zoom in | `M8 3v10M3 8h10` |
| zoom out | `M3 8h10` |
| fit | `M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3` |
| close | `M4 4l8 8M12 4l-8 8` |
| chevron | `M6 3l5 5-5 5` |
| calls | `M2 8h10M9 5l3 3-3 3` |
| changes | `circle 8,8 r6` + `M8 5v3l2 1.5` |
| settings | `M2 5h12M2 11h12` + circles `5,5` and `11,11` r1.6 filled `panel` |
| info | `circle 8,8 r6` + `M8 7.5v3.5M8 5h.01` |
| check | `M3 8.5l3 3 7-7` |
| send | `M8 13V3M4 7l4-4 4 4` |

The screens themselves mostly use text glyphs instead (`+`, `−`, `×`, `↑`,
`⌄`, `↵`). The zoom control's fit button is a 12 px square outline, not the
`fit` icon (see open question 22).

## Map language

Three rules hold everywhere: **the map reads left to right in the direction of
calls, every arrow starts at the caller's border and ends at the callee's, and
only live activity is coloured.** Additionally, as settled for the product: no
line runs through a node, and on the drawn maps no lines cross.

### Zoom levels

The zoom control names the four levels `System · Area · File · Function`. Each
level is named after where you are; the nodes on it are one step finer.

| Level | Screen | You are inside | Nodes shown | Node |
|---|---|---|---|---|
| System | Map System | the project | areas + external services | `area`, 180 × 72, name 15/700, radius 12, `container` bg, `line-3` border |
| Area | Map Area | one area (Billing) | its modules; neighbour areas outlined | `module`, 140 × 64, name 14/600, radius 10, `card` bg, `line-2` border |
| File | Map File | one module (Webhooks) | its files | `file`, 150 × 48, mono 12.5/500, radius 8, row layout: name left, meta right |
| Function | Map Function | one file (webhook.ts) | its functions, each with its plain explanation | `function`, 240 × 96 (260 on the Map Language page), mono 13/500, explanation 13/1.45 `text-2`, padding `12px 14px`, gap 6 |

The Map Language page captions these as “1 · System”, “2 · Area”, “3 · Module”
and “4 · File”, counting by what is shown rather than where you are. The zoom
control and the screen names are the ones used in the product.

**External services and neighbours** are outlined only: transparent background,
name 13/500 `text-2`. **The focused area, module or file is the one filled
container on screen**: radius 14, `1px line-3`, `container` background, title
15/700 (mono 14/500 for a file) with meta 12 `text-4`, placed 20 px in and
14 px down.

Node anatomy (`Node.dc.html`): padding `0 14px` (file `0 12px`), gap 2 (file
row 8), meta mono 10.5 `text-4`, status line 12 (file 11.5). Answer-step badge:
22 px circle at `right -10, top -10`, `text-1` background, `inv` text, 11/700.
Error badge: 18 px circle at `right -9, top -9`, `bg` background, `1px` error
border, `▲` at 7 px.

Column labels on the map: 11/600, `letter-spacing .08em`, `text-4`, uppercase,
24 px from the top of the map. System: `ENTRY`, `API`, `FEATURES`,
`DATA & SERVICES`. Area: `CALLS INTO BILLING` / `BILLING CALLS`. File:
`CALLS INTO WEBHOOKS` / `WEBHOOKS CALLS`. Function: none.

### The 14 node states

| # | State | Background | Border | Status line | Other |
|---|---|---|---|---|---|
| 1 | Default | `card` (area: `container`) | `1px line-2` (area: `line-3`) | meta, `text-4` | |
| 2 | Hover | `hover` | `1px line-3` | meta | |
| 3 | Selected | as default | as default | meta | `outline 2px text-1`, offset 2 |
| 4 | Editing | `editBg` | `1.5px edit` | `● Editing`, `edit` | pulse |
| 5 | Reading | `readBg` | `1px dashed read` | `◌ Reading`, `read` | |
| 6 | Changed, just now | `neuBg` | `1px neu` | `◆ Changed`, `neu` | |
| 7 | Changed, fading | as default | `1px neu` at alpha `0x55` | `◆ Changed 25 min ago`, `text-3` | fades over the set time |
| 8 | New | `neuBg` | `1px neu` | `◆ New`, `neu` | enters with scale and fade |
| 9 | Error | as default | `1px err` | `▲ 1 test failing`, `errT` | |
| 10 | Editing + error | editing | editing | editing | error corner badge |
| 11 | Search match | as default | `1px text-2` | `⌕ Match`, `text-1` | everything else dims |
| 12 | Answer step (Ask) | as default | as default | meta | numbered badge |
| 13 | Dimmed | as default | as default | meta | `opacity .32` |
| 14 | Not opened yet | transparent | `1px dashed line-3` | `Not opened yet`, `text-4` | name `text-4` |

On the System map the status line can carry a custom text in the same colour:
`● Agent editing`, `◆ Dunning added`.

### The 8 connection types

All connections are paths with a filled triangular arrowhead at the callee:
7 long, 4 half-width. Default stroke 1.25, `stroke-linejoin: round`.

| # | Type | Stroke | Rule |
|---|---|---|---|
| 1 | Call | `edge`, 1.25 | Caller to callee, arrow at the callee |
| 2 | Active | `edit`, 1.75, dash `6 4`, flowing | The agent is writing along this call. Flows toward the callee |
| 3 | New | `neu`, 1.25 | Added this session, fades with the changed marker |
| 4 | Answer path | `text-2`, 1.75 | Highlighted by an Ask answer; all others dim |
| 5 | Bundled | `edge`, 2.5, count pill | Several calls between two nodes when zoomed out, with count. Pill 34 × 20, radius 6, `bg` fill, `line-2` border, mono 11 `text-3`, `×6` |
| 6 | Two-way | two `edge` arrows | Always two separate arrows, never one double-headed line |
| 7 | Routing | `edge`, orthogonal | One elbow where possible, never through a node |
| 8 | Dimmed | `edgeDim`, 1.25 | Not involved in the current focus |

### Connection rules as drawn

- Edges are orthogonal polylines. Between two columns the elbow sits halfway
  across the gap (System: gap 60, elbow at +30).
- Parallel edges leaving one node are offset vertically along its border
  (Map System: API leaves at y 310 and 342).
- External services sit in the column of the node that talks to them, above or
  below it, and are connected by **vertical** edges: Billing ⇄ Stripe,
  Database → Neon Postgres, Email → Resend. Stripe → Billing and Billing →
  Stripe are two separate vertical arrows, 60 px apart.
- Jobs sits under Billing in the same column and is reached by a vertical edge.
- The drawn maps contain **right-to-left edges**: in Map Area, API → Auth
  (dimmed) runs back to the left column, and Webhooks → Subscriptions runs
  leftward inside the Billing container. See open question 10.

## Components

From `05 Components` and the screens. All in dark and light.

- **Buttons**, height 34, radius 8, 13/500, padding `8px 14px`: Primary (ink:
  `text-1` background, `inv` text), Secondary (`1px line-3`), Ghost (`text-3`),
  Icon (34 × 34, `1px line-2`, 16 px glyph), Disabled (`line-2` background,
  `text-4`). Smaller primary in banners and cards: `padding 6px 12px` / `6px 14px`.
- **Inputs**, height 34, radius 8, `field`, padding `0 12px`: search with `⌘K`
  key (mono 11, `1px line-2`, radius 4, `padding 1px 5px`); focused with
  `box-shadow 0 0 0 1.5px text-1` and a 1.5 × 16 caret; error with `1px err`
  border and `▲ …` message in `errT` 12.5.
- **Segmented control**: `field`, padding 2, radius 8, 12.5; segments
  `padding 4px 14px` (4px 12px in Settings and Changes), active segment `line-2`
  background, radius 6, inactive `text-4`.
- **Switch**: 36 × 20, radius 10, knob 16 at 2 px inset. On: `text-1` track,
  `bg` knob right. Off: `line-3` track, `text-1` knob left.
- **Select**: `padding 6px 12px`, `1px line-2`, radius 8, `⌄` in `text-4`.
- **Breadcrumb**: `field`, `padding 5px 10px`, radius 8, gap 8; separators `/`;
  last crumb `text-1` 500, others `text-4`.
- **Badges**: status (see Status), count (`padding 1px 6px`, radius 5, `line-2`,
  11), answer step (20 px circle, ink, 11/700).
- **Chat bar** (`ChatBar`): radius 14, `float`, `1px line-2`, floating shadow.
  Header `padding 11px 14px`, 12.5 `text-2`, 7 px dot, file in mono 11.5
  `text-1`; divider `line-1`. Input row `padding 10px 10px 10px 14px`,
  placeholder `text-4`, send button 30 × 30 radius 8 ink with `↑`. Kinds:
  `editing` (orange dot blinking, “Agent is editing” + file), `idle` (green dot,
  “Agent is idle”), `offline` (`text-4` dot, “Chat is unavailable while
  offline”, whole bar `opacity .5`, send button `line-2`). Placeholder: “Ask
  anything, e.g. “Explain how billing works””. On the map: 580 wide, `left 240`,
  `bottom 24`.
- **Chat messages**: question right-aligned, max 300 (360 in the Ask panel),
  `padding 9px 13px`, radius 12, `hover` background, 13.5. Answer 13.5/1.55
  `text-2`. Step chips: `padding 4px 10px`, `1px line-2`, radius 8, 12.5 with a
  16 px numbered circle. Thinking: three 6 px dots (`text-4`, `line-3`,
  `line-3`) and “Reading the code…”.
- **Timeline item**: grid `14px 1fr auto`, gap `4px 10px`, padding 12, radius
  10. Structure and behaviour get a title (600) and a line (12.5 `text-3`);
  minor changes are a single dim row. Selected row `hover`. Markers: `◆` 9 px
  `neu`; 8 px `edit` dot for in progress with time “now” in `edit`; 6 px `line-3`
  dot for minor.
- **Toast**: `padding 12px 14px`, radius 12, `float`, `1px line-2` (error:
  `1px err`), floating shadow, gap 12, trailing “Show” in `text-3`.
- **Palette row**: `padding 10px 12px`, radius 8 (10 in the palette), active row
  `hover`; function names mono 13/500; location 12.5 `text-4`; `↵` 12.
- **Tooltip**: ink background, `inv` text, `padding 8px 12px`, radius 8, 12.5;
  title 600, line at `opacity .7`; 6 px arrow 20 px from the left.
- **Detail panel**: 380 wide, `panel`, `border-left 1px line-1`, padding 32,
  gap 28 (26 at function level). Eyebrow 12 `text-4`, title 28/700 `-.01em`
  (file 22 mono 500, function 20 mono 500), Simple/Technical segmented
  control, explanation 15/1.6 `text-2` (14 at function level), dividers
  `line-1`, sections “Called by”, “Calls”, “Recent” with 12 `text-4` labels.
- **Banner**: `padding 12px 12px 12px 16px`, radius 12, `float`, `1px err`,
  floating shadow, `▲` 11, title 600 13.5, line 12.5 `text-3`, primary button.
- **Topbar**: height 56, `padding 0 20px`, gap 20, `border-bottom 1px line-1`,
  `bg`. Mark 22 + “Codemap” 15/600 `-.02em`; 1 × 20 divider; project name
  `text-3`; breadcrumb; spacer; Changes button (height 32, `1px line-2`, radius
  8, count badge; open: `field` background and stronger border); search field
  240 × 32; status (7 px dot + label 12: `Live` green / `Offline` red with
  `errT` label / `Indexing` orange), `min-width 64`.
- **Legend**: 12 `text-3`, gap 8. Calls (18 px line with arrow), Editing (10 px
  square, radius 3, `0 0 0 1.5px edit` ring), Reading (10 px dashed `read`),
  Changed (`◆` 9 px `neu`), Error (`▲` 9 px `err`). At `left 24, bottom 24`.
- **Zoom control**: level list (12, gap 6, right-aligned; current level
  `text-1` 600 with a 5 px dot, others `text-4`) beside a column of three
  34 × 34 buttons (`+`, `−`, fit) in `float` with `1px line-2`, radius 10. At
  `right 24, bottom 24`.

## Screens

Anything not on this list has no design and is not built. All screens are
1440 × 900: Topbar 56, map 1060 × 844, detail panel 380 × 844.

| # | Screen | File and mode | Light drawn on `06 Screens` |
|---|---|---|---|
| T1 | Terminal: banner, indexing | `01 Brand` | – |
| T2 | Terminal: ready, URL | `01 Brand` | – |
| S1 | Indexing in the browser | `App States` `mode=loading` | – |
| S2 | First run, step 1 of 3 | `Map System` `mode=onboarding` | – |
| S3 | Map · System | `Map System` `mode=default` | yes |
| S4 | Map · Area: Billing, module selected | `Map Area` | yes |
| S5 | Map · File: Webhooks, file selected | `Map File` | – |
| S6 | Map · Function: webhook.ts, function detail in Technical | `Map Function` | yes |
| S7 | Ask: answer numbered on the map | `Map System` `mode=ask` | yes |
| S8 | Changes timeline | `Map System` `mode=changes` | – |
| S9 | Command palette | `Map System` `mode=palette` | – |
| S10 | Empty: no code in folder | `App States` `mode=empty` | – |
| S11 | Server disconnected | `Map System` `mode=offline` | – |
| S12 | Settings | `App States` `mode=settings` | yes |

Every single-screen file takes `theme=light`, so every screen renders in light
from the same tokens even where `06 Screens` does not show it. The light
versions are the same layout with the light token table.

Mode details that are behaviour, not pixels:

- **Ask (S7):** the chat bar is replaced by a 580 × 420 panel. Nodes that are
  answer steps get numbered badges; every other node dims to `.32`. Answer-path
  edges turn `text-2` at 1.75; every other edge turns `edgeDim`. The editing
  state stays on Billing. Answer actions: “Zoom to these steps”, “Explain step
  4”. The chat only explains: there is no build mode and no approve/deny.
- **Changes (S8):** the detail panel becomes the timeline; the Topbar's Changes
  button shows open; the node the selected change belongs to (Jobs) is
  selected on the map. Filter `All · Structure · Behavior`; groups
  “Structure · 2”, “Behavior · 2”, and a collapsed “Minor · 3” row with
  “Show”.
- **Palette (S9):** full scrim; 640 wide at `left 400, top 120`. Input row 56
  high, 16 px text, `esc` key. Groups “Functions”, “Modules & files”, “Ask”.
  The matched substring is underlined (offset 3), not coloured. Footer
  `↑↓ Move · ↵ Open on map · ⇥ Ask instead`.
- **Onboarding (S2):** a spotlight cut out of the scrim around the node being
  explained (196 × 88, radius 16, via `box-shadow 0 0 0 9999px scrim`), card
  320 wide beside it. Step indicator: 16 × 4 active pill, 6 × 4 inactive.
  Legend and zoom control are hidden.
- **Disconnected (S11):** map `filter: grayscale(1)` and `opacity .45`; all
  states and live edges drop to default; banner centred at the top of the map;
  chat bar `offline`; Topbar `Offline`; panel label “Last known activity ·
  14:40”.
- **Loading (S1):** ghost outlines of where nodes will appear (`opacity .5`,
  solid `line-2` on the left, dashed `line-3` on the right), card 440 wide at
  the top centre, animated mark 44, steps with counters, progress bar. Topbar
  crumb “Indexing”, status `Indexing`.
- **Empty (S10):** mark 44 with the callee in `line-3` (not live), “No code
  found here”, the folder that was searched in mono, the two commands, “Choose
  a folder…” and “Reads TypeScript, JavaScript, Python and Go”. Topbar project
  is the folder name, crumb “No project”, changes 0.
- **Settings (S12):** 260 wide section list (General, Map, Explanations,
  Server, Shortcuts), General selected; content max 680 at `padding 40px 64px`.
  Rows: Theme (System/Dark/Light), Reduce motion, Show agent activity, Keep
  “changed” marker for (30 minutes), Default explanation (Simple/Technical),
  Port (4317), Ignored paths (chips with ×, “+ Add”).

## Demo data

The screens show `ledgerly-web`, an invoicing app on Next.js: 8 areas, 1,284
files. Areas Frontend (142 files), Dashboard (38), API (41 routes), Billing
(27), Jobs (12), Auth (19), Database (24), Email (16). External services
Stripe, Neon Postgres, Resend, Google OAuth. Billing's modules: Subscriptions,
Webhooks, Invoices, Plans, Portal, Dunning. Webhooks' files: route.ts,
verify.ts, webhook.test.ts, webhook.ts. webhook.ts's functions and their
explanations are in `Map Function.dc.html`. This data is the fixture for the
static UI and the visual tests. It is not a spec for how real data is
grouped.

## Labels

The brief expected parts of the export in German. **There is no German label
in this export.** Every visible string in every page is already English, and
it is used as written. The only non-product line is the footer of
`Index.dc.html`, “Made in Germany”, which belongs to the design pages and does
not reach the app.

## Licences of fonts and assets

| Item | Source | Licence | Redistributable |
|---|---|---|---|
| Hanken Grotesk | Google Fonts (linked, not in the export) | SIL Open Font License 1.1 | yes |
| JetBrains Mono | Google Fonts (linked, not in the export) | SIL Open Font License 1.1 | yes |
| Marks, icons, illustrations | Drawn inline as SVG in the export | Levo Studio | yes, under the repository licence; the name and marks are not licensed (Apache-2.0 section 6) |
| `.thumbnail` | Written by the design tool from these pages | Levo Studio | yes |
| `support.js` | Design tool runtime | not ours | **not committed** |

The export contains no image, font or third-party asset file.

## Open questions

Everything the export does not answer. None of these is filled in with taste.

1. **Topbar tokens differ from Foundations.** `Topbar.dc.html` uses, in light,
   `field #efefeb` (table: `#f1f1ee`), `line-1 #e6e6e1` (`#ebebe7`), `line-2
   #dcdcd6` (`#e0e0db`), `line-3 #bdbdb6` (`#d3d3cd`), and in dark `line-3
   #3a3d44` (`#2a2c31`). The HTML wins, so the Topbar is built with its own
   values. Intended, or should the Topbar use the shared tokens?
2. **Error background:** `#221416` in `05 Components` and `Map Area`, `#211416`
   in the Foundations status swatch. Which one?
3. **Light orange of the mark:** brand sheet and app icon use `#d9822b`, the
   app's Topbar uses `#c2651a`. Is the in-app mark meant to be the status
   orange, or the brand orange?
4. **Port and URL.** Settings has a fixed Port field (4317, “Restart codemap
   after changing”) and the terminal prints `http://localhost:4317`. The
   architecture binds `127.0.0.1` on a random free port and puts a session
   token in the URL. What does the terminal line show, and does the Port
   setting exist (as an optional fixed port) or go?
5. **Onboarding steps 2 and 3** are not drawn.
6. **Hover on the map** beyond the node hover state: edge hover, when the
   tooltip (`Webhooks → Database`) appears, hover on panel rows.
7. **Settings sections Map, Explanations, Server, Shortcuts** are listed but
   only General is drawn. In particular there is **no design for the provider
   setup** (Claude login, Anthropic key, Ollama) and **no design for the
   first-run explanations opt-in notice**.
8. **The mark's “breathing” once live** has no timing. `02 Brand Sheet` defines
   a `bsLive` keyframe (`opacity 1 → .45 → 1`) but never uses it. The indexing
   cycle is 3 s on the brand sheet and 2.4 s in the loading screen.
9. **Terminal phases.** The design prints six lines (Scanning files, Parsing,
   Resolving imports, Grouping into areas, Writing explanations, Starting
   server). The architecture has seven phases, including layout. Is layout part
   of “Grouping into areas”, or does it get its own line?
10. **Right-to-left and vertical edges.** The drawn maps use vertical edges to
    external services and to Jobs, and two right-to-left edges in Map Area
    (API → Auth, Webhooks → Subscriptions). What is the rule for cycles and
    back-edges in real code, and for sibling calls inside one container?
11. **Where external services go.** On the System map Stripe sits in the
    Features column above Billing, Neon Postgres and Resend in Data & Services.
    Rule: next to the node that calls them?
12. **Error state source.** “▲ 1 test failing” and the “Test failed in
    webhook.test.ts” toast need test results. Codemap does not run tests. Where
    does the error state come from, or is it out of scope for now?
13. **Changes timeline without a provider.** Titles like “Payments handled
    once” are summaries a model writes. What does a change look like when
    explanations are off?
14. **“Choose a folder…”** in the empty state. The browser cannot hand a
    folder path to the local server. What should the button do?
15. **Responsive behaviour.** Every screen is drawn at exactly 1440 × 900.
    Nothing says what the layout does at 1920 × 1080 (does the map grow and the
    panel stay 380?) or below 1440, or whether narrow and mobile widths are in
    scope for a local desktop tool.
16. **Other “Keep changed marker for” options** besides 30 minutes.
17. **Favicon file.** The brand sheet describes a separate pixel-fitted 16 px
    favicon; the file is not in the export.
18. **Overlay elevation.** Foundations defines level 3 with a 6 px ring and a
    larger shadow, but the palette and onboarding card on the screens use the
    level-2 shadow. The HTML of the screens wins; confirm.
19. **Node sizes differ per screen.** External nodes are 140 × 44 on the System
    map, 120 × 52 and 160 × 52 on Map Area, 160 × 48 on Map File. Function nodes
    are 260 on Map Language and 240 on Map Function. Which is the rule for real
    data, where sizes are computed?
20. **Fonts at runtime.** The export loads the fonts from Google Fonts. Codemap
    makes no outgoing requests except to the chosen provider, so the fonts have
    to ship inside the package (both OFL). Vendored `woff2` files with their OFL
    text, or the `@fontsource` packages (a new dependency)?
21. **Animation library.** The motion is defined as CSS values; the map is
    drawn with PixiJS. Is a library such as GSAP wanted for the DOM motion, or
    do the motion tokens drive CSS transitions and the Pixi ticker directly?
22. **Zoom control fit icon** is a square outline; the Foundations `fit` icon is
    four corner brackets.
23. **Version in the banner** (“0.4.0 · ledgerly-web”): the design's version
    number is a placeholder; the package version is used.
