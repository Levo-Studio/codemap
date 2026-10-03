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

export function usePalette(onMap: boolean) {
  const [searching, setSearching] = useState<string | undefined>();
  const [found, setFound] = useState<PaletteView | undefined>();
  const shownOnMap = useRef(false);
  shownOnMap.current = onMap;
  const openPalette = () => setSearching((query) => query ?? "");

  useEffect(() => {
    // navigator.platform names the keyboard's system; userAgent may lie.
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
        // A failed search finds nothing, not stale results.
        if (current) setFound(nothingFound(searching));
      });
    return () => {
      current = false;
    };
  }, [searching]);

  const closePalette = () => {
    setSearching(undefined);
    setFound(undefined);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[aria-label="${en.palette.label}"][role=button]`)
        ?.focus(),
    );
  };

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
