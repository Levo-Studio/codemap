// SPDX-License-Identifier: Apache-2.0

// Every colour, type size, spacing value, radius and shadow of the interface,
// read out of design/ (see design/Codemap Design Notes.md). Feature code never
// holds a literal: DOM styles use the CSS custom properties from tokens.css
// through `color`, and the WebGL map reads the raw values through `palette`.
// tokens.test.ts keeps the two files in step.

export type Theme = "dark" | "light";

// The names follow the design notes. Values that the Foundations table does
// not list but the screens use (float, edgeDim, dot, inv, scrim) are named as
// the export's own token objects name them.
export interface Palette {
  bg: string;
  panel: string;
  container: string;
  card: string;
  field: string;
  hover: string;
  line1: string;
  line2: string;
  line3: string;
  edge: string;
  edgeDim: string;
  text1: string;
  text2: string;
  text3: string;
  text4: string;
  float: string;
  dot: string;
  inv: string;
  scrim: string;
  shadowFloating: string;
  edit: string;
  editBg: string;
  editPulse: string;
  // The pulse ring at rest: the same colour, fully transparent, so the ring
  // fades in and out instead of changing colour.
  editPulseRest: string;
  read: string;
  readBg: string;
  neu: string;
  neuBg: string;
  neuFaded: string;
  err: string;
  errText: string;
  errBg: string;
  // The Topbar draws its field and lines with its own values, which differ
  // from the shared table in light mode and for line-3 in dark mode. The HTML
  // wins for pixel values, so the Topbar keeps them (design notes, open
  // question 1).
  topbarField: string;
  topbarLine1: string;
  topbarLine2: string;
  topbarLine3: string;
}

export const palette: Record<Theme, Palette> = {
  dark: {
    bg: "#0b0c0e",
    panel: "#0f1012",
    container: "#121316",
    card: "#17181c",
    field: "#141518",
    hover: "#1c1d21",
    line1: "#1c1d21",
    line2: "#24262b",
    line3: "#2a2c31",
    edge: "#3a3d44",
    edgeDim: "#1f2024",
    text1: "#ececef",
    text2: "#c4c6cc",
    text3: "#9a9ca3",
    text4: "#62646b",
    float: "#141518",
    dot: "#16171a",
    inv: "#0b0c0e",
    scrim: "rgba(5, 6, 7, 0.62)",
    shadowFloating: "0 12px 32px rgba(0, 0, 0, 0.45)",
    edit: "#f0a55a",
    editBg: "#1f1a14",
    editPulse: "rgba(240, 165, 90, 0.12)",
    editPulseRest: "rgba(240, 165, 90, 0)",
    read: "#7fb2f0",
    readBg: "#131920",
    neu: "#6fcf97",
    neuBg: "#131a16",
    neuFaded: "#6fcf9755",
    err: "#e5484d",
    errText: "#f2787c",
    // #221416 in Components and Map Area, #211416 in the Foundations swatch;
    // the screens use #221416 (design notes, open question 2).
    errBg: "#221416",
    topbarField: "#141518",
    topbarLine1: "#1c1d21",
    topbarLine2: "#24262b",
    topbarLine3: "#3a3d44",
  },
  light: {
    bg: "#f7f7f5",
    panel: "#ffffff",
    container: "#ffffff",
    card: "#fafaf8",
    field: "#f1f1ee",
    hover: "#efefeb",
    line1: "#ebebe7",
    line2: "#e0e0db",
    line3: "#d3d3cd",
    edge: "#b4b4ad",
    edgeDim: "#e6e6e1",
    text1: "#0f1012",
    text2: "#3a3c41",
    text3: "#62646b",
    text4: "#8e9096",
    float: "#ffffff",
    dot: "#e4e4df",
    inv: "#ffffff",
    scrim: "rgba(15, 16, 18, 0.3)",
    shadowFloating: "0 12px 32px rgba(15, 16, 18, 0.1)",
    edit: "#c2651a",
    editBg: "#fbf1e7",
    editPulse: "rgba(194, 101, 26, 0.14)",
    editPulseRest: "rgba(194, 101, 26, 0)",
    read: "#2f6fd0",
    readBg: "#eef3fb",
    neu: "#1f8a57",
    neuBg: "#ecf6f0",
    neuFaded: "#1f8a5755",
    err: "#d23b40",
    errText: "#c0343a",
    errBg: "#fcefef",
    topbarField: "#efefeb",
    topbarLine1: "#e6e6e1",
    topbarLine2: "#dcdcd6",
    topbarLine3: "#bdbdb6",
  },
};

export type ColorToken = keyof Palette;

// The CSS custom property that carries a colour token, e.g. `--cm-text-1`.
export function cssVariable(token: ColorToken): string {
  return `--cm-${token.replace(/([A-Z]|\d+)/g, (part) => `-${part.toLowerCase()}`)}`;
}

// `color.text1` is `var(--cm-text-1)`: the value a DOM style uses, so a theme
// switch is one attribute on the root and no re-render.
export const color = Object.fromEntries(
  (Object.keys(palette.dark) as ColorToken[]).map((token) => [token, `var(${cssVariable(token)})`]),
) as Record<ColorToken, string>;

export const font = {
  sans: '"Hanken Grotesk", sans-serif',
  mono: '"JetBrains Mono", monospace',
} as const;

export const weight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

// Every type size the design uses. The Foundations roles (display 44,
// title-1 28, title-2 20, heading 15, body 15, ui 13, label 12, code 12.5) are
// among them; the rest are drawn values on the screens and components.
export const size = {
  s7: 7,
  s9: 9,
  s10: 10,
  s10_5: 10.5,
  s11: 11,
  s11_5: 11.5,
  s12: 12,
  s12_5: 12.5,
  s13: 13,
  s13_5: 13.5,
  s14: 14,
  s15: 15,
  s16: 16,
  s18: 18,
  s20: 20,
  s22: 22,
  s24: 24,
  s26: 26,
  s28: 28,
  s44: 44,
} as const;

export const lineHeight = {
  display: 1.05,
  title: 1.2,
  label: 1.3,
  ui: 1.4,
  description: 1.45,
  // Foundations' code role and the Ask answer.
  regular: 1.5,
  // Onboarding and indexing body text, chat messages in Components.
  prose: 1.55,
  body: 1.6,
  terminal: 1.75,
  command: 1.8,
} as const;

export const tracking = {
  display: "-0.02em",
  title: "-0.01em",
  caps: "0.08em",
} as const;

// The 4-point scale, space-1 to space-10.
export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s7: 32,
  s8: 40,
  s9: 56,
  s10: 72,
} as const;

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  node: 10,
  lg: 14,
  full: 999,
} as const;
