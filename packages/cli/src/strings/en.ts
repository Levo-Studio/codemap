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

// A reason from outside (a provider's error, the system's) as the terminal
// may print it: an escape in it would otherwise drive the terminal, retitle
// the window or write over what Codemap printed.
// biome-ignore lint/suspicious/noControlCharactersInRegex: what is taken out
const printable = (text: string) => text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim();

export const en = {
  // What the map's project panel calls a project: its framework where one is
  // recognised, otherwise its languages (TSX is TypeScript there).
  kind: {
    nextjs: "Next.js",
    languages: {
      typescript: "TypeScript",
      tsx: "TypeScript",
      javascript: "JavaScript",
      python: "Python",
      go: "Go",
    } satisfies Record<LanguageId, string>,
    list: (names: string[]) => names.join(", "),
  },

  name: "codemap",
  version: (version: string, project?: string) =>
    project === undefined ? version : `${version} · ${project}`,
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
    explaining: (done: number, total: number) => `${count.format(done)} of ${count.format(total)}`,
    explanationsStopped: (reason: string) => `stopped: ${printable(reason)}`,
    explained: (n: number, ms: number) =>
      `${plural(n, "explanation", "explanations")} · ${seconds(ms)}`,
    time: (ms: number) => seconds(ms),
  },

  percent: (value: number) => `${value}%`,
  opened: "opened in your browser",
  notOpened: "open this address in your browser",
  watching: "Watching for changes · q to quit",

  // Setting up the provider for explanations and Ask. No design draws it;
  // it is asked in the terminal until one does (CONTEXT, open questions).
  setup: {
    offer:
      "Codemap can explain your code in plain language, with an AI provider of your own. Parts of the code are sent to it.",
    optIn: "Turn explanations on? [y/N] ",
    yes: /^y(es)?$/i,
    choose: "Which provider?",
    options: [
      "1  Claude, signed in with the claude command",
      "2  Anthropic API key",
      "3  Ollama, a model on this machine",
    ],
    pick: "Choose 1, 2 or 3: ",
    key: "Anthropic API key (kept in the system keychain): ",
    model: "Ollama model, as `ollama list` shows it: ",
    checking: "Checking the provider…",
    missing: "no key or model was given",
    noKeychain: "No system keychain to keep the settings in; explanations are off for this run.",
    works: (provider: string) => `Explanations are on. Code is sent to ${provider} to explain it.`,
    failed: (reason: string) => `The provider did not answer: ${printable(reason)}`,
    off: "Explanations are off. Run codemap setup to turn them on.",
    providers: {
      claude: "Claude",
      anthropic: "the Anthropic API",
      ollama: "Ollama on this machine",
    },
  },

  // codemap --help. The export draws no help; it says what there is, plainly.
  usage: [
    "Usage: codemap [folder] [options]",
    "       codemap setup",
    "",
    "Opens a live map of the code in folder, or in the folder you are in.",
    "",
    "Options:",
    "  --no-open      Print the address instead of opening the browser",
    "  --no-explain   Keep explanations off for this run",
    "  --version      Print the version",
    "  --help, -h     Print this help",
    "",
    "codemap setup chooses the provider for explanations and Ask.",
  ].join("\n"),

  errors: {
    notADirectory: (path: string) => `${path} is not a folder Codemap can read.`,
    unknownOption: (option: string) => `Unknown option ${option}. See codemap --help.`,
    failed: (reason: string) => `Codemap stopped: ${printable(reason)}`,
    oldNode: (version: string) =>
      `Codemap needs Node.js 22.13 or newer (23.4 or newer in 23); this is Node.js ${version}.`,
  },
} as const;
