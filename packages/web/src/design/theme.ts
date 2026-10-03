// SPDX-License-Identifier: Apache-2.0

import { useSyncExternalStore } from "react";
import type { Theme } from "./tokens";

// tokens.css alone decides the theme: the user's choice in the root's
// data-theme attribute, otherwise the system setting. It names the result in
// --cm-theme. Code outside CSS that draws in theme colours, above all the
// WebGL map, reads that property, so it never disagrees with the DOM.

export function themeFromCss(value: string): Theme {
  return value.trim() === "light" ? "light" : "dark";
}

export function readTheme(): Theme {
  return themeFromCss(getComputedStyle(document.documentElement).getPropertyValue("--cm-theme"));
}

const query = "(prefers-color-scheme: light)";

// --cm-theme changes when data-theme changes or, without that attribute,
// when the system setting does.
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
