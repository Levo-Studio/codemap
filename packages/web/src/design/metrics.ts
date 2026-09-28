// SPDX-License-Identifier: Apache-2.0

// Sizes, offsets and strokes of the individual parts, read out of the design
// export. They are not on the Foundations scales because the export draws
// them as they are; they transfer as written. Feature code takes every number
// from here or from tokens.ts.

import { margin as mapMargin } from "@codemap/core/design";

// The mark: two nodes and the link between them, on a 24-unit grid
// (02 Brand Sheet). The caller is outlined, the callee filled.
export const mark = {
  viewBox: "0 0 24 24",
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
  gap: 8,
  rowGap: 8,
  line: { width: 18, stroke: 1.5, arrowLength: 6, arrowHalf: 3.5, arrowTop: -4.5, arrowRight: -1 },
  swatch: { size: 10, radius: 3, ring: 1.5, marginX: 4 },
  glyph: { width: 18, size: 9 },
} as const;

// Zoom control (ZoomCtl.dc.html), at the bottom right of the map.
export const zoomControl = {
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
  column: { top: 24, size: 11 },
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

// Segmented control, e.g. Simple · Technical (05 Components).
export const segmented = {
  padding: 2,
  segmentRadius: 6,
  // The detail panel's segments are wider than those in Settings and Changes.
  wide: { paddingY: 4, paddingX: 14 },
  narrow: { paddingY: 4, paddingX: 12 },
} as const;

// Status badge, e.g. "● Editing" in the detail panel.
export const badge = { paddingY: 3, paddingX: 8, radius: 6, gap: 6 } as const;

// The detail panel on the right (Map System, Map Area, Map File, Map Function).
export const panel = {
  padding: 32,
  gap: 28,
  functionGap: 26,
  headerGap: 8,
  explanationGap: 14,
  listGap: 10,
  sectionGap: 12,
  rowGap: 10,
  dot: 8,
  glyph: 9,
  columnsGap: 24,
  signature: { paddingY: 12, paddingX: 14, radius: 10 },
} as const;

// The Ask panel: the chat bar opened into an answer (Map System, mode ask).
export const ask = {
  height: 420,
  radius: 16,
  header: { paddingY: 12, paddingX: 16, gap: 8, close: 16 },
  body: { paddingY: 18, paddingX: 20, gap: 16 },
  question: { maxWidth: 360, paddingY: 9, paddingX: 13, radius: 12 },
  answerGap: 12,
  steps: { badgeColumn: 22, gap: 10, badge: 20 },
  actions: { gap: 8, paddingY: 5, paddingX: 10 },
  input: { margin: 12, paddingY: 8, paddingRight: 8, paddingLeft: 14, gap: 12, radius: 10 },
  // While the answer is on its way (05 Components, chat messages): three
  // dots, text-4 then line-3 twice, beside “Reading the code…”.
  thinking: { dot: 6, gap: 8 },
} as const;

// The changes timeline, which takes the detail panel's place (Map System,
// mode changes).
export const timeline = {
  padding: 28,
  gap: 24,
  titleGap: 6,
  close: 18,
  groupGap: 4,
  groupLabelBottom: 6,
  item: { marker: 14, rowGap: 4, columnGap: 10, padding: 12, radius: 10 },
  glyphTop: 4,
  dot: 8,
  dotTop: 5,
  footerPaddingY: 12,
} as const;

// Command palette (Map System, mode palette), over a scrim across the screen.
export const palette = {
  top: 120,
  width: 640,
  radius: 16,
  input: { height: 56, paddingX: 18, gap: 12, size: 16 },
  searchIcon: { size: 12, stroke: 1.5 },
  caret: { width: 1.5, height: 20 },
  key: { paddingY: 2, paddingX: 6, radius: 5 },
  list: 8,
  group: { top: 10, x: 12, bottom: 6 },
  row: { paddingY: 10, paddingX: 12, gap: 12, radius: 10, size: 13 },
  underlineOffset: 3,
  footer: { paddingY: 10, paddingX: 20, gap: 16 },
} as const;

// First-run card, step 1 of 3 (Map System, mode onboarding).
export const onboarding = {
  spotlightRadius: 16,
  spotlightSpread: 9999,
  card: { width: 320, radius: 16, padding: 22, gap: 12 },
  title: 18,
  body: 14,
  controls: { gap: 8, top: 6 },
  step: { active: 16, inactive: 6, height: 4, radius: 2 },
  skip: { paddingY: 6, paddingX: 12 },
  next: { paddingY: 6, paddingX: 14 },
} as const;

// Lost connection to the local server (Map System, mode offline).
export const offline = {
  mapFilter: "grayscale(1)",
  mapOpacity: 0.45,
  bannerTop: 24,
  banner: {
    gap: 16,
    paddingY: 12,
    paddingRight: 12,
    paddingLeft: 16,
    radius: 12,
    glyph: 11,
    textGap: 2,
  },
  retry: { paddingY: 6, paddingX: 12 },
} as const;

// Indexing in the browser (App States, mode loading).
export const loading = {
  ghostRadius: 12,
  ghostOpacity: 0.5,
  card: { top: 120, width: 440, padding: 36, radius: 18, gap: 24 },
  header: { gap: 14, mark: 44, title: 22, body: 14 },
  steps: { glyph: 18, gap: 10, size: 13.5 },
  progress: { gap: 12, height: 4, radius: 2 },
} as const;

// No code in the folder (App States, mode empty).
export const empty = {
  width: 460,
  gap: 20,
  mark: 44,
  textGap: 10,
  title: 26,
  body: 15,
  path: 13.5,
  commands: { radius: 12, paddingY: 14, paddingX: 16, size: 13 },
  actions: { gap: 16 },
  button: { paddingY: 8, paddingX: 14 },
} as const;

// Switch (05 Components).
export const toggle = { width: 36, height: 20, radius: 10, knob: 16, inset: 2 } as const;

// Settings (App States, mode settings).
export const settings = {
  nav: { width: 260, paddingY: 32, paddingX: 20, gap: 4, size: 13.5 },
  navTitle: { bottom: 16, x: 12, size: 20 },
  navItem: { paddingY: 8, paddingX: 12 },
  content: { paddingY: 40, paddingX: 64, maxWidth: 680, gap: 40 },
  heading: { size: 15, bottom: 8 },
  row: { gap: 24, paddingY: 16, textGap: 3, label: 14 },
  select: { gap: 10, paddingY: 6, paddingX: 12 },
  port: { width: 96, paddingY: 6, paddingX: 12 },
  chips: { gap: 6, maxWidth: 320, paddingY: 4, paddingX: 8 },
} as const;

// How the map can be moved. Not drawn in the export; these are behaviour, not
// pixels: how far the zoom buttons step, how far the map can be zoomed, and
// the margin kept right of and below the content: the same as the map keeps
// left of and above it.
export const camera = {
  step: 1.5,
  min: 0.1,
  max: 4,
  margin: { right: mapMargin.left, bottom: mapMargin.top },
  // Wheel and trackpad deltas in pixels become a zoom factor at this rate; a
  // single event counts at most the limit, and a line of a line-based wheel
  // as the given pixels.
  wheel: { rate: 0.01, limit: 50, line: 16 },
} as const;

// How the browser keeps up with the server. Not in the export: how long the
// disconnected banner counts down before it tries again (it shows “Retrying
// in 4 s” mid-count), and how often an open map is fetched again so that
// “Changed 5 min ago” keeps counting without a change.
export const live = {
  retrySeconds: 5,
  refreshSeconds: 60,
  // The countdown steps one second at a time.
  second: 1000,
} as const;
