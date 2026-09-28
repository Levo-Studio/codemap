// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { themeFromCss } from "./theme";

describe("themeFromCss", () => {
  it("reads the theme tokens.css names", () => {
    expect(themeFromCss(" light")).toBe("light");
    expect(themeFromCss("dark")).toBe("dark");
  });

  it("falls back to dark, the default block, for anything else", () => {
    expect(themeFromCss("")).toBe("dark");
  });
});
