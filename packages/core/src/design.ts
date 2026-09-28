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
  neighbourIn: { width: 160, height: 52 },
  neighbourOut: { width: 180, height: 64 },
  service: { width: 120, height: 52 },
  file: { width: 150, height: 48 },
  fileNeighbourOut: { width: 180, height: 48 },
  fileNeighbourIn: { width: 160, height: 48 },
  function: { width: 240, height: 96 },
  functionNeighbourIn: { width: 200, height: 96 },
  functionNeighbourOut: { width: 180, height: 96 },
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
