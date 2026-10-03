// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { hashFromOpen, openFromHash } from "./map";

describe("what is open, in the address", () => {
  it("survives the round trip through the fragment, ids with slashes, colons and commas included", () => {
    const open = ["app/(dashboard)", "lib/billing/charge.ts", "a:b", "x,y&z=1"];
    expect(openFromHash(hashFromOpen(open))).toEqual(open);
  });

  it("is nothing without a fragment, or with one it does not understand", () => {
    expect(openFromHash("")).toEqual([]);
    expect(openFromHash("#area:lib%2Fbilling")).toEqual([]);
    expect(hashFromOpen([])).toBe("");
  });
});
