// SPDX-License-Identifier: Apache-2.0

// 04 Map Language; function height settled in CLAUDE.md.
export const size = {
  area: { width: 180, height: 72 },
  external: { width: 140, height: 44 },
  module: { width: 140, height: 64 },
  file: { width: 150, height: 48 },
  function: { width: 240, height: 48 },
} as const;

// Map System.
export const margin = { left: 60, top: 64 } as const;

// Map Area.
export const containerPadding = { side: 20, top: 50, bottom: 20 } as const;

// Map Area.
export const containerTitle = {
  border: 1,
  x: 20,
  y: 14,
  gap: 10,
  size: 15,
  monoSize: 14,
  metaSize: 12,
} as const;

// Map System.
export const spacing = {
  betweenColumns: 60,
  betweenNodes: 36,
  // Not in the export; open question in CONTEXT.md.
  edgeToNode: 12,
  // Not in the export; open question in CONTEXT.md.
  betweenEdges: 10,
} as const;

export const live = {
  // Not in the export; open question in CONTEXT.md.
  editingSeconds: 10,
  // Not in the export; open question in CONTEXT.md.
  justNowSeconds: 60,
  // The setting "Keep changed marker for".
  keepMinutes: 30,
} as const;

export const longestQuestion = 2000;

export const shown = {
  // Not in the export; open question in CONTEXT.md.
  paletteRows: 6,
  // Not in the export; open question in CONTEXT.md.
  codeLines: 400,
  // Not in the export; open question in CONTEXT.md.
  chats: 50,
  recentChanges: 3,
  sessionChanges: 2,
  // Not in the export; open question in CONTEXT.md.
  signatureLines: 6,
} as const;

// App States, mode loading.
export const loadingGhosts = [
  { x: 60, y: 200, width: 180, height: 72, dashed: false },
  { x: 60, y: 380, width: 180, height: 72, dashed: false },
  { x: 300, y: 290, width: 180, height: 72, dashed: false },
  { x: 1020, y: 160, width: 180, height: 72, dashed: true },
  { x: 1020, y: 340, width: 180, height: 72, dashed: true },
  { x: 1260, y: 250, width: 140, height: 72, dashed: true },
] as const;

export const phaseWeight = { scan: 0.1, parse: 0.6, resolve: 0.15, group: 0.15 } as const;
