// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { hashFromPlace, placeFromHash } from "./App";

describe("the place in the address", () => {
  it("survives the round trip through the fragment, ids with slashes and colons included", () => {
    for (const place of [
      { level: "area" as const, id: "app/(dashboard)" },
      { level: "function" as const, id: "lib/billing/charge.ts" },
      { level: "file" as const, id: "a:b" },
    ]) {
      expect(placeFromHash(hashFromPlace(place))).toEqual(place);
    }
  });

  it("is the system without a fragment, or with one it does not understand", () => {
    expect(placeFromHash("")).toEqual({ level: "system" });
    expect(placeFromHash("#nonsense:x")).toEqual({ level: "system" });
    expect(hashFromPlace({ level: "system" })).toBe("");
  });
});
