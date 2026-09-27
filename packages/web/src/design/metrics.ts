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
