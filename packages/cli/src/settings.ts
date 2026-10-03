// SPDX-License-Identifier: Apache-2.0

import {
  anthropicProvider,
  claudeProvider,
  ollamaProvider,
  type Provider,
  type ProviderKind,
} from "@codemap/core";
import { Entry } from "@napi-rs/keyring";

// The user's choices for explanations and Ask, kept in the system keychain:
// the provider, its key where it has one, and whether explanations are on.
// None of it is written to a file or printed.

export interface SecretStore {
  get(name: string): string | undefined;
  set(name: string, value: string): void;
  delete(name: string): void;
}

const service = "codemap";

export function keychain(): SecretStore {
  return {
    get(name) {
      try {
        return new Entry(service, name).getPassword() ?? undefined;
      } catch {
        return undefined;
      }
    },
    set(name, value) {
      new Entry(service, name).setPassword(value);
    },
    delete(name) {
      try {
        new Entry(service, name).deletePassword();
      } catch {
        // Nothing stored under that name.
      }
    },
  };
}

export interface Settings {
  provider?: ProviderKind;
  // The Ollama model the user named.
  model?: string;
  // Undefined until the user answers the opt-in question.
  explanations?: "on" | "off";
}

const settingsName = "settings";
const keyName = "anthropic-key";

export function readSettings(store: SecretStore): Settings {
  try {
    return JSON.parse(store.get(settingsName) ?? "{}") as Settings;
  } catch {
    return {};
  }
}

export function writeSettings(store: SecretStore, settings: Settings): void {
  store.set(settingsName, JSON.stringify(settings));
}

export function storeKey(store: SecretStore, key: string): void {
  store.set(keyName, key);
}

function readKey(store: SecretStore): string | undefined {
  return store.get(keyName);
}

// The provider the settings name, or none when no provider is chosen or the
// Anthropic key or the Ollama model is missing.
export function providerFrom(settings: Settings, store: SecretStore): Provider | undefined {
  switch (settings.provider) {
    case "claude":
      return claudeProvider();
    case "anthropic": {
      const key = readKey(store);
      return key ? anthropicProvider({ key }) : undefined;
    }
    case "ollama":
      return settings.model ? ollamaProvider({ model: settings.model }) : undefined;
    default:
      return undefined;
  }
}
