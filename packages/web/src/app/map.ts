// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import type { Explanation, Screen } from "../model/view";
import { mapParams } from "./api";

// The one map of the whole project, with the nodes the user opened showing
// what is inside them in place. What is open lives in the address's
// fragment, so a reload keeps it.

// The nodes a fragment opens; anything else in it opens nothing.
export function openFromHash(hash: string): string[] {
  return [...new Set(new URLSearchParams(hash.replace(/^#/, "")).getAll("open"))];
}

export function hashFromOpen(open: readonly string[]): string {
  if (open.length === 0) return "";
  const params = new URLSearchParams();
  for (const id of open) params.append("open", id);
  return `#${params}`;
}

// Names a map by what is open on it and the chat it shows.
export const mapKey = (openKey: string, chat: string | undefined) =>
  JSON.stringify([openKey, chat]);

interface MapRequest {
  changesOpen: boolean;
  select: string | undefined;
  explanation: Explanation;
  chat: string | undefined;
}

export function useMapScreen(
  { changesOpen, select, explanation, chat }: MapRequest,
  freshness: number,
) {
  const [open, setOpen] = useState<string[]>(() => openFromHash(window.location.hash));
  const openKey = JSON.stringify([...open].sort());
  const [screen, setScreen] = useState<Screen | null>(null);
  // The map last fetched: while the map for another is on its way, a bar
  // across the top shows it is coming.
  const wanted = mapKey(openKey, chat);
  const [arrived, setArrived] = useState(wanted);

  useEffect(() => {
    const follow = () => setOpen(openFromHash(window.location.hash));
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: freshness only asks for a new fetch
  useEffect(() => {
    // The address names what is open, and nothing it could not be read as.
    const hash = hashFromOpen(open);
    if (window.location.hash !== hash)
      window.history.replaceState(null, "", `${window.location.pathname}${hash}`);
    let current = true;
    const arriving = wanted;
    fetch(`/api/map?${mapParams(open, changesOpen, select, explanation, chat)}`)
      .then((response) => {
        if (response.ok) return response.json() as Promise<Screen>;
        // A map that cannot be built with these nodes open is shown with none
        // open, rather than never: a reload would otherwise fail the same way.
        if (current && open.length > 0) setOpen([]);
        if (current) setArrived(arriving);
        return null;
      })
      .then((next) => {
        if (!current || !next) return;
        setScreen(next);
        setArrived(arriving);
        // What the map could not open (gone from the project, or inside
        // something closed) leaves the address, so it names what is shown.
        if (next.kind !== "map") return;
        const opened = new Set(next.map.opened?.map((o) => o.id));
        if (open.some((id) => !opened.has(id))) setOpen(open.filter((id) => opened.has(id)));
      })
      .catch(() => {
        if (current) setArrived(arriving);
      });
    return () => {
      current = false;
    };
  }, [open, changesOpen, select, explanation, chat, freshness]);

  return { open, setOpen, openKey, screen, setScreen, setArrived, opening: arrived !== wanted };
}

export type MapScreenState = ReturnType<typeof useMapScreen>;
