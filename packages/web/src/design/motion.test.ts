// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { resolveReducedMotion } from "./motion";

describe("resolveReducedMotion", () => {
  it("reduces when the system asks for it, whatever Settings says", () => {
    expect(resolveReducedMotion(true, false)).toBe(true);
    expect(resolveReducedMotion(true, true)).toBe(true);
  });

  it("reduces when Settings asks for it on a system that does not", () => {
    expect(resolveReducedMotion(false, true)).toBe(true);
  });

  it("animates only when neither asks for less", () => {
    expect(resolveReducedMotion(false, false)).toBe(false);
  });
});
