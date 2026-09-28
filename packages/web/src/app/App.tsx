// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { MotionProvider } from "../design/motion";
import type { Level, MapScreen, PlaceRef } from "../model/view";
import { MapScreenView } from "../screens/MapScreenView";

// The app as the local server serves it: the map of the project, at the place
// the address names. The place lives in the address's fragment, so a reload
// and the browser's back button stay where they were.

const levels: Level[] = ["system", "area", "file", "function"];

export function placeFromHash(hash: string): PlaceRef {
  const [level, ...rest] = hash.replace(/^#/, "").split(":");
  const id = decodeURIComponent(rest.join(":"));
  if (level && levels.includes(level as Level) && level !== "system" && id)
    return { level: level as Level, id };
  return { level: "system" };
}

export function hashFromPlace(place: PlaceRef): string {
  return place.level === "system" || !place.id
    ? ""
    : `#${place.level}:${encodeURIComponent(place.id)}`;
}

function query(place: PlaceRef): string {
  const params = new URLSearchParams({ level: place.level });
  if (place.id) params.set("id", place.id);
  return params.toString();
}

export function App() {
  const [place, setPlace] = useState<PlaceRef>(() => placeFromHash(window.location.hash));
  const [screen, setScreen] = useState<MapScreen | null>(null);

  useEffect(() => {
    const follow = () => setPlace(placeFromHash(window.location.hash));
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);

  useEffect(() => {
    let current = true;
    fetch(`/api/map?${query(place)}`)
      .then((response) => (response.ok ? (response.json() as Promise<MapScreen>) : null))
      .then((next) => {
        if (current && next) setScreen(next);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [place]);

  const navigate = (next: PlaceRef) => {
    const hash = hashFromPlace(next);
    if (hash) window.location.hash = hash;
    else window.history.pushState(null, "", window.location.pathname);
    setPlace(next);
  };

  if (!screen) return null;
  return (
    <MotionProvider reduce={false}>
      <MapScreenView screen={screen} onNavigate={navigate} />
    </MotionProvider>
  );
}
