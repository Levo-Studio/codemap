// SPDX-License-Identifier: Apache-2.0

import { useSyncExternalStore } from "react";
import type { Theme } from "./tokens";

// The theme the page is actually in, decided the way tokens.css decides it:
// the user's choice on the root's data-theme, and without one the system.
// Everything outside CSS that draws in theme colours, the WebGL map above all,
// reads it here, so it can never disagree with the DOM.

export function resolveTheme(choice: string | undefined, systemPrefersLight: boolean): Theme {
  if (choice === "dark" || choice === "light") return choice;
  return systemPrefersLight ? "light" : "dark";
}

const query = "(prefers-color-scheme: light)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(query);
  const observer = new MutationObserver(onChange);
  media.addEventListener("change", onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    media.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

function current(): Theme {
  return resolveTheme(document.documentElement.dataset.theme, window.matchMedia(query).matches);
}

export function useResolvedTheme(): Theme {
  return useSyncExternalStore(subscribe, current, () => "dark");
}
