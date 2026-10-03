// SPDX-License-Identifier: Apache-2.0

import type { Phase, PhaseReport } from "./analyse.js";
import { loadingGhosts, phaseWeight } from "./design.js";
import { en } from "./strings/en.js";
import type { EmptyScreen, LoadingScreen, LoadingStep, TopbarView } from "./view.js";

const bar = (project: string, crumb: string, status: TopbarView["status"]): TopbarView => ({
  project,
  crumbs: [crumb],
  status,
  changes: 0,
  changesOpen: false,
});

const phases: Phase[] = ["scan", "parse", "resolve", "group"];

export function loadingScreen(
  project: string,
  reports: ReadonlyMap<Phase, PhaseReport>,
): LoadingScreen {
  const result = (report: PhaseReport): string | undefined => {
    switch (report.phase) {
      case "scan":
        return en.meta.files(report.count);
      case "parse":
        return report.languages && report.languages.length > 0
          ? en.loading.list(report.languages.map((l) => en.loading.languages[l]))
          : undefined;
      case "resolve":
        return report.done ? en.meta.links(report.count) : undefined;
      case "group":
        return report.done ? en.meta.areas(report.count) : undefined;
    }
  };
  const steps: LoadingStep[] = phases.map((phase) => {
    const report = reports.get(phase);
    const text = report ? result(report) : undefined;
    return {
      id: phase,
      label: en.loading.steps[phase],
      state: report ? (report.done ? "done" : "running") : "pending",
      ...(text ? { result: text } : {}),
    };
  });
  // Explanations come after the map opens, so always pending here.
  steps.push({ id: "explain", label: en.loading.steps.explain, state: "pending" });
  const progress = phases.reduce((sum, phase) => {
    const report = reports.get(phase);
    if (!report) return sum;
    const part = report.done ? 1 : report.total ? report.count / report.total : 0;
    return sum + phaseWeight[phase] * part;
  }, 0);
  return {
    kind: "loading",
    topbar: bar(project, en.topbar.crumbs.indexing, "indexing"),
    project,
    ghosts: loadingGhosts.map((g) => ({ ...g })),
    steps,
    progress: Math.round(progress * 100),
  };
}

export function emptyScreen(project: string, folder: string): EmptyScreen {
  return { kind: "empty", topbar: bar(project, en.topbar.crumbs.noProject, "live"), folder };
}
