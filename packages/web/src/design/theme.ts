// SPDX-License-Identifier: Apache-2.0

import { useSyncExternalStore } from "react";
import type { Theme } from "./tokens";

export function themeFromCss(value: string): Theme {
  return value.trim() === "light" ? "light" : "dark";
}

export function readTheme(): Theme {
  return themeFromCss(getComputedStyle(document.documentElement).getPropertyValue("--cm-theme"));
}

const query = "(prefers-color-scheme: light)";

// Both data-theme and the system setting can change --cm-theme.
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

export function useResolvedTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "dark");
}
