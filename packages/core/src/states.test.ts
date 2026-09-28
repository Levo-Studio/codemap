// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { Phase, PhaseReport } from "./analyse.js";
import { emptyScreen, loadingScreen } from "./states.js";
import { en } from "./strings/en.js";

describe("loadingScreen", () => {
  it("shows each phase done, running or pending, with what it found, and the progress", () => {
    const reports = new Map<Phase, PhaseReport>([
      ["scan", { phase: "scan", done: true, count: 1284, milliseconds: 40 }],
      [
        "parse",
        {
          phase: "parse",
          done: false,
          count: 642,
          total: 1284,
          languages: ["typescript", "tsx"],
          milliseconds: 300,
        },
      ],
    ]);
    const screen = loadingScreen("ledgerly-web", reports);
    expect(screen.topbar).toMatchObject({
      project: "ledgerly-web",
      crumbs: [en.topbar.crumbs.indexing],
      status: "indexing",
    });
    expect(screen.steps).toEqual([
      { id: "scan", label: en.loading.steps.scan, state: "done", result: en.meta.files(1284) },
      { id: "parse", label: en.loading.steps.parse, state: "running", result: "TypeScript, TSX" },
      { id: "resolve", label: en.loading.steps.resolve, state: "pending" },
      { id: "group", label: en.loading.steps.group, state: "pending" },
      { id: "explain", label: en.loading.steps.explain, state: "pending" },
    ]);
    expect(screen.progress).toBe(40);
    expect(screen.ghosts).toHaveLength(6);
  });
});

describe("loadingScreen with explanations on", () => {
  it("shows how many of them are written", () => {
    const screen = loadingScreen("p", new Map(), { done: 12, total: 340 });
    expect(screen.steps.at(-1)).toEqual({
      id: "explain",
      label: en.loading.steps.explain,
      state: "running",
      result: en.loading.ofTotal(12, 340),
    });
  });
});

describe("emptyScreen", () => {
  it("names the folder that was searched and says there is no project", () => {
    expect(emptyScreen("Downloads", "~/Downloads")).toEqual({
      kind: "empty",
      topbar: {
        project: "Downloads",
        crumbs: [en.topbar.crumbs.noProject],
        status: "live",
        changes: 0,
        changesOpen: false,
      },
      folder: "~/Downloads",
    });
  });
});
