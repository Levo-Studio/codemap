// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  providerFrom,
  readSettings,
  type SecretStore,
  storeKey,
  writeSettings,
} from "./settings.js";

function memory(): SecretStore & { names(): string[] } {
  const kept = new Map<string, string>();
  return {
    get: (name) => kept.get(name),
    set: (name, value) => void kept.set(name, value),
    delete: (name) => void kept.delete(name),
    names: () => [...kept.keys()],
  };
}

describe("settings", () => {
  it("are kept in the store and read back; nothing yet means nothing chosen", () => {
    const store = memory();
    expect(readSettings(store)).toEqual({});
    writeSettings(store, { provider: "ollama", model: "llama3.1", explanations: "on" });
    expect(readSettings(store)).toEqual({
      provider: "ollama",
      model: "llama3.1",
      explanations: "on",
    });
  });

  it("give the chosen provider, and none while its key or model is missing", () => {
    const store = memory();
    expect(providerFrom({}, store)).toBeUndefined();
    expect(providerFrom({ provider: "anthropic" }, store)).toBeUndefined();
    storeKey(store, "sk-ant-secret");
    expect(providerFrom({ provider: "anthropic" }, store)?.kind).toBe("anthropic");
    expect(providerFrom({ provider: "ollama" }, store)).toBeUndefined();
    expect(providerFrom({ provider: "ollama", model: "llama3.1" }, store)?.kind).toBe("ollama");
    expect(providerFrom({ provider: "claude" }, store)?.kind).toBe("claude");
  });

  it("keep the key apart from the settings, which never hold it", () => {
    const store = memory();
    storeKey(store, "sk-ant-secret");
    writeSettings(store, { provider: "anthropic", explanations: "on" });
    expect(store.get("settings")).not.toContain("sk-ant-secret");
    expect(store.names().sort()).toEqual(["anthropic-key", "settings"]);
  });
});
