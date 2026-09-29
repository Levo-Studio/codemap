// SPDX-License-Identifier: Apache-2.0

// Codemap as the CLI starts it, with a provider of the tests' own in place of
// the user's: never a real one. It explains everything it is asked to, and
// answers a question with a long intro and the first two nodes on the map as
// its steps. Started by answering() in codemap.ts.

import { run } from "../../cli/dist/run.js";

const root = process.argv[2];
const intro = Array.from(
  { length: 40 },
  (_, i) => `Line ${i + 1} of an answer long enough to scroll.`,
).join(" ");

const provider = {
  kind: "anthropic",
  async complete({ prompt }) {
    const names = [...prompt.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
    if (names.length > 0)
      return JSON.stringify(
        Object.fromEntries(
          names.map((n) => [n, { simple: `${n} does its part.`, technical: "`x`" }]),
        ),
      );
    const nodes = [...prompt.matchAll(/^- (\S+) \| /gm)].map((m) => m[1]).slice(0, 2);
    return JSON.stringify({
      intro,
      steps: nodes.map((node) => ({ node, text: "does its part." })),
    });
  },
};

const running = await run({
  root,
  open: false,
  version: "0.0.0",
  out: process.stdout,
  env: { NO_COLOR: "1", XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME },
  provider,
});
process.on("SIGTERM", async () => {
  await running.stop();
  process.exit(0);
});
