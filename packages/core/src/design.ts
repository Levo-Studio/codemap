// SPDX-License-Identifier: Apache-2.0

// The design values the analysis lays maps out with: node sizes, margins,
// padding and spacing, in CSS pixels as the export draws them. Like
// packages/web/src/design/ for the browser, this is the one place in core
// that holds them; the browser reads the map margin from here too.

// Node sizes per role, from 04 Map Language and the map screens.
export const size = {
  area: { width: 180, height: 72 },
  external: { width: 140, height: 44 },
  module: { width: 140, height: 64 },
  file: { width: 150, height: 48 },
  function: { width: 240, height: 96 },
} as const;

// Where the map begins inside its canvas: room for the column labels above
// and a margin at the left, as on the system map.
export const margin = { left: 60, top: 64 } as const;

// The container you are in sits 20 px around its nodes and leaves 50 px at the
// top for its title (Map Area: container at 450,150, first module at 470,200).
export const containerPadding = { side: 20, top: 50, bottom: 20 } as const;

// Spacing between columns and between nodes in a column, from the system map
// of the export: 60 px between columns, rows at least 36 px apart. How far a
// connection keeps from a node and from the next connection is not in the
// export (CONTEXT, open questions).
export const spacing = {
  betweenColumns: 60,
  betweenNodes: 36,
  edgeToNode: 12,
  betweenEdges: 10,
} as const;

// How long the live states last. The export draws the states but not their
// timing, except the setting "Keep changed marker for" (30 minutes by
// default): a node counts as being edited while its files changed in the
// last 10 seconds, and shows "Changed" for the first minute before it fades
// (CONTEXT, open questions).
export const live = {
  editingSeconds: 10,
  justNowSeconds: 60,
  keepMinutes: 30,
} as const;

// The longest question, or search, the server takes: a longer one is not
// about a map. The palette takes no more, so what it searches for is what
// is typed.
export const longestQuestion = 2000;

// How much the server hands the interface at once: the rows of each palette
// group, and the lines of a code excerpt. Neither is drawn in the export
// (CONTEXT).
export const shown = { paletteRows: 6, codeLines: 400 } as const;

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

// How much of the first read each phase stands for, for the progress bar.
export const phaseWeight = { scan: 0.1, parse: 0.6, resolve: 0.15, group: 0.15 } as const;
