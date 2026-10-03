// SPDX-License-Identifier: Apache-2.0

import { barCells, gap, glyphWidth, palette } from "./design.js";
import { en } from "./strings/en.js";

type ColourMode = "truecolor" | "256" | "none";

export interface Style {
  colour: ColourMode;
  unicode: boolean;
}

type Colour = keyof typeof palette;

export function detectStyle(env: NodeJS.ProcessEnv, isTTY: boolean): Style {
  const term = env.TERM ?? "";
  const unicode = term !== "dumb" && term !== "linux";
  if (!isTTY || "NO_COLOR" in env || term === "dumb") return { colour: "none", unicode };
  if (/^(truecolor|24bit)$/i.test(env.COLORTERM ?? "")) return { colour: "truecolor", unicode };
  if (/256/.test(term)) return { colour: "256", unicode };
  return { colour: "none", unicode };
}

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

// From the xterm-256 6×6×6 cube or its grey ramp.
export function nearest256(hex: string): number {
  const [r, g, b] = rgb(hex);
  const level = (v: number) => (v < 48 ? 0 : v < 115 ? 1 : Math.floor((v - 35) / 40));
  const steps = [0, 95, 135, 175, 215, 255];
  const [cr, cg, cb] = [level(r), level(g), level(b)];
  const cube = 16 + 36 * cr + 6 * cg + cb;
  const cubeDistance =
    ((steps[cr] ?? 0) - r) ** 2 + ((steps[cg] ?? 0) - g) ** 2 + ((steps[cb] ?? 0) - b) ** 2;
  const grey = Math.round(((r + g + b) / 3 - 8) / 10);
  const greyIndex = Math.max(0, Math.min(23, grey));
  const greyValue = 8 + 10 * greyIndex;
  const greyDistance = (greyValue - r) ** 2 + (greyValue - g) ** 2 + (greyValue - b) ** 2;
  return greyDistance < cubeDistance ? 232 + greyIndex : cube;
}

const csi = "\u001b[";

export function paint(
  style: Style,
  colour: Colour,
  text: string,
  options: { bold?: boolean; underline?: boolean } = {},
): string {
  if (style.colour === "none") return text;
  const [r, g, b] = rgb(palette[colour]);
  const codes = [
    style.colour === "truecolor" ? `38;2;${r};${g};${b}` : `38;5;${nearest256(palette[colour])}`,
  ];
  if (options.bold) codes.push("1");
  if (options.underline) codes.push("4");
  return `${csi}${codes.join(";")}m${text}${csi}0m`;
}

// Half blocks keep the nodes square in any monospace font.
export function banner(style: Style, version: string, project?: string): string[] {
  if (!style.unicode) return [en.plainBanner, en.version(version, project)];
  const callee = (s: string) => paint(style, "live", s);
  const node = (s: string) => paint(style, "bright", s);
  return [
    `${node("▄▄▄▄")}    ${callee("▄▄▄▄")}`,
    `${node("█  █")}${paint(style, "dim", "━━━━")}${callee("████")}   ${paint(style, "bright", en.name, { bold: true })}`,
    `${node("▀▀▀▀")}    ${callee("▀▀▀▀")}   ${paint(style, "dim", en.version(version, project))}`,
  ];
}

// Terminals get the banner; scripts get the bare version.
export function versionText(style: Style, version: string, isTerminal: boolean): string {
  return isTerminal ? `\n${banner(style, version).join("\n")}\n` : version;
}

type LineState = "done" | "running" | "pending";

export interface Line {
  state: LineState;
  label: string;
  result?: string;
}

const lineColours: Record<LineState, Record<"glyph" | "label" | "result", Colour>> = {
  done: { glyph: "done", label: "text", result: "dim" },
  running: { glyph: "live", label: "bright", result: "live" },
  pending: { glyph: "pending", label: "dim", result: "dim" },
};

export function phaseLine(style: Style, line: Line, labelWidth: number): string {
  const colours = lineColours[line.state];
  const glyph = paint(style, colours.glyph, en.glyph[line.state].padEnd(glyphWidth));
  const label = paint(style, colours.label, line.label.padEnd(labelWidth));
  const result = line.result ? `${gap}${paint(style, colours.result, line.result)}` : "";
  return `${glyph}${gap}${label}${result}`.trimEnd();
}

export function progressBar(style: Style, fraction: number): string {
  const clamped = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(clamped * barCells);
  // Unicode tells the parts apart by colour; ASCII by characters.
  const filledCell = style.unicode ? "━" : "=";
  const emptyCell = style.unicode ? "━" : "-";
  const bar =
    paint(style, "live", filledCell.repeat(filled)) +
    paint(style, "track", emptyCell.repeat(barCells - filled));
  return `${bar}  ${paint(style, "dim", en.percent(Math.round(clamped * 100)))}`;
}

export function addressLine(style: Style, url: string, opened: boolean): string {
  return `${paint(style, "bright", `${en.glyph.link} `)}${paint(style, "bright", url, { underline: true })}  ${paint(style, "dim", opened ? en.opened : en.notOpened)}`;
}

export function watchingLine(style: Style): string {
  return paint(style, "dim", en.watching);
}

export const cursor = {
  blinking: `${csi}1 q`,
  steady: `${csi}2 q`,
  restore: `${csi}0 q`,
};

export const ctrlC = "\u0003";

// Restores the terminal's cursor once, however Codemap ends.
export function cursorRestorer(out: NodeJS.WriteStream): () => void {
  let restored = false;
  return () => {
    if (restored || !out.isTTY) return;
    restored = true;
    out.write(cursor.restore);
  };
}

// Wrapped lines count as rows, so redrawing moves up enough.
export function liveBlock(out: NodeJS.WriteStream) {
  let drawn = 0;
  const rows = (line: string) => {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the escape starts every colour
    const visible = line.replace(/\u001b\[[0-9;]*m/g, "").length;
    return Math.max(1, Math.ceil(visible / (out.columns || visible || 1)));
  };
  return {
    draw(lines: string[], final = false) {
      if (!out.isTTY && !final) return;
      if (out.isTTY && drawn > 0) out.write(`\u001b[${drawn}F`);
      for (const line of lines) out.write(`${out.isTTY ? "\u001b[0J" : ""}${line}\n`);
      drawn = out.isTTY ? lines.reduce((sum, line) => sum + rows(line), 0) : 0;
    },
  };
}
