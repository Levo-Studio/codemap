// SPDX-License-Identifier: Apache-2.0

import type { ProviderKind } from "@codemap/core";
import {
  providerFrom,
  readSettings,
  type SecretStore,
  type Settings,
  storeKey,
  writeSettings,
} from "./settings.js";
import { en } from "./strings/en.js";

// Setting up the user's own provider in the terminal: which one, its key or
// model, one small request to see that it answers. The key is typed without
// being shown, and never printed.

interface Terminal {
  input: NodeJS.ReadStream;
  out: NodeJS.WriteStream;
}

// One line from the user; hidden, what is typed is not shown.
export function question(
  { input, out }: Terminal,
  prompt: string,
  hidden = false,
): Promise<string> {
  out.write(prompt);
  return new Promise((resolve) => {
    let line = "";
    const raw = hidden && !!input.isTTY;
    if (raw) input.setRawMode(true);
    input.resume();
    const done = (value: string) => {
      input.off("data", take);
      if (raw) input.setRawMode(false);
      input.pause();
      if (hidden) out.write("\n");
      resolve(value.trim());
    };
    const take = (chunk: Buffer) => {
      for (const char of chunk.toString()) {
        if (char === "\n" || char === "\r") return done(line);
        // Ctrl+C in raw mode ends Codemap, as it would anywhere else.
        if (char === "\u0003") {
          if (raw) input.setRawMode(false);
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") line = line.slice(0, -1);
        else line += char;
      }
    };
    input.on("data", take);
  });
}

const kinds: ProviderKind[] = ["claude", "anthropic", "ollama"];

export async function setup(
  terminal: Terminal,
  store: SecretStore,
  // Where the provider comes from; the tests hand in their own.
  providerOf = providerFrom,
): Promise<Settings> {
  const { out } = terminal;
  out.write(`${en.setup.choose}\n${en.setup.options.map((o) => `  ${o}`).join("\n")}\n`);
  let kind: ProviderKind | undefined;
  while (!kind) kind = kinds[Number(await question(terminal, en.setup.pick)) - 1];
  const settings: Settings = { ...readSettings(store), provider: kind, explanations: "on" };
  if (kind === "anthropic") storeKey(store, await question(terminal, en.setup.key, true));
  if (kind === "ollama") settings.model = await question(terminal, en.setup.model);

  out.write(`${en.setup.checking}\n`);
  const provider = providerOf(settings, store);
  try {
    await provider?.complete({
      system: "Answer with the single word OK.",
      prompt: "OK?",
      maxTokens: 5,
      effort: "fast",
    });
    writeSettings(store, settings);
    out.write(`${en.setup.works(en.setup.providers[kind])}\n`);
    return settings;
  } catch (error) {
    out.write(`${en.setup.failed(error instanceof Error ? error.message : "")}\n`);
    const off: Settings = { ...settings, explanations: "off" };
    writeSettings(store, off);
    out.write(`${en.setup.off}\n`);
    return off;
  }
}

// Asked once, at the first start in a terminal: explanations on, with setup,
// or off for good until the user runs setup.
export async function offerExplanations(
  terminal: Terminal,
  store: SecretStore,
  providerOf = providerFrom,
): Promise<Settings> {
  terminal.out.write(`${en.setup.offer}\n`);
  if (en.setup.yes.test(await question(terminal, en.setup.optIn)))
    return setup(terminal, store, providerOf);
  const off: Settings = { ...readSettings(store), explanations: "off" };
  writeSettings(store, off);
  terminal.out.write(`${en.setup.off}\n`);
  return off;
}
