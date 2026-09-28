// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { supported } from "./node-version.js";

describe("supported", () => {
  it("takes Node.js 22.13 and later, where node:sqlite needs no flag", () => {
    expect(supported("22.13.0")).toBe(true);
    expect(supported("22.20.1")).toBe(true);
    expect(supported("24.0.0")).toBe(true);
    expect(supported("26.8.1")).toBe(true);
  });

  it("refuses older ones", () => {
    expect(supported("22.12.9")).toBe(false);
    expect(supported("22.5.0")).toBe(false);
    expect(supported("20.15.1")).toBe(false);
  });
});
