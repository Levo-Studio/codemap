// SPDX-License-Identifier: Apache-2.0

import {
  anthropicProvider,
  claudeProvider,
  ollamaProvider,
  type Provider,
  type ProviderKind,
} from "@codemap/core";
import { Entry } from "@napi-rs/keyring";

export interface SecretStore {
  get(name: string): string | undefined;
  set(name: string, value: string): void;
  delete(name: string): void;
}

const service = "codemap";

// Kept in the keychain, never in a file or printed.
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
  model?: string;
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

// None without a chosen provider, its key or its model.
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
