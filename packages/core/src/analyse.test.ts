// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { lineCount } from "./analyse.js";

describe("lineCount", () => {
  it("does not count the empty line after a final newline", () => {
    expect(lineCount("a\nb\nc\n")).toBe(3);
    expect(lineCount("a\nb\nc")).toBe(3);
    expect(lineCount("")).toBe(0);
  });
});
