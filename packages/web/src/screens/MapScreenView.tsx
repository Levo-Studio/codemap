// SPDX-License-Identifier: Apache-2.0

import { AnimatePresence, motion } from "motion/react";
import { type FocusEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AskPanel } from "../components/AskPanel";
import { ChatBar } from "../components/ChatBar";
import { Legend } from "../components/Legend";
import { OfflineBanner } from "../components/OfflineBanner";
import { OnboardingCard } from "../components/OnboardingCard";
import { Palette } from "../components/Palette";
import { ZoomControl } from "../components/ZoomControl";
import { chatBar, chatPanel, frame, offline, topbar } from "../design/metrics";
import { duration, ease } from "../design/motion";
import { color, rule } from "../design/tokens";
import { MapCanvas } from "../map/MapCanvas";
import { OpeningBar } from "../map/OpeningBar";
import { type Focus, useCamera } from "../map/useCamera";
import type { ChatSummary, MapScreen, PaletteRow } from "../model/view";
import { ChangesPanel } from "../panel/ChangesPanel";
import { ChatHistory } from "../panel/ChatHistory";
import { ChatSide } from "../panel/ChatSide";
import type { CodeState } from "../panel/CodeExcerpt";
import { DetailPanel } from "../panel/DetailPanel";
import { PanelResizer, widestPanel } from "../panel/PanelResizer";
import { ScreenFrame } from "./ScreenFrame";

// The map fills what the panel leaves; the WebGL layer needs its size in
// pixels, so it is measured.
function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

// The legend and the zoom control sit in the map's lower corners, the chat
// bar and an answer over the map in the chat bar's place.
const lowerLeft = {
  position: "absolute",
  left: frame.overlayInset,
  bottom: frame.overlayInset,
} as const;
const lowerRight = {
  position: "absolute",
  right: frame.overlayInset,
  bottom: frame.overlayInset,
} as const;
const chatBarPlace = {
  position: "absolute",
  left: chatBar.left,
  bottom: chatBar.bottom,
  width: chatBar.width,
} as const;

interface MapScreenViewProps {
  screen: MapScreen;
  // Selects what a crumb names; without it the screen is static.
  onNavigate?: (id: string | undefined) => void;
  // Opens a node in place, or closes an opened one.
  onOpen?: (id: string) => void;
  focus?: Focus | undefined;
  // Opens and closes the changes timeline.
  onChanges?: () => void;
  // Selects a node, or nothing.
  onSelect?: (id: string | undefined) => void;
  // Switches the explanations between Simple and Technical.
  onExplanation?: (value: "simple" | "technical") => void;
  // Asks a question about the map shown, and closes the answer.
  onAsk?: (question: string) => void;
  onCloseAnswer?: () => void;
  // The code of the function or file the panel shows, on request.
  code?: CodeState | undefined;
  // Opens the command palette, and what it does while it is open.
  onSearch?: () => void;
  palette?: {
    onQuery: (query: string) => void;
    onPick: (row: PaletteRow) => void;
    onAsk: (query: string) => void;
    onClose: () => void;
    ready: boolean;
  };
  // Tries to reach the server again at once.
  onRetry?: () => void;
  // Where an answer is shown: over the map, or in the panel once the user
  // went on to the map; and what brings it back over the map.
  answerIn?: "map" | "panel";
  onAnswerBack?: () => void;
  // The past chats, listed in the panel while the chat bar's field has the
  // focus; chats is undefined while they load.
  pastChats?: { chats?: ChatSummary[]; onPick: (chat: ChatSummary) => void } | undefined;
  onChatFocus?: () => void;
  onChatBlur?: () => void;
  // Called on a double click on the empty map; the app closes the chat.
  onEmptyDoubleClick?: () => void;
  // The map for what was just opened or closed is on its way.
  opening?: boolean;
  // The map is the app's, not a static screen: it fits its viewport, the
  // camera and the panel move, and the zoom buttons work.
  live?: boolean;
}

// The palette fades in and out with its scrim over duration.base; a
// palette already open when the screen first renders shows at once.
function PaletteOverlay({
  overlay,
  palette,
}: {
  overlay: MapScreen["overlay"];
  palette: MapScreenViewProps["palette"];
}) {
  return (
    <AnimatePresence initial={false}>
      {overlay?.kind === "palette" && (
        <motion.div
          key="palette"
          data-palette
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration.base, ease }}
          style={{ position: "absolute", inset: 0 }}
        >
          <div
            style={{ position: "absolute", inset: 0, background: color.scrim }}
            {...(palette ? { onClick: palette.onClose } : {})}
          />
          <Palette view={overlay.palette} {...(palette ?? {})} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function MapScreenView({
  screen,
  onNavigate,
  onOpen,
  focus,
  onChanges,
  onSelect,
  onExplanation,
  onAsk,
  onCloseAnswer,
  onSearch,
  palette,
  code,
  onRetry,
  answerIn = "map",
  onAnswerBack,
  pastChats,
  onChatFocus,
  onChatBlur,
  onEmptyDoubleClick,
  opening = false,
  live = false,
}: MapScreenViewProps) {
  const [mapRef, mapSize] = useSize();
  // A static screen keeps the panel's drawn width.
  const [dragged, setDragged] = useState<number>(frame.panelWidth);
  const widest = widestPanel();
  const panelWidth = live ? Math.min(dragged, widest) : frame.panelWidth;
  const bar = useRef<HTMLDivElement>(null);
  // An answer brought back from the panel by its follow-up bar comes with
  // the follow-up field focused, because the bar is drawn as that field.
  const [cameBack, setCameBack] = useState(false);
  const history = useRef<HTMLDivElement>(null);
  const downToList = useRef(false);
  // The past chats stay while the focus is in the chat bar or in them, and go
  // once it is anywhere else.
  const leaveChat = (event: FocusEvent) => {
    const to = event.relatedTarget as Node | null;
    if (bar.current?.contains(to) || history.current?.contains(to)) return;
    onChatBlur?.();
  };
  const { camera, move, zoom, zoomToSteps } = useCamera(screen.map, mapSize, focus, live);
  const chat = "kind" in screen.chat ? screen.chat : undefined;
  const answer = "kind" in screen.chat ? undefined : screen.chat;
  // What the panel shows: an answer moved into it, the past chats while the
  // chat bar's field has the focus, or the panel of what is selected.
  const inPanel = answer && answerIn === "panel" ? answer : undefined;
  // cameBack resets once the answer goes into the panel again or closes, so
  // a later answer does not take the focus.
  const overMap = answer !== undefined && inPanel === undefined;
  useEffect(() => {
    if (!overMap) setCameBack(false);
  }, [overMap]);
  const shows = inPanel ? "answer" : pastChats ? "past" : "panel";
  const slide = { duration: duration.base, ease };
  // The first-run card covers the map's controls. A lost server greys the
  // map and the project panel, not the controls floating over the map.
  const controls = screen.overlay?.kind !== "onboarding";
  const faded = screen.offline ? offline.mapOpacity : 1;
  return (
    <ScreenFrame
      bar={screen.topbar}
      onNavigate={onNavigate}
      onChanges={onChanges}
      onSearch={onSearch}
    >
      <div
        ref={mapRef}
        style={{
          position: "absolute",
          left: 0,
          top: topbar.height,
          right: panelWidth,
          bottom: 0,
        }}
      >
        {mapSize.width > 0 && (
          <MapCanvas
            view={screen.map}
            width={mapSize.width}
            height={mapSize.height}
            camera={camera}
            onCamera={move}
            {...(onOpen ? { onOpen, live: true } : {})}
            onSelect={onSelect}
            onEmptyDoubleClick={onEmptyDoubleClick}
            {...(screen.offline
              ? { sceneStyle: { filter: offline.mapFilter, opacity: faded } }
              : {})}
          >
            {controls && (
              <>
                <div style={lowerLeft}>
                  <Legend />
                </div>
                <div style={lowerRight}>
                  <ZoomControl level={screen.map.level} onZoom={live ? zoom : undefined} />
                </div>
              </>
            )}
            {chat && (
              // biome-ignore lint/a11y/noStaticElementInteractions: the keys belong to the field inside
              <div
                ref={bar}
                onBlur={leaveChat}
                onFocus={() => {
                  downToList.current = false;
                }}
                onKeyDown={(event) => {
                  // ArrowDown in the field moves into the past chats: at once,
                  // or as soon as they arrive while they are still loading.
                  if (event.key !== "ArrowDown" || !pastChats) return;
                  event.preventDefault();
                  const first = history.current?.querySelector("button");
                  if (first) first.focus();
                  else downToList.current = true;
                }}
                style={chatBarPlace}
              >
                <ChatBar view={chat} onAsk={onAsk} onFocus={onChatFocus} />
              </div>
            )}
            {/* An answer moved into the panel slides out towards it, and in
                again when it comes back over the map. */}
            <AnimatePresence initial={false}>
              {answer && !inPanel && (
                <motion.div
                  key="answer"
                  initial={{ opacity: 0, x: chatPanel.slide }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: chatPanel.slide }}
                  transition={slide}
                  style={chatBarPlace}
                >
                  <AskPanel
                    view={answer}
                    onAsk={onAsk}
                    onClose={onCloseAnswer}
                    onZoomToSteps={live ? zoomToSteps : undefined}
                    focusFollowUp={cameBack}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            {screen.offline && <OfflineBanner retryIn={screen.offline.retryIn} onRetry={onRetry} />}
          </MapCanvas>
        )}
        {opening && <OpeningBar />}
      </div>
      <aside
        style={{
          position: "absolute",
          right: 0,
          top: topbar.height,
          width: panelWidth,
          bottom: 0,
          background: color.panel,
          borderLeft: rule(color.line1),
          boxSizing: "border-box",
          overflowY: "auto",
        }}
      >
        {live && <PanelResizer width={panelWidth} widest={widest} onResize={setDragged} />}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={shows}
            initial={{ opacity: 0, x: -chatPanel.slide }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -chatPanel.slide }}
            transition={slide}
            style={{ height: "100%" }}
          >
            {inPanel ? (
              <ChatSide
                view={inPanel}
                onBack={() => {
                  setCameBack(true);
                  onAnswerBack?.();
                }}
                onAsk={onAsk}
                onZoomToSteps={live ? zoomToSteps : undefined}
              />
            ) : pastChats ? (
              <ChatHistory
                ref={history}
                chats={pastChats.chats}
                onPick={pastChats.onPick}
                onBlur={leaveChat}
                onEscape={() => bar.current?.querySelector("input")?.focus()}
                onRows={(first) => {
                  if (!downToList.current) return;
                  downToList.current = false;
                  first.focus();
                }}
              />
            ) : screen.panel.kind === "changes" ? (
              <ChangesPanel view={screen.panel} onClose={onChanges} />
            ) : (
              <DetailPanel
                view={screen.panel}
                dim={faded}
                onExplanation={onExplanation}
                code={code}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </aside>
      <PaletteOverlay overlay={screen.overlay} palette={palette} />
      {screen.overlay?.kind === "onboarding" && <OnboardingCard view={screen.overlay.onboarding} />}
    </ScreenFrame>
  );
}
