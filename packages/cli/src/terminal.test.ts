// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  addressLine,
  banner,
  detectStyle,
  nearest256,
  phaseLine,
  progressBar,
  type Style,
} from "./terminal.js";

const plain: Style = { colour: "none", unicode: true };
const colour: Style = { colour: "truecolor", unicode: true };

describe("detectStyle", () => {
  it("paints only on a terminal, never with NO_COLOR, and in 24-bit only when the terminal says so", () => {
    expect(detectStyle({ COLORTERM: "truecolor" }, false).colour).toBe("none");
    expect(detectStyle({ COLORTERM: "truecolor", NO_COLOR: "" }, true).colour).toBe("none");
    expect(detectStyle({ COLORTERM: "truecolor" }, true).colour).toBe("truecolor");
    expect(detectStyle({ TERM: "xterm-256color" }, true).colour).toBe("256");
    expect(detectStyle({ TERM: "dumb" }, true)).toEqual({ colour: "none", unicode: false });
  });
});

describe("banner", () => {
  it("draws the mark in half blocks with the name and the version line", () => {
    expect(banner(plain, "0.4.0", "ledgerly-web")).toEqual([
      "▄▄▄▄    ▄▄▄▄",
      "█  █━━━━████   codemap",
      "▀▀▀▀    ▀▀▀▀   0.4.0 · ledgerly-web",
    ]);
  });

  it("colours only the callee orange and the link dim", () => {
    const [top, middle] = banner(colour, "0.4.0", "x");
    expect(top).toContain("\u001b[38;2;240;165;90m▄▄▄▄");
    expect(middle).toContain("\u001b[38;2;98;100;107m━━━━");
  });

  it("falls back to the plain version without Unicode", () => {
    expect(banner({ colour: "none", unicode: false }, "0.4.0", "x")[0]).toBe("[ ]--[#] codemap");
  });
});

describe("phaseLine", () => {
  it("lines up glyph, label and result as the design's grid does", () => {
    expect(
      phaseLine(
        plain,
        { state: "done", label: "Scanning files", result: "1,284 files · 0.4s" },
        20,
      ),
    ).toBe("✓  Scanning files       1,284 files · 0.4s");
    expect(phaseLine(plain, { state: "pending", label: "Starting server" }, 20)).toBe(
      "○  Starting server",
    );
  });

  it("paints a running step's label bright and its result orange", () => {
    const line = phaseLine(
      colour,
      { state: "running", label: "Grouping into areas", result: "3 of 8" },
      20,
    );
    expect(line).toContain("\u001b[38;2;236;236;239mGrouping into areas");
    expect(line).toContain("\u001b[38;2;240;165;90m3 of 8");
  });
});

describe("progressBar", () => {
  it("fills thirty cells by the fraction done and says the percentage", () => {
    expect(progressBar(plain, 0.62)).toBe(`${"━".repeat(30)}  62%`);
    expect(progressBar(colour, 0.5)).toContain(`\u001b[38;2;240;165;90m${"━".repeat(15)}`);
  });
});

describe("addressLine", () => {
  it("says whether the browser was opened", () => {
    expect(addressLine(plain, "http://127.0.0.1:1/", true)).toBe(
      "→ http://127.0.0.1:1/  opened in your browser",
    );
  });
});

describe("nearest256", () => {
  it("maps the design's greys to the grey ramp and its orange to the colour cube", () => {
    expect(nearest256("#62646b")).toBeGreaterThanOrEqual(232);
    expect(nearest256("#f0a55a")).toBe(215);
  });
});
