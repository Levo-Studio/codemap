// SPDX-License-Identifier: Apache-2.0

import type { LanguageId } from "@codemap/core";

// Every string the terminal shows, in the words of 01 Brand.

const count = new Intl.NumberFormat("en-US");
const plural = (n: number, one: string, many: string) =>
  `${count.format(n)} ${n === 1 ? one : many}`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

const languageNames: Record<LanguageId, string> = {
  typescript: "TypeScript",
  tsx: "TSX",
  javascript: "JavaScript",
  python: "Python",
  go: "Go",
};

export const en = {
  name: "codemap",
  version: (version: string, project: string) => `${version} · ${project}`,
  // The banner without Unicode (02 Brand Sheet).
  plainBanner: "[ ]--[#] codemap",

  glyph: {
    done: "✓",
    running: "◐",
    pending: "○",
    link: "→",
  },

  phase: {
    scan: "Scanning files",
    parse: "Parsing",
    resolve: "Resolving imports",
    group: "Grouping into areas",
    explain: "Writing explanations",
    serve: "Starting server",
  },

  result: {
    files: (n: number, ms?: number) =>
      [plural(n, "file", "files"), ...(ms === undefined ? [] : [seconds(ms)])].join(" · "),
    languages: (ids: LanguageId[], ms?: number) =>
      [
        ids.map((id) => languageNames[id]).join(", "),
        ...(ms === undefined ? [] : [seconds(ms)]),
      ].join(" · "),
    links: (n: number, ms?: number) =>
      [plural(n, "link", "links"), ...(ms === undefined ? [] : [seconds(ms)])].join(" · "),
    areas: (areas: number, modules: number) =>
      `${plural(areas, "area", "areas")} · ${plural(modules, "module", "modules")}`,
    // Explanations are opt-in; until a provider is set up the step does not run.
    explanationsOff: "off",
    time: (ms: number) => seconds(ms),
  },

  percent: (value: number) => `${value}%`,
  opened: "opened in your browser",
  notOpened: "open this address in your browser",
  watching: "Watching for changes · q to quit",

  errors: {
    notADirectory: (path: string) => `${path} is not a folder Codemap can read.`,
    unknownOption: (option: string) => `Unknown option ${option}.`,
  },
} as const;
