// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// codemapkit bundles the workspace's core and server, so their dependencies
// are its own: every one of them, at the same version, and nothing of the
// workspace, which does not exist on npm.

/** @param {string} name */
const manifest = (name) =>
  /** @type {{ dependencies?: Record<string, string> }} */ (
    JSON.parse(readFileSync(new URL(`../packages/${name}/package.json`, import.meta.url), "utf8"))
  );

describe("codemapkit", () => {
  it("depends on what core and server depend on, at the same versions", () => {
    const own = manifest("cli").dependencies ?? {};
    for (const name of ["core", "server"])
      for (const [dependency, version] of Object.entries(manifest(name).dependencies ?? {})) {
        if (version.startsWith("workspace:")) continue;
        expect(own[dependency], `${name} needs ${dependency}`).toBe(version);
      }
    expect(Object.values(own).some((v) => v.startsWith("workspace:"))).toBe(false);
  });
});
