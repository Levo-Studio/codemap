// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { en, number } from "./en.js";

describe("en", () => {
  it("groups thousands the way the design draws counts", () => {
    expect(number(1284)).toBe("1,284");
    expect(en.meta.files(1284)).toBe("1,284 files");
  });

  it("uses the singular for one", () => {
    expect(en.meta.files(1)).toBe("1 file");
    expect(en.status.testsFailing(1)).toBe("▲ 1 test failing");
    expect(en.status.testsFailing(2)).toBe("▲ 2 tests failing");
  });

  it("puts a shape in front of every status word, so status is never colour alone", () => {
    const words = [
      en.status.editing,
      en.status.agentEditing,
      en.status.reading,
      en.status.changed,
      en.status.new,
      en.status.match,
      en.status.changedAgo(25),
      en.status.added("Dunning"),
      en.status.testsFailing(1),
    ];
    for (const word of words) expect(word).toMatch(/^[●◌◆▲⌕] \S/);
  });
});
