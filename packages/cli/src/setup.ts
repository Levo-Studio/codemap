// SPDX-License-Identifier: Apache-2.0

import type { Provider, ProviderKind } from "@codemap/core";
import {
  providerFrom,
  readSettings,
  type SecretStore,
  type Settings,
  storeKey,
  writeSettings,
} from "./settings.js";
import { en } from "./strings/en.js";
import { ctrlC, interrupted } from "./terminal.js";

interface Terminal {
  input: NodeJS.ReadStream;
  out: NodeJS.WriteStream;
}

// With hidden on a terminal, raw mode hides the typing.
function question({ input, out }: Terminal, prompt: string, hidden = false): Promise<string> {
  out.write(prompt);
  return new Promise((resolve) => {
    let line = "";
    const raw = hidden && !!input.isTTY;
    if (raw) input.setRawMode(true);
    input.resume();
    const ended = () => {
      if (raw) input.setRawMode(false);
      out.write("\n");
      process.exit(interrupted);
    };
    const done = (value: string) => {
      input.off("data", take);
      input.off("end", ended);
      if (raw) input.setRawMode(false);
      input.pause();
      if (hidden) out.write("\n");
      resolve(value.trim());
    };
    const take = (chunk: Buffer) => {
      for (const char of chunk.toString()) {
        if (char === "\n" || char === "\r") return done(line);
        // Ctrl+C in raw mode still ends Codemap.
        if (char === ctrlC) {
          if (raw) input.setRawMode(false);
          process.exit(interrupted);
        }
        if (char === "\u007f" || char === "\b") line = line.slice(0, -1);
        else line += char;
      }
    };
    input.on("data", take);
    if (input.readableEnded) ended();
    else input.once("end", ended);
  });
}

const kinds: ProviderKind[] = ["claude", "anthropic", "ollama"];

const ping = {
  system: "Answer with the single word OK.",
  prompt: "OK?",
  maxTokens: 5,
  effort: "fast",
} satisfies Parameters<Provider["complete"]>[0];

export async function setup(
  terminal: Terminal,
  store: SecretStore,
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
    // An empty key or model fails the check.
    if (!provider) throw new Error(en.setup.missing);
    await provider.complete(ping);
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

// Asked once, at the first start in a terminal.
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

// Off unless turned on; no keychain means off, not failure.
export async function explanationProvider(options: {
  explain: boolean;
  terminal: Terminal;
  store: SecretStore;
  providerOf?: typeof providerFrom;
}): Promise<Provider | undefined> {
  const { explain, terminal, store, providerOf = providerFrom } = options;
  if (!explain) return undefined;
  try {
    let settings = readSettings(store);
    if (!settings.explanations && terminal.input.isTTY)
      settings = await offerExplanations(terminal, store, providerOf);
    return settings.explanations === "on" ? providerOf(settings, store) : undefined;
  } catch {
    terminal.out.write(`${en.setup.noKeychain}\n`);
    return undefined;
  }
}
