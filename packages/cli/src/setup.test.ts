// SPDX-License-Identifier: Apache-2.0

import { PassThrough } from "node:stream";
import type { Provider } from "@codemap/core";
import { describe, expect, it } from "vitest";
import { readSettings, type SecretStore } from "./settings.js";
import { offerExplanations, setup } from "./setup.js";
import { en } from "./strings/en.js";

function memory(): SecretStore {
  const kept = new Map<string, string>();
  return {
    get: (name) => kept.get(name),
    set: (name, value) => void kept.set(name, value),
    delete: (name) => void kept.delete(name),
  };
}

// A terminal that types the given lines, one each time it is asked.
function terminal(lines: string[]) {
  const input = new PassThrough() as PassThrough & {
    isTTY: boolean;
    setRawMode(on: boolean): void;
  };
  input.isTTY = false;
  input.setRawMode = () => {};
  const out = new PassThrough();
  let written = "";
  out.on("data", (chunk: Buffer) => {
    written += chunk.toString();
    const asked = [en.setup.optIn, en.setup.pick, en.setup.key, en.setup.model].some((p) =>
      chunk.toString().endsWith(p),
    );
    if (asked) setImmediate(() => input.write(`${lines.shift() ?? ""}\n`));
  });
  return {
    input: input as unknown as NodeJS.ReadStream,
    out: out as unknown as NodeJS.WriteStream,
    written: () => written,
  };
}

const answering = (ok: boolean) => (): Provider => ({
  kind: "anthropic",
  complete: async () => {
    if (!ok) throw new Error("invalid x-api-key");
    return "OK";
  },
});

describe("setup", () => {
  it("keeps the chosen provider and its key, and never shows the key", async () => {
    const store = memory();
    const term = terminal(["2", "sk-ant-secret"]);
    const settings = await setup(term, store, answering(true));
    expect(settings).toEqual({ provider: "anthropic", explanations: "on" });
    expect(readSettings(store)).toEqual(settings);
    expect(store.get("anthropic-key")).toBe("sk-ant-secret");
    expect(term.written()).toContain(en.setup.works(en.setup.providers.anthropic));
    expect(term.written()).not.toContain("sk-ant-secret");
  });

  it("asks again for a choice that is not one of the three", async () => {
    const store = memory();
    const settings = await setup(terminal(["7", "3", "llama3.1"]), store, answering(true));
    expect(settings).toEqual({ provider: "ollama", model: "llama3.1", explanations: "on" });
  });

  it("turns explanations off when the provider does not answer, and says why", async () => {
    const store = memory();
    const term = terminal(["2", "sk-ant-wrong"]);
    const settings = await setup(term, store, answering(false));
    expect(settings.explanations).toBe("off");
    expect(term.written()).toContain(en.setup.failed("invalid x-api-key"));
  });
});

describe("setup without a key", () => {
  it("does not call an empty key working", async () => {
    const store = memory();
    const term = terminal(["2", ""]);
    const settings = await setup(term, store);
    expect(settings.explanations).toBe("off");
    expect(term.written()).not.toContain(en.setup.works(en.setup.providers.anthropic));
  });
});

describe("offerExplanations", () => {
  it("keeps explanations off when the user says no, and does not ask again", async () => {
    const store = memory();
    const term = terminal(["n"]);
    expect(await offerExplanations(term, store, answering(true))).toEqual({ explanations: "off" });
    expect(term.written()).toContain(en.setup.offer);
    expect(term.written()).toContain(en.setup.off);
  });

  it("sets up the provider when the user says yes", async () => {
    const store = memory();
    const settings = await offerExplanations(terminal(["y", "1"]), store, answering(true));
    expect(settings).toEqual({ provider: "claude", explanations: "on" });
  });
});
