// SPDX-License-Identifier: Apache-2.0

// The terminal's design values, from 01 Brand and 02 Brand Sheet: its colours
// and the widths of its columns and its progress bar. The one place in the CLI
// that holds them.

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

// The glyph column is the design's 20 px, the gap its 10 px: at the 13 px
// mono of the terminal mockup that is two and one characters.
export const glyphWidth = 2;
export const gap = " ";

// The design's bar is 240 px at the terminal's 13 px mono: thirty cells.
export const barCells = 30;
