// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  ALLOWED,
  ALLOWED_FOR_DEVELOPMENT,
  findViolations,
  isAllowed,
  parseReport,
} from "./licenses.mjs";

describe("isAllowed", () => {
  it("accepts the licences named in CONTRIBUTING.md", () => {
    for (const id of ["MIT", "ISC", "0BSD", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0"]) {
      expect(isAllowed(id)).toBe(true);
    }
  });

  it("rejects copyleft and source-available licences", () => {
    expect(isAllowed("GPL-3.0-only")).toBe(false);
    expect(isAllowed("AGPL-3.0-or-later")).toBe(false);
    expect(isAllowed("SSPL-1.0")).toBe(false);
    expect(isAllowed("LGPL-2.1-only")).toBe(false);
  });

  it("rejects a missing, unknown or unlisted licence", () => {
    expect(isAllowed("Unknown")).toBe(false);
    expect(isAllowed("")).toBe(false);
    expect(isAllowed("CC-BY-4.0")).toBe(false);
  });

  it("accepts OFL only for font packages", () => {
    expect(isAllowed("OFL-1.1", ALLOWED, "@fontsource/hanken-grotesk")).toBe(true);
    expect(isAllowed("OFL-1.1", ALLOWED, "some-library")).toBe(false);
    expect(isAllowed("OFL-1.1", ALLOWED, "font-parser")).toBe(false);
  });

  it("needs one allowed side of an OR", () => {
    expect(isAllowed("(MIT OR GPL-3.0-only)")).toBe(true);
    expect(isAllowed("GPL-2.0-only OR AGPL-3.0-only")).toBe(false);
  });

  it("needs every side of an AND", () => {
    expect(isAllowed("(MIT AND BSD-3-Clause)")).toBe(true);
    expect(isAllowed("MIT AND GPL-3.0-only")).toBe(false);
  });

  it("does not guess at nested expressions or exceptions", () => {
    expect(isAllowed("MIT AND (Apache-2.0 OR GPL-3.0-only)")).toBe(false);
    expect(isAllowed("Apache-2.0 WITH LLVM-exception")).toBe(false);
  });
});

describe("findViolations", () => {
  it("lists every version of every package under a disallowed licence", () => {
    const report = {
      MIT: [{ name: "fine", versions: ["1.0.0"] }],
      "GPL-3.0-only": [{ name: "copyleft", versions: ["1.0.0", "2.0.0"] }],
    };
    expect(findViolations(report)).toEqual([
      { name: "copyleft", version: "1.0.0", license: "GPL-3.0-only" },
      { name: "copyleft", version: "2.0.0", license: "GPL-3.0-only" },
    ]);
  });

  it("is empty when everything is allowed", () => {
    expect(findViolations({ ISC: [{ name: "fine", versions: ["1.0.0"] }] })).toEqual([]);
  });

  it("lets MPL-2.0 through for development tools only", () => {
    const report = { "MPL-2.0": [{ name: "tool", versions: ["1.0.0"] }] };
    expect(findViolations(report, ALLOWED_FOR_DEVELOPMENT)).toEqual([]);
    expect(findViolations(report, ALLOWED)).toHaveLength(1);
    expect(isAllowed("GPL-3.0-only", ALLOWED_FOR_DEVELOPMENT)).toBe(false);
  });
});

describe("parseReport", () => {
  it("reads pnpm's JSON report", () => {
    expect(parseReport('{"MIT":[]}')).toEqual({ MIT: [] });
  });

  it("reads pnpm's sentence for an empty selection as no packages", () => {
    expect(parseReport("No licenses in packages found\n")).toEqual({});
  });

  it("fails on any other output instead of passing", () => {
    expect(() => parseReport("WARN something unexpected")).toThrow();
  });
});
