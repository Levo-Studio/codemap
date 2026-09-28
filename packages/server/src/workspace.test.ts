// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

// Tests read the other workspace packages from their sources. Read from their
// builds, they would test whatever was built last, not the code beside them.
describe("the workspace in tests", () => {
  it("imports @codemap/core from its sources, not its build", async () => {
    const [byName, bySource] = await Promise.all([
      import("@codemap/core"),
      import("../../core/src/index.js"),
    ]);
    expect(byName.layout).toBe(bySource.layout);
  });
});
