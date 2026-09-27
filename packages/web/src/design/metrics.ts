// SPDX-License-Identifier: Apache-2.0

// Sizes, offsets and strokes of the individual parts, read out of the design
// export. They are not on the Foundations scales because the export draws
// them as they are; they transfer as written. Feature code takes every number
// from here or from tokens.ts.

// The mark: two nodes and the link between them, on a 24-unit grid
// (02 Brand Sheet). The caller is outlined, the callee filled.
export const mark = {
  viewBox: "0 0 24 24",
  grid: 24,
  node: 7,
  cornerRadius: 1.8,
  callerX: 2.5,
  calleeX: 15,
  nodeY: 8.5,
  link: "M9.5 12H15",
  linkLength: 5.5,
  stroke: 2,
  // While indexing the link draws from caller to callee, then the callee
  // fills: keyframe times as fractions of one cycle.
  linkDrawn: [0, 0.15, 0.45, 1],
  calleeShown: [0, 0.4, 0.55, 1],
} as const;

// Topbar (Topbar.dc.html).
export const topbar = {
  height: 56,
  gap: 20,
  paddingX: 20,
  markSize: 22,
  brandGap: 10,
  wordmarkSize: 15,
  divider: { width: 1, height: 20 },
  crumbs: { paddingY: 5, paddingX: 10, gap: 8 },
  button: { height: 32, paddingX: 12, gap: 8 },
  badge: { paddingY: 1, paddingX: 6, radius: 5 },
  search: { width: 240, gap: 10 },
  key: { paddingY: 1, paddingX: 5 },
  status: { gap: 7, dot: 7, minWidth: 64 },
} as const;

// Legend (Legend.dc.html), at the bottom left of the map.
export const legend = {
  inset: 24,
  gap: 8,
  rowGap: 8,
  line: { width: 18, stroke: 1.5, arrowLength: 6, arrowHalf: 3.5, arrowTop: -4.5, arrowRight: -1 },
  swatch: { size: 10, radius: 3, ring: 1.5, marginX: 4 },
  glyph: { width: 18, size: 9 },
} as const;

// Zoom control (ZoomCtl.dc.html), at the bottom right of the map.
export const zoomControl = {
  inset: 24,
  gap: 12,
  levelGap: 6,
  levelDotGap: 6,
  dot: 5,
  radius: 10,
  button: 34,
  glyphSize: 16,
  fit: { size: 12, stroke: 1.5, radius: 3 },
} as const;

// Chat bar (ChatBar.dc.html), floating over the bottom of the map.
export const chatBar = {
  left: 240,
  bottom: 24,
  width: 580,
  radius: 14,
  header: { paddingY: 11, paddingX: 14, gap: 8 },
  dot: 7,
  input: { paddingY: 10, paddingRight: 10, paddingLeft: 14, gap: 12 },
  send: { size: 30, radius: 8, glyph: 14 },
  offlineOpacity: 0.5,
} as const;

// The map canvas (Map System, Map Area, Map File, Map Function).
export const map = {
  // Dot grid: a 1 px dot every 20 px.
  gridSize: 20,
  gridDot: 1,
  column: { top: 24, size: 11, tracking: "0.08em" },
  // The filled container of the area, module or file you are in.
  container: { radius: 14, titleX: 20, titleY: 14, titleGap: 10, titleSize: 15, monoTitleSize: 14 },
} as const;

// Connections (04 Map Language). Every arrow is a filled triangle at the
// callee: 7 long, 4 to each side of the line.
export const edge = {
  width: 1.25,
  strong: 1.75,
  bundled: 2.5,
  arrowLength: 7,
  arrowHalfWidth: 4,
  bundle: { width: 34, height: 20, radius: 6, size: 11 },
} as const;

// Map nodes (Node.dc.html). Sizes of the name per kind, layout per kind.
export const node = {
  radius: { area: 12, file: 8, other: 10 },
  border: 1,
  editingBorder: 1.5,
  outline: 2,
  outlineOffset: 2,
  dimmedOpacity: 0.32,
  padding: { function: [12, 14], file: [0, 12], other: [0, 14] },
  gap: { function: 6, fileRow: 8, other: 2 },
  headerGap: 8,
  name: { area: 15, module: 14, file: 12.5, function: 13, external: 13 },
  meta: 10.5,
  line: { file: 11.5, other: 12 },
  description: 13,
  stepBadge: { size: 22, inset: -10, text: 11 },
  errorBadge: { size: 18, inset: -9, glyph: 7 },
} as const;

// The frame every screen shares: topbar across the top, the map on the left,
// the detail panel on the right (1440 × 900 in the export).
export const frame = {
  panelWidth: 380,
  overlayInset: 24,
} as const;
