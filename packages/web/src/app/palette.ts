// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import type { MapScreen, PaletteView } from "../model/view";
import { en } from "../strings/en";
import { getJson } from "./api";

const nothingFound = (query: string): PaletteView => ({
  query,
  functions: [],
  modulesAndFiles: [],
  ask: [],
});

// The command palette while it is open: what is typed, and what it found.
// It opens on the map only, not over the first read or an empty folder.
export function usePalette(onMap: boolean) {
  const [searching, setSearching] = useState<string | undefined>();
  const [found, setFound] = useState<PaletteView | undefined>();
  const shownOnMap = useRef(false);
  shownOnMap.current = onMap;
  const openPalette = () => setSearching((query) => query ?? "");

  // ⌘K or Ctrl+K opens the palette, as the topbar's search field shows.
  useEffect(() => {
    // ⌘ on a Mac, where Ctrl+K deletes to the end of a line; Ctrl elsewhere.
    // The platform, deprecated as it is, names the system the keys come from;
    // the user agent names whatever the browser chooses to show.
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    const onKey = (event: KeyboardEvent) => {
      if ((mac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (!shownOnMap.current) return;
        event.preventDefault();
        setSearching((query) => query ?? "");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (searching === undefined) return;
    let current = true;
    getJson<PaletteView>(`/api/search?${new URLSearchParams({ q: searching })}`)
      .then((view) => {
        if (current) setFound(view ?? nothingFound(searching));
      })
      .catch(() => {
        // A search that fails finds nothing, rather than leaving the last
        // results as though they were for what is typed now.
        if (current) setFound(nothingFound(searching));
      });
    return () => {
      current = false;
    };
  }, [searching]);

  // Closed, the palette gives the focus back to the search field.
  const closePalette = () => {
    setSearching(undefined);
    setFound(undefined);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[aria-label="${en.palette.label}"][role=button]`)
        ?.focus(),
    );
  };

  // The last results stay on screen until those for what is typed arrive.
  const over = (screen: MapScreen): MapScreen =>
    searching === undefined
      ? screen
      : {
          ...screen,
          overlay: {
            kind: "palette",
            palette: { ...(found ?? nothingFound(searching)), query: searching },
          },
        };

  return {
    openPalette,
    setSearching,
    closePalette,
    over,
    ready: found?.query === searching,
  };
}
