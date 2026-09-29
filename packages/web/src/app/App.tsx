// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import { live } from "../design/metrics";
import { MotionProvider } from "../design/motion";
import type { ChatSummary, CodeView, PaletteRow, PaletteView, Screen } from "../model/view";
import { EmptyScreenView } from "../screens/EmptyScreenView";
import { LoadingScreenView } from "../screens/LoadingScreenView";
import { MapScreenView } from "../screens/MapScreenView";
import { en } from "../strings/en";
import { useLive } from "./live";
import { toOffline } from "./offline";

// The app as the local server serves it: one map of the whole project, with
// the nodes the user opened showing what is inside them in place. What is
// open lives in the address's fragment, so a reload keeps it.

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

function query(
  open: readonly string[],
  changes: boolean,
  select?: string,
  explanation: "simple" | "technical" = "simple",
  chat?: string,
): string {
  const params = new URLSearchParams();
  for (const id of open) params.append("open", id);
  if (changes) params.set("panel", "changes");
  if (select) params.set("select", select);
  if (explanation === "technical") params.set("explain", "technical");
  if (chat) params.set("chat", chat);
  return params.toString();
}

const nothingFound = (query: string): PaletteView => ({
  query,
  functions: [],
  modulesAndFiles: [],
  ask: [],
});

export function App() {
  const [open, setOpen] = useState<string[]>(() => openFromHash(window.location.hash));
  const [changesOpen, setChangesOpen] = useState(false);
  // A question on its way, or what went wrong with it, and the map (by what
  // is open on it) whose answer is shown.
  const [asking, setAsking] = useState<
    { map: string; question: string; failed?: string } | undefined
  >();
  // The chat shown, and where: over the map, or in the panel once the user
  // went on to the map. It is kept with the server, to open again later.
  const [chat, setChat] = useState<{ id: string; in: "map" | "panel" } | undefined>();
  // The past chats, listed in the panel while the chat bar's field is taken;
  // without chats while they are on their way.
  const [past, setPast] = useState<{ chats?: ChatSummary[] } | undefined>();
  // The latest question, and the map shown now: an answer to an older
  // question, or one that arrives after the user closed it or opened or
  // closed a node, is dropped.
  const latest = useRef(0);
  const here = useRef("");
  // The command palette while it is open: what is typed, and what it found.
  const [searching, setSearching] = useState<string | undefined>();
  const [found, setFound] = useState<PaletteView | undefined>();
  const onMap = useRef(false);
  // The code shown in the panel: which function or file was opened, and the
  // lines last read for it.
  const [codeFor, setCodeFor] = useState<string | undefined>();
  const [code, setCode] = useState<{ target: string; view: CodeView } | undefined>();
  // Simple or Technical, for every panel, until switched again.
  const [explanation, setExplanation] = useState<"simple" | "technical">("simple");
  // The node the user selected, and the node the camera is to move to once
  // the map has it where it is going to be.
  const [select, setSelect] = useState<string | undefined>();
  const [focus, setFocus] = useState<{ id: string; opened: boolean; seq: number }>();
  const openKey = JSON.stringify([...open].sort());
  here.current = openKey;
  const [screen, setScreen] = useState<Screen | null>(null);
  // What is open, and the chat, on the map last fetched: while the map for
  // another is on its way, a bar across the top shows it is coming.
  const wanted = JSON.stringify([openKey, chat?.id]);
  const [arrived, setArrived] = useState(wanted);
  // Goes up with every new version of the project and every refresh, and
  // makes the map be fetched again.
  const [freshness, setFreshness] = useState(0);
  const connection = useLive(() => setFreshness((n) => n + 1));

  // ⌘K or Ctrl+K opens the palette, as the topbar's search field shows.
  useEffect(() => {
    // ⌘ on a Mac, where Ctrl+K deletes to the end of a line; Ctrl elsewhere.
    // The platform, deprecated as it is, names the system the keys come from;
    // the user agent names whatever the browser chooses to show.
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

  // The code is read again with every new version, so it shows what the agent
  // has just written; code that cannot be read any more closes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: freshness only asks for a new fetch
  useEffect(() => {
    if (codeFor === undefined) return;
    const target = codeFor;
    let current = true;
    fetch(`/api/code?${target}`)
      .then((response) => (response.ok ? (response.json() as Promise<CodeView>) : undefined))
      .then((view) => {
        if (!current) return;
        if (view) setCode({ target, view });
        else setCodeFor(undefined);
      })
      .catch(() => {
        if (current) setCodeFor(undefined);
      });
    return () => {
      current = false;
    };
  }, [codeFor, freshness]);

  useEffect(() => {
    const follow = () => setOpen(openFromHash(window.location.hash));
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
    // The address names what is open, and nothing it could not be read as.
    const hash = hashFromOpen(open);
    if (window.location.hash !== hash)
      window.history.replaceState(null, "", `${window.location.pathname}${hash}`);
    let current = true;
    const arriving = wanted;
    fetch(`/api/map?${query(open, changesOpen, select, explanation, chat?.id)}`)
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
  }, [open, changesOpen, select, explanation, chat?.id, freshness]);

  const moveTo = (id: string, opened = false) =>
    setFocus((was) => ({ id, opened, seq: (was?.seq ?? 0) + 1 }));
  // A crumb selects the area, module or file it names; the first, the system,
  // selects nothing.
  const navigate = (id: string | undefined) => {
    setSelect(id);
    if (id) moveTo(id);
  };
  // A node opens in place, selected, and the camera moves to it if it does
  // not fit where the map is shown; whatever else was open and does not hold
  // it closes, as the owner asked, so the map does not fill up. An opened
  // one closes, with everything opened inside it.
  const toggle = (id: string) => {
    setSelect(id);
    const parents = new Map(
      screen?.kind === "map"
        ? [...screen.map.nodes, ...(screen.map.opened ?? [])].map((n) => [n.id, n.parent])
        : [],
    );
    if (!open.includes(id)) {
      // Only the way to it stays open, so the map holds one opened path.
      const around: string[] = [];
      for (let at = parents.get(id); at; at = parents.get(at)) around.unshift(at);
      setOpen([...around, id]);
      moveTo(id, true);
      return;
    }
    const within = (at: string | undefined): boolean =>
      at === id || (at !== undefined && within(parents.get(at)));
    setOpen(open.filter((o) => !within(o)));
  };

  // The palette opens on the map only, not over the first read or an empty
  // folder.
  onMap.current = screen?.kind === "map";
  // What the panel's code is: the selected function or file.
  // Read from the selection, not the panel: the panel of the node selected
  // before is still shown until the new one arrives.
  const codeTarget = (() => {
    if (screen?.kind !== "map" || !select) return undefined;
    const kind = screen.panel.kind;
    if (select.includes("#")) {
      const at = select.lastIndexOf("#");
      return new URLSearchParams({
        file: select.slice(0, at),
        symbol: select.slice(at + 1),
      }).toString();
    }
    return kind === "file" ? new URLSearchParams({ file: select }).toString() : undefined;
  })();
  const codeOpen = !!codeTarget && codeFor === codeTarget;
  if (!screen) return null;
  // Before there is a map the server answers the first read (S1) or an empty
  // folder (S10) whatever is asked for.
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
  const waiting = asking?.map === openKey ? asking : undefined;
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
  // A row found opens what its node is in, and nothing else, and moves to it,
  // selected.
  const pick = (row: PaletteRow) => {
    closePalette();
    if (!row.select) return;
    setOpen(row.reveal ?? []);
    setSelect(row.select);
    moveTo(row.select);
  };
  // Closed, a chat stays with the server among the past ones.
  const closeChat = () => {
    latest.current++;
    setChat(undefined);
    setAsking(undefined);
  };
  // A past chat opens as it was asked: the nodes open then, its answer over
  // the map, its steps numbered on it. A question still on its way is
  // dropped, as when a chat is closed: its answer would replace this one.
  const reopen = (picked: ChatSummary) => {
    latest.current++;
    setPast(undefined);
    setOpen(picked.open);
    setSelect(undefined);
    setAsking(undefined);
    setChat({ id: picked.id, in: "map" });
  };
  const ask = (question: string) => {
    const at = openKey;
    const asked = ++latest.current;
    const current = () => asked === latest.current && here.current === at;
    setAsking({ map: at, question });
    // The field the question was typed in goes, and the past chats with it:
    // a field that goes while it has the focus is never left.
    setPast(undefined);
    // A question asked from the panel is answered over the map again.
    if (chat?.in === "panel") setChat({ ...chat, in: "map" });
    fetch(`/api/ask?${query(open, false, select, explanation)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    })
      .then(async (response) => {
        if (!current()) return;
        if (response.ok) {
          const next = (await response.json()) as Screen;
          setScreen(next);
          const id = next.kind === "map" && !("kind" in next.chat) ? next.chat.chat : undefined;
          setChat(id ? { id, in: "map" } : undefined);
          // The answer came with its map: nothing more is on its way.
          setArrived(JSON.stringify([at, id]));
          setAsking(undefined);
          return;
        }
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        if (!current()) return;
        setAsking({
          map: at,
          question,
          failed: response.status === 409 ? en.chat.noProvider : en.chat.failed(body.message ?? ""),
        });
      })
      .catch(() => {
        if (current()) setAsking({ map: at, question, failed: en.chat.failed("") });
      });
  };
  return (
    <MotionProvider reduce={false}>
      <MapScreenView
        screen={shown}
        onNavigate={navigate}
        onOpen={toggle}
        opening={arrived !== wanted}
        {...(focus ? { focus } : {})}
        onChanges={() => setChangesOpen((shown) => !shown)}
        onSelect={(id) => {
          setSelect(id);
          // Going on to a node the answer shows moves the answer into the panel;
          // a question still on its way stays over the map, where its answer
          // will be.
          if (id && chat?.in === "map" && !asking) setChat({ ...chat, in: "panel" });
        }}
        onExplanation={setExplanation}
        {...(codeTarget
          ? {
              code: {
                open: codeOpen,
                ...(codeOpen && code?.target === codeTarget ? { view: code.view } : {}),
                onToggle: () => setCodeFor(codeOpen ? undefined : codeTarget),
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
        onCloseAnswer={closeChat}
        onEmptyDoubleClick={closeChat}
        answerIn={chat?.in ?? "map"}
        onAnswerBack={() => chat && setChat({ ...chat, in: "map" })}
        {...(past ? { pastChats: { ...past, onPick: reopen } } : {})}
        onChatFocus={() => {
          // Back from the list with Escape, the list is kept as it is.
          if (past) return;
          setPast({});
          // A list that cannot be read is not shown, rather than shown empty.
          const unlisted = () => setPast(undefined);
          fetch("/api/chats")
            .then((response) => {
              if (!response.ok) return unlisted();
              return (response.json() as Promise<ChatSummary[]>).then((chats) =>
                setPast((listing) => (listing ? { chats } : listing)),
              );
            })
            .catch(unlisted);
        }}
        onChatBlur={() => setPast(undefined)}
        onRetry={connection.retry}
      />
    </MotionProvider>
  );
}
