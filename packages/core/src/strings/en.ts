// SPDX-License-Identifier: Apache-2.0

// Every string the interface shows, in the words of the design export. What
// comes from the user's code (names, paths, explanations, change summaries) is
// data and does not belong here. Status words carry their glyph, because the
// glyph is part of the word: status is never colour alone.

import type { LanguageId } from "../languages.js";

const count = new Intl.NumberFormat("en-US");

// "1,284", with the thousands separator the design draws.
export function number(value: number): string {
  return count.format(value);
}

function plural(value: number, one: string, many: string): string {
  return `${number(value)} ${value === 1 ? one : many}`;
}

export const en = {
  product: "Codemap",

  topbar: {
    changes: "Changes",
    search: "Search",
    searchKey: "⌘K",
    crumbSeparator: "/",
    status: {
      live: "Live",
      offline: "Offline",
      indexing: "Indexing",
    },
    crumbs: {
      system: "System",
      indexing: "Indexing",
      settings: "Settings",
      noProject: "No project",
    },
  },

  levels: {
    system: "System",
    area: "Area",
    file: "File",
    function: "Function",
  },

  columns: {
    entry: "ENTRY",
    api: "API",
    features: "FEATURES",
    dataAndServices: "DATA & SERVICES",
    callsInto: (name: string) => `CALLS INTO ${name.toUpperCase()}`,
    calls: (name: string) => `${name.toUpperCase()} CALLS`,
  },

  glyph: {
    changed: "◆",
    error: "▲",
  },

  zoom: {
    in: "+",
    out: "−",
    // Names for assistive technology; the buttons show only their glyphs.
    inLabel: "Zoom in",
    outLabel: "Zoom out",
    fitLabel: "Fit the map to the window",
  },

  legend: {
    calls: "Calls",
    editing: "Editing",
    reading: "Reading",
    changed: "Changed",
    error: "Error",
  },

  status: {
    editing: "● Editing",
    agentEditing: "● Agent editing",
    editingAtLine: (line: number) => `● Editing · line ${line}`,
    reading: "◌ Reading",
    changed: "◆ Changed",
    changedAgo: (minutes: number) => `◆ Changed ${minutes} min ago`,
    added: (name: string) => `◆ ${name} added`,
    new: "◆ New",
    testsFailing: (failing: number) => `▲ ${failing} test${failing === 1 ? "" : "s"} failing`,
    match: "⌕ Match",
    notOpened: "Not opened yet",
  },

  meta: {
    files: (n: number) => plural(n, "file", "files"),
    routes: (n: number) => plural(n, "route", "routes"),
    lines: (n: number) => plural(n, "line", "lines"),
    functions: (n: number) => plural(n, "function", "functions"),
    modules: (n: number) => plural(n, "module", "modules"),
    areas: (n: number) => plural(n, "area", "areas"),
    links: (n: number) => plural(n, "link", "links"),
    line: (n: number) => `L${n}`,
    external: "External",
    bundle: (calls: number) => `×${calls}`,
    separator: " · ",
    path: " › ",
  },

  chat: {
    agentEditing: "Agent is editing",
    agentIdle: "Agent is idle",
    offline: "Chat is unavailable while offline",
    placeholder: "Ask anything, e.g. “Explain how billing works”",
    followUp: "Ask a follow-up…",
    thinking: "Reading the code…",
    send: "↑",
    // Names for assistive technology, and what the chat says when it cannot
    // answer; none of them is drawn (CONTEXT, open questions).
    sendLabel: "Send",
    closeLabel: "Close the answer",
    noProvider: "Ask needs a provider of your own. Run codemap setup in the terminal.",
    failed: (reason: string) => `No answer from the provider: ${reason}`,
    close: "×",
    zoomToSteps: "Zoom to these steps",
    explainStep: (step: number) => `Explain step ${step}`,
  },

  panel: {
    project: "Project",
    simple: "Simple",
    technical: "Technical",
    liveNow: "Live now",
    lastKnownActivity: (time: string) => `Last known activity · ${time}`,
    editing: "Editing",
    reading: "Reading",
    thisSession: "This session",
    allChanges: (n: number) => `All ${n} changes →`,
    calledBy: "Called by",
    calls: "Calls",
    recent: "Recent",
    functions: (n: number) => `Functions · ${n}`,
    kind: {
      area: "Area",
      module: "Module",
      file: "File",
      function: "Function",
    },
    now: "now",
    added: (lines: number) => `+${lines}`,
    // The owner's: a function's or file's code on request.
    showCode: "Show code",
    hideCode: "Hide code",
    moreCode: (lines: number) => `The file goes on; the first ${lines} lines are shown.`,
    removed: (lines: number) => `−${lines}`,
  },

  // Why a provider did not answer, where it gave no words of its own.
  provider: {
    timedOut: "The provider took too long to answer.",
    unreachable: "The provider could not be reached.",
    claudeMissing: "The claude command could not be started.",
    failed: "The claude command failed.",
    noAnswer: "The claude command gave no answer.",
    cutOff: "The answer was cut off.",
    declined: "The provider declined to answer.",
  },

  changes: {
    title: "Changes",
    since: (time: string, minutes: number) => `Since ${time} · ${minutes} min`,
    filter: {
      all: "All",
      structure: "Structure",
      behavior: "Behavior",
    },
    group: {
      structure: (n: number) => `Structure · ${n}`,
      behavior: (n: number) => `Behavior · ${n}`,
      minor: (n: number) => `Minor · ${n}`,
    },
    show: "Show",
    close: "×",
    closeLabel: "Close changes",
    // Without a provider nobody summarises a change in words, so an item
    // says what the code shows for certain (CONTEXT, open questions).
    item: {
      area: (name: string) => `New area ${name}`,
      module: (name: string) => `New module ${name}`,
      service: (name: string) => `Uses ${name}`,
      fileAdded: (name: string) => `New file ${name}`,
      fileRemoved: (name: string) => `${name} removed`,
      fileChanged: (name: string) => `${name} changed`,
      added: (names: string[]) => `Adds ${names.join(", ")}`,
      changed: (names: string[]) => `Changes ${names.join(", ")}`,
      removed: (names: string[]) => `Removes ${names.join(", ")}`,
      sentences: (parts: string[]) => parts.map((p) => `${p}.`).join(" "),
    },
  },

  // A time of day as the panels show it: 14:21.
  clock: (at: number) => {
    const time = new Date(at);
    const two = (n: number) => String(n).padStart(2, "0");
    return `${two(time.getHours())}:${two(time.getMinutes())}`;
  },

  palette: {
    escape: "esc",
    groups: {
      functions: "Functions",
      modulesAndFiles: "Modules & files",
      ask: "Ask",
    },
    enter: "↵",
    hints: {
      move: "↑↓ Move",
      open: "↵ Open on map",
      ask: "⇥ Ask instead",
    },
    // The question the Ask group offers for what was typed, as drawn:
    // “Explain how invoices work”.
    explainHow: (query: string) => `Explain how ${query} works`,
    // Names for assistive technology; the field and the close key show none.
    label: "Search functions, modules and files",
    close: "Close search",
  },

  onboarding: {
    step: (step: number, total: number) => `${step} of ${total}`,
    map: {
      title: "This is your app as a map",
      body: "Each box is one area of the code. Arrows show what calls what. Orange means the agent is working there right now.",
    },
    skip: "Skip",
    next: "Next",
  },

  offline: {
    title: "Lost connection to the local server",
    retrying: (seconds: number) =>
      `Is codemap still running in your terminal? Retrying in ${seconds} s`,
    retry: "Retry now",
  },

  loading: {
    title: (project: string) => `Mapping ${project}`,
    body: "The first run takes about 20 seconds. After that the map updates live as files change.",
    steps: {
      scan: "Scanning files",
      parse: "Parsing",
      resolve: "Resolving imports",
      group: "Grouping into areas",
      explain: "Writing explanations",
    },
    ofTotal: (done: number, total: number) => `${done} of ${total}`,
    // The parse step names the languages it has met, as the terminal does.
    languages: {
      typescript: "TypeScript",
      tsx: "TSX",
      javascript: "JavaScript",
      python: "Python",
      go: "Go",
    } satisfies Record<LanguageId, string>,
    list: (names: string[]) => names.join(", "),
    percent: (value: number) => `${value}%`,
    done: "✓",
    running: "◐",
    pending: "○",
  },

  empty: {
    title: "No code found here",
    lookedIn: "Codemap looked in",
    foundNothing: "and found no source files it can read. Run it inside a project folder.",
    prompt: "$",
    changeDirectory: "cd path/to/your-project",
    command: "codemap",
    chooseFolder: "Choose a folder…",
    languages: "Reads TypeScript, JavaScript, Python and Go",
  },

  settings: {
    title: "Settings",
    sections: {
      general: "General",
      map: "Map",
      explanations: "Explanations",
      server: "Server",
      shortcuts: "Shortcuts",
    },
    appearance: "Appearance",
    theme: {
      label: "Theme",
      hint: "Follows your system unless you pick one",
      system: "System",
      dark: "Dark",
      light: "Light",
    },
    reduceMotion: {
      label: "Reduce motion",
      hint: "Replaces pulsing and flowing edges with static markers",
    },
    map: "Map",
    agentActivity: {
      label: "Show agent activity",
      hint: "Highlight where the agent is reading and editing",
    },
    changedMarker: {
      label: "Keep “changed” marker for",
      hint: "The green marker fades out over this time",
      minutes: (n: number) => `${n} minutes`,
    },
    defaultExplanation: {
      label: "Default explanation",
      hint: "What the detail panel shows first",
    },
    server: "Server",
    port: {
      label: "Port",
      hint: "Restart codemap after changing",
    },
    ignoredPaths: {
      label: "Ignored paths",
      hint: "Never shown on the map",
      remove: "×",
      add: "+ Add",
    },
    open: "⌄",
  },
} as const;
