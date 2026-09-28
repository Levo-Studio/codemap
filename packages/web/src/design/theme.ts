// SPDX-License-Identifier: Apache-2.0

import { useSyncExternalStore } from "react";
import type { Theme } from "./tokens";

// The theme the page is in. tokens.css alone decides it, from the user's
// choice on the root's data-theme and otherwise from the system, and names
// the result in --cm-theme. Everything outside CSS that draws in theme
// colours, the WebGL map above all, reads that value, so it can never
// disagree with the DOM.

export function themeFromCss(value: string): Theme {
  return value.trim() === "light" ? "light" : "dark";
}

export function readTheme(): Theme {
  return themeFromCss(getComputedStyle(document.documentElement).getPropertyValue("--cm-theme"));
}

const query = "(prefers-color-scheme: light)";

// The value changes when the choice changes or, without one, when the system
// does.
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
