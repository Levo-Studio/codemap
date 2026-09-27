// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type ColorToken, color, cssVariable, palette, type Theme } from "./tokens";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

function declarations(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf("}", start));
  return new Map(
    [...block.matchAll(/(--cm-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? "", m[2] ?? ""]),
  );
}

const blocks: Record<string, Theme> = {
  ':root[data-theme="dark"]': "dark",
  ':root[data-theme="light"]': "light",
  ":root:not([data-theme])": "light",
};

describe("tokens.css", () => {
  for (const [selector, theme] of Object.entries(blocks)) {
    it(`carries every ${theme} token for ${selector}, with the value from tokens.ts`, () => {
      const declared = declarations(selector);
      const expected = new Map(
        (Object.keys(palette[theme]) as ColorToken[]).map((t) => [
          cssVariable(t),
          palette[theme][t],
        ]),
      );
      expect(declared).toEqual(expected);
    });
  }
});

describe("color", () => {
  it("refers to the custom property of each token", () => {
    expect(color.text1).toBe("var(--cm-text-1)");
    expect(color.editBg).toBe("var(--cm-edit-bg)");
    expect(color.topbarLine3).toBe("var(--cm-topbar-line-3)");
  });

  it("has the same tokens in both themes", () => {
    expect(Object.keys(palette.light)).toEqual(Object.keys(palette.dark));
  });
});
