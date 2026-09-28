// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import { live } from "../design/metrics";
import { MotionProvider } from "../design/motion";
import type { CodeView, Level, PaletteRow, PaletteView, PlaceRef, Screen } from "../model/view";
import { EmptyScreenView } from "../screens/EmptyScreenView";
import { LoadingScreenView } from "../screens/LoadingScreenView";
import { MapScreenView } from "../screens/MapScreenView";
import { en } from "../strings/en";
import { useLive } from "./live";
import { toOffline } from "./offline";

// The app as the local server serves it: the map of the project, at the place
// the address names. The place lives in the address's fragment, so a reload
// and the browser's back button stay where they were.

const levels: Level[] = ["system", "area", "file", "function"];

// A fragment that names no place, broken escapes included, is the system.
export function placeFromHash(hash: string): PlaceRef {
  const [level, ...rest] = hash.replace(/^#/, "").split(":");
  let id: string;
  try {
    id = decodeURIComponent(rest.join(":"));
  } catch {
    return { level: "system" };
  }
  if (level && levels.includes(level as Level) && level !== "system" && id)
    return { level: level as Level, id };
  return { level: "system" };
}

export function hashFromPlace(place: PlaceRef): string {
  return place.level === "system" || !place.id
    ? ""
    : `#${place.level}:${encodeURIComponent(place.id)}`;
}

function query(
  place: PlaceRef,
  changes: boolean,
  select?: string,
  explanation: "simple" | "technical" = "simple",
  answer = false,
): string {
  const params = new URLSearchParams({ level: place.level });
  if (place.id) params.set("id", place.id);
  if (changes) params.set("panel", "changes");
  if (select) params.set("select", select);
  if (explanation === "technical") params.set("explain", "technical");
  if (answer) params.set("ask", "1");
  return params.toString();
}

export function App() {
  const [place, setPlace] = useState<PlaceRef>(() => placeFromHash(window.location.hash));
  const [changesOpen, setChangesOpen] = useState(false);
  // A question on its way, or what went wrong with it, and the place whose
  // answer is open on the map.
  const [asking, setAsking] = useState<
    { place: string; question: string; failed?: string } | undefined
  >();
  const [answered, setAnswered] = useState<string | undefined>();
  // The latest question, and the place shown now: an answer to an older
  // question, or one that arrives after the user closed it or went
  // elsewhere, is dropped.
  const latest = useRef(0);
  const here = useRef("");
  // The command palette while it is open: what is typed, and what it found.
  const [searching, setSearching] = useState<string | undefined>();
  const [found, setFound] = useState<PaletteView | undefined>();
  const onMap = useRef(false);
  // The code shown in the panel: which function or file it is, and its lines.
  const [code, setCode] = useState<{ target: string; view?: CodeView } | undefined>();
  // Simple or Technical, for every panel, until switched again.
  const [explanation, setExplanation] = useState<"simple" | "technical">("simple");
  // The node the user selected, in the place shown; a new place starts with
  // none.
  const [selected, setSelected] = useState<{ place: string; id: string } | undefined>();
  const placeKey = JSON.stringify(place);
  const select = selected?.place === placeKey ? selected.id : undefined;
  here.current = placeKey;
  const [screen, setScreen] = useState<Screen | null>(null);
  // Goes up with every new version of the project and every refresh, and
  // makes the map be fetched again.
  const [freshness, setFreshness] = useState(0);
  const connection = useLive(() => setFreshness((n) => n + 1));

  // ⌘K or Ctrl+K opens the palette, as the topbar's search field shows.
  useEffect(() => {
    // ⌘ on a Mac, where Ctrl+K deletes to the end of a line; Ctrl elsewhere.
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    const open = (event: KeyboardEvent) => {
      if ((mac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (!onMap.current) return;
        event.preventDefault();
        setSearching((query) => query ?? "");
      }
    };
    window.addEventListener("keydown", open);
    return () => window.removeEventListener("keydown", open);
  }, []);

  useEffect(() => {
    if (searching === undefined) return;
    let current = true;
    fetch(`/api/search?${new URLSearchParams({ q: searching })}`)
      .then((response) => (response.ok ? (response.json() as Promise<PaletteView>) : undefined))
      .then((view) => {
        if (current && view) setFound(view);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [searching]);

  useEffect(() => {
    const follow = () => setPlace(placeFromHash(window.location.hash));
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);

  useEffect(() => {
    const refresh = window.setInterval(
      () => setFreshness((n) => n + 1),
      live.refreshSeconds * live.second,
    );
    return () => window.clearInterval(refresh);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: freshness only asks for a new fetch
  useEffect(() => {
    // The address names the place shown, and nothing it could not be read as.
    const hash = hashFromPlace(place);
    if (window.location.hash !== hash)
      window.history.replaceState(null, "", `${window.location.pathname}${hash}`);
    let current = true;
    fetch(`/api/map?${query(place, changesOpen, select, explanation, answered === placeKey)}`)
      .then((response) => {
        // A place the project does not have (renamed, deleted, mistyped) falls
        // back to the system, in place of the address, so back does not return
        // to it.
        if (response.status === 404 && place.level !== "system") {
          if (current) {
            window.history.replaceState(null, "", window.location.pathname);
            setPlace({ level: "system" });
          }
          return null;
        }
        return response.ok ? (response.json() as Promise<Screen>) : null;
      })
      .then((next) => {
        if (current && next) setScreen(next);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [place, changesOpen, select, explanation, answered, freshness]);

  const navigate = (next: PlaceRef) => {
    const hash = hashFromPlace(next);
    if (hash) window.location.hash = hash;
    else window.history.pushState(null, "", window.location.pathname);
    setPlace(next);
  };

  // The palette opens on the map only, not over the first read or an empty
  // folder.
  onMap.current = screen?.kind === "map";
  // What the panel's code is: the selected function, or the file the panel
  // shows, selected or the place's own.
  const codeTarget = (() => {
    if (screen?.kind !== "map") return undefined;
    const kind = screen.panel.kind;
    const id = select?.replace(/^(in|out):/, "");
    if (kind === "function" && id?.includes("#")) {
      const at = id.lastIndexOf("#");
      return new URLSearchParams({ file: id.slice(0, at), symbol: id.slice(at + 1) }).toString();
    }
    if (kind === "file") {
      const file = place.level === "function" && !id ? place.id : id;
      return file ? new URLSearchParams({ file }).toString() : undefined;
    }
    return undefined;
  })();
  const codeOpen = !!codeTarget && code?.target === codeTarget;
  if (!screen) return null;
  // Before there is a map the server answers the first read (S1) or an empty
  // folder (S10) for every place.
  if (screen.kind === "loading")
    return (
      <MotionProvider reduce={false}>
        <LoadingScreenView screen={screen} />
      </MotionProvider>
    );
  if (screen.kind === "empty")
    return (
      <MotionProvider reduce={false}>
        <EmptyScreenView screen={screen} />
      </MotionProvider>
    );
  if (screen.kind !== "map") return null;
  // While a question is on its way, or when it failed, the answer panel says
  // so in place of an answer.
  const waiting = asking?.place === placeKey ? asking : undefined;
  const withQuestion: typeof screen = waiting
    ? {
        ...screen,
        chat: {
          editingFile:
            "kind" in screen.chat && screen.chat.kind === "editing" ? (screen.chat.file ?? "") : "",
          question: waiting.question,
          intro: waiting.failed ?? "",
          steps: [],
          explainStep: 0,
          ...(waiting.failed ? {} : { thinking: true }),
        },
      }
    : screen;
  // The last results stay on screen until those for what is typed arrive.
  const withPalette: typeof screen =
    searching === undefined
      ? withQuestion
      : {
          ...withQuestion,
          overlay: {
            kind: "palette",
            palette: {
              ...(found ?? { functions: [], modulesAndFiles: [], ask: [] }),
              query: searching,
            },
          },
        };
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
  const shown = connection.offline
    ? toOffline(withPalette, connection.retryIn, connection.lastSeen)
    : withPalette;
  const pick = (row: PaletteRow) => {
    closePalette();
    if (!row.opens) return;
    navigate(row.opens);
    if (row.select) setSelected({ place: JSON.stringify(row.opens), id: row.select });
  };
  const ask = (question: string) => {
    const at = placeKey;
    const asked = ++latest.current;
    const current = () => asked === latest.current && here.current === at;
    setAsking({ place: at, question });
    fetch(`/api/ask?${query(place, false, select, explanation)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    })
      .then(async (response) => {
        if (!current()) return;
        if (response.ok) {
          setScreen((await response.json()) as Screen);
          setAnswered(at);
          setAsking(undefined);
          return;
        }
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        if (!current()) return;
        setAsking({
          place: at,
          question,
          failed: response.status === 409 ? en.chat.noProvider : en.chat.failed(body.message ?? ""),
        });
      })
      .catch(() => {
        if (current()) setAsking({ place: at, question, failed: en.chat.failed("") });
      });
  };
  return (
    <MotionProvider reduce={false}>
      <MapScreenView
        screen={shown}
        onNavigate={navigate}
        onChanges={() => setChangesOpen((open) => !open)}
        onSelect={(id) => setSelected(id ? { place: placeKey, id } : undefined)}
        onExplanation={setExplanation}
        {...(codeTarget
          ? {
              code: {
                open: codeOpen,
                ...(codeOpen && code?.view ? { view: code.view } : {}),
                onToggle: () => {
                  if (codeOpen) {
                    setCode(undefined);
                    return;
                  }
                  const target = codeTarget;
                  setCode({ target });
                  fetch(`/api/code?${target}`)
                    .then((r) => (r.ok ? (r.json() as Promise<CodeView>) : undefined))
                    .then((view) =>
                      setCode((now) => (now?.target === target && view ? { target, view } : now)),
                    )
                    .catch(() => {});
                },
              },
            }
          : {})}
        onAsk={ask}
        onSearch={() => setSearching((query) => query ?? "")}
        palette={{
          onQuery: setSearching,
          onPick: pick,
          onAsk: (query) => {
            closePalette();
            ask(query);
          },
          onClose: closePalette,
          ready: found?.query === searching,
        }}
        onCloseAnswer={() => {
          latest.current++;
          setAnswered(undefined);
          setAsking(undefined);
        }}
        onRetry={connection.retry}
      />
    </MotionProvider>
  );
}
