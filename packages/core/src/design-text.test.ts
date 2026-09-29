// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { containerTitle } from "./design.js";
import { measuredWith, textWidths } from "./design-text.js";

describe("the measured title widths", () => {
  it("were measured at the sizes an opened node's title is set in", () => {
    const size = (style: string) => Number(style.match(/(\d+(?:\.\d+)?)px/)?.[1]);
    expect(size(measuredWith.title)).toBe(containerTitle.size);
    expect(size(measuredWith.monoTitle)).toBe(containerTitle.monoSize);
    expect(size(measuredWith.meta)).toBe(containerTitle.metaSize);
  });

  it("cover the characters names and counts are written in, in the shipped fonts", () => {
    for (const row of Object.values(textWidths)) {
      expect(row.a).toBeGreaterThan(0);
      expect(row["·"]).toBeGreaterThan(0);
    }
    // JetBrains Mono gives every character it draws the same width; the
    // soft hyphen is drawn as nothing.
    const drawn = Object.values(textWidths.monoTitle).filter((w) => w > 0);
    expect(new Set(drawn).size).toBe(1);
    expect(textWidths.monoTitle["\u00ad"]).toBe(0);
  });
});
