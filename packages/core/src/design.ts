// SPDX-License-Identifier: Apache-2.0

// The design values the analysis lays out maps with: node sizes, margins,
// padding and spacing, in CSS pixels as the export draws them. This is the only
// place in core that holds them, as packages/web/src/design/ is for the
// browser; the browser also reads the map margin from here.

// Node sizes per role, from 04 Map Language and the map screens. A function
// node is as wide as the design draws it but only one line high, like a file:
// it shows its name and line, and the panel shows its explanation when it is
// selected (settled in CLAUDE.md, "What the design settles"). The design's
// height of 96 makes room for the explanation on the node itself.
export const size = {
  area: { width: 180, height: 72 },
  external: { width: 140, height: 44 },
  module: { width: 140, height: 64 },
  file: { width: 150, height: 48 },
  function: { width: 240, height: 48 },
} as const;

// Where the map begins inside its canvas: room for the column labels above and
// a margin at the left, as on Map System.
export const margin = { left: 60, top: 64 } as const;

// The open container sits 20 px around its nodes and leaves 50 px at the top
// for its title (Map Area: container at 450,150, first module at 470,200).
export const containerPadding = { side: 20, top: 50, bottom: 20 } as const;

// The title across the top of a container (Map Area): the name and its count
// side by side, 20 px in from the left, 14 px down and 10 px apart. The name is
// bold at 15, a file name medium at 14 in the mono face, the count regular at
// 12. An opened node's box is never narrower than its title plus 20 px inside
// its 1 px border on either side.
export const containerTitle = {
  border: 1,
  x: 20,
  y: 14,
  gap: 10,
  size: 15,
  monoSize: 14,
  metaSize: 12,
} as const;

// Spacing between columns and between nodes in a column, from Map System: 60 px
// between columns, rows at least 36 px apart. The distance a connection keeps
// from a node and from the next connection is not in the export; open question
// in CONTEXT.md.
export const spacing = {
  betweenColumns: 60,
  betweenNodes: 36,
  edgeToNode: 12,
  betweenEdges: 10,
} as const;

// How long the live states last. A node counts as being edited while one of
// its files changed in the last 10 seconds, and shows "Changed" for the first
// minute before it fades. The export draws the states but not their timing,
// except the setting "Keep changed marker for" (30 minutes by default). The
// rest is not in the export; open question in CONTEXT.md.
export const live = {
  editingSeconds: 10,
  justNowSeconds: 60,
  keepMinutes: 30,
} as const;

// The longest question or search the server accepts; a longer one is not about
// the map. The palette input has the same limit, so the server searches for
// exactly what was typed.
export const longestQuestion = 2000;

// How much the server hands the interface at once: rows per palette group,
// lines of a code excerpt, past chats listed, recent changes in a node's panel,
// session changes in the project panel, and the most lines a function's
// signature takes. The palette rows, code lines and chats are not in the
// export, and neither is the signature's line limit; open question in
// CONTEXT.md.
export const shown = {
  paletteRows: 6,
  codeLines: 400,
  chats: 50,
  recentChanges: 3,
  sessionChanges: 2,
  signatureLines: 6,
} as const;

// The outlines of where nodes will appear while the project is read (App
// States, mode loading): solid on the side already grouped, dashed on the
// side that is not.
export const loadingGhosts = [
  { x: 60, y: 200, width: 180, height: 72, dashed: false },
  { x: 60, y: 380, width: 180, height: 72, dashed: false },
  { x: 300, y: 290, width: 180, height: 72, dashed: false },
  { x: 1020, y: 160, width: 180, height: 72, dashed: true },
  { x: 1020, y: 340, width: 180, height: 72, dashed: true },
  { x: 1260, y: 250, width: 140, height: 72, dashed: true },
] as const;

// Each phase's share of the first indexing run, for the progress bar.
export const phaseWeight = { scan: 0.1, parse: 0.6, resolve: 0.15, group: 0.15 } as const;
