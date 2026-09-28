// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("takes the user's choice", () => {
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
  });

  it("follows the system without a choice, as tokens.css does", () => {
    expect(resolveTheme(undefined, true)).toBe("light");
    expect(resolveTheme(undefined, false)).toBe("dark");
  });
});
