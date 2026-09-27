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
