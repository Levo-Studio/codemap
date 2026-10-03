// SPDX-License-Identifier: Apache-2.0

// The terminal palette of 01 Brand.
export const palette = {
  text: "#c4c6cc",
  bright: "#ececef",
  dim: "#62646b",
  pending: "#3a3d44",
  done: "#6fcf97",
  live: "#f0a55a",
  track: "#1c1d21",
  underline: "#3a3d44",
} as const;

// 01 Brand: 20 px and 10 px, 13 px mono.
export const glyphWidth = 2;
export const gap = " ";

// 01 Brand: a 240 px bar at 13 px mono.
export const barCells = 30;

// Not in the export; open question in CONTEXT.md.
export const progressEvery = 250;
// Not in the export; open question in CONTEXT.md.
export const explanationsEvery = 2000;
