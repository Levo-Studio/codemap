// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, useState } from "react";
import { MotionProvider } from "../design/motion";
import type { Explanation, MapScreen, PaletteRow } from "../model/view";
import { EmptyScreenView } from "../screens/EmptyScreenView";
import { LoadingScreenView } from "../screens/LoadingScreenView";
import { MapScreenView } from "../screens/MapScreenView";
import { type ShownChat, useAsk } from "./ask";
import { codeTarget, useCode } from "./code";
import { useFreshness } from "./live";
import { useMapScreen } from "./map";
import { toOffline } from "./offline";
import { usePalette } from "./palette";

// The app as the local server serves it: the map, the palette, the code in
// the panel and the chat, each kept by its own hook, wired together here.

export function App() {
  const [changesOpen, setChangesOpen] = useState(false);
  // Simple or Technical, for every panel, until switched again.
  const [explanation, setExplanation] = useState<Explanation>("simple");
  // The node the user selected, and the node the camera is to move to once
  // the map has it where it is going to be.
  const [select, setSelect] = useState<string | undefined>();
  const [focus, setFocus] = useState<{ id: string; opened: boolean; seq: number }>();
  const [chat, setChat] = useState<ShownChat | undefined>();
  const { freshness, connection } = useFreshness();
  const codeFor = useCode(freshness);
  const map = useMapScreen({ changesOpen, select, explanation, chat: chat?.id }, freshness);
  const { screen, open, setOpen } = map;
  const palette = usePalette(screen?.kind === "map");
  const ask = useAsk({ map, select, setSelect, explanation, chat, setChat });

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
  // it closes, so the map does not fill up. An opened one closes, with
  // everything opened inside it.
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
  // A row found opens what its node is in, and nothing else, and moves to it,
  // selected.
  const pick = (row: PaletteRow) => {
    palette.closePalette();
    if (!row.select) return;
    setOpen(row.reveal ?? []);
    setSelect(row.select);
    moveTo(row.select);
  };

  const mapView = (mapScreen: MapScreen) => {
    const withAsk = palette.over(ask.over(mapScreen));
    const shown = connection.offline
      ? toOffline(withAsk, connection.retryIn, connection.lastSeen)
      : withAsk;
    const code = codeFor(codeTarget(mapScreen, select));
    return (
      <MapScreenView
        screen={shown}
        onNavigate={navigate}
        live
        onOpen={toggle}
        opening={map.opening}
        {...(focus ? { focus } : {})}
        onChanges={() => setChangesOpen((wasOpen) => !wasOpen)}
        onSelect={(id) => {
          setSelect(id);
          ask.nodeSelected(id);
        }}
        onExplanation={setExplanation}
        {...(code ? { code } : {})}
        onAsk={ask.ask}
        onSearch={palette.openPalette}
        palette={{
          onQuery: palette.setSearching,
          onPick: pick,
          onAsk: (query) => {
            palette.closePalette();
            ask.ask(query);
          },
          onClose: palette.closePalette,
          ready: palette.ready,
        }}
        onCloseAnswer={ask.closeChat}
        onEmptyDoubleClick={ask.closeChat}
        answerIn={chat?.in ?? "map"}
        onAnswerBack={ask.answerBack}
        {...(ask.pastChats ? { pastChats: ask.pastChats } : {})}
        onChatFocus={ask.listChats}
        onChatBlur={ask.hideChats}
        onRetry={connection.retry}
      />
    );
  };

  // Before there is a map the server answers the first read or an empty
  // folder, whatever is asked for.
  const view: ReactNode =
    screen?.kind === "loading" ? (
      <LoadingScreenView screen={screen} />
    ) : screen?.kind === "empty" ? (
      <EmptyScreenView screen={screen} />
    ) : screen?.kind === "map" ? (
      mapView(screen)
    ) : null;
  return view && <MotionProvider reduce={false}>{view}</MotionProvider>;
}
