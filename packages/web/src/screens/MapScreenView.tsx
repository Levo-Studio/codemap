// SPDX-License-Identifier: Apache-2.0

import { AnimatePresence, animate, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AskPanel } from "../components/AskPanel";
import { ChatBar } from "../components/ChatBar";
import { Legend } from "../components/Legend";
import { OfflineBanner } from "../components/OfflineBanner";
import { OnboardingCard } from "../components/OnboardingCard";
import { Palette } from "../components/Palette";
import { ZoomControl } from "../components/ZoomControl";
import {
  camera as cameraMetrics,
  chatBar,
  chatPanel,
  frame,
  offline,
  topbar,
} from "../design/metrics";
import { duration, ease, useReducedMotion } from "../design/motion";
import { color, rule } from "../design/tokens";
import {
  between,
  type Camera,
  contentSize,
  fit,
  frame as frameArea,
  identity,
  inView,
  zoomAt,
} from "../map/camera";
import { MapCanvas } from "../map/MapCanvas";
import type { ChatSummary, MapScreen, PaletteRow } from "../model/view";
import { ChangesPanel } from "../panel/ChangesPanel";
import { ChatHistory } from "../panel/ChatHistory";
import { ChatSide } from "../panel/ChatSide";
import type { CodeState } from "../panel/CodeExcerpt";
import { DetailPanel } from "../panel/DetailPanel";
import { en } from "../strings/en";
import { ScreenFrame } from "./ScreenFrame";

const windowWidth = () => window.innerWidth;

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

interface MapScreenViewProps {
  screen: MapScreen;
  // Selects what a crumb names; without it the screen is static.
  onNavigate?: (id: string | undefined) => void;
  // Opens a node in place, or closes an opened one.
  onOpen?: (id: string) => void;
  // The node the camera moves to, once the map has it (opened, when it was
  // just opened); a new sequence number asks again.
  focus?: { id: string; opened: boolean; seq: number };
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
  code?: CodeState;
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
  // The past chats, listed in the panel while the chat bar's field is taken.
  pastChats?: { chats: ChatSummary[]; onPick: (chat: ChatSummary) => void };
  onChatFocus?: () => void;
  onChatBlur?: () => void;
  // A double click on the empty map closes the chat.
  onEmptyDoubleClick?: () => void;
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
}: MapScreenViewProps) {
  const [mapRef, mapSize] = useSize();
  // The panel is dragged wider by its left edge, from its drawn width up to a
  // share of the window (the owner's; not in the export). A static screen
  // keeps the drawn width.
  const [dragged, setDragged] = useState<number>(frame.panelWidth);
  const widest = Math.max(frame.panelWidth, windowWidth() * frame.panelMaxShare);
  const panelWidth = onNavigate ? Math.min(dragged, widest) : frame.panelWidth;
  const resizing = useRef(false);
  // The map starts fitted, and again at a new window size: 1:1 when it fits,
  // scaled down to fit when it does not. A static screen stays as the design
  // draws it.
  const fitted =
    onNavigate && mapSize.width > 0
      ? fit(contentSize(screen.map, cameraMetrics.margin), mapSize)
      : identity;
  // The camera belongs to the window size, not to one map: the live map
  // arrives again with every change and every node opened, and the user keeps
  // looking where they moved to; a panel dragged wider leaves it too. It is
  // reset while rendering, once the map is measured and at a new window size,
  // so a new size never shows a frame of the old one.
  const key = JSON.stringify(
    mapSize.width > 0 ? [windowWidth(), window.innerHeight] : "unmeasured",
  );
  const [view, setView] = useState({ key, camera: fitted });
  const current = view.key === key;
  if (!current) setView({ key, camera: fitted });
  const camera = current ? view.camera : fitted;
  const setCamera = (next: Camera | ((c: Camera) => Camera)) =>
    setView((v) => ({ ...v, camera: typeof next === "function" ? next(v.camera) : next }));
  const centre = { x: mapSize.width / 2, y: mapSize.height / 2 };
  // The user moving the camera ends a flight: it would take the camera back
  // on its next frame.
  const move = (next: Camera | ((c: Camera) => Camera)) => {
    flight.current?.stop();
    setCamera(next);
  };
  const zoom = {
    in: () => move((c) => zoomAt(c, cameraMetrics.step, centre, cameraMetrics)),
    out: () => move((c) => zoomAt(c, 1 / cameraMetrics.step, centre, cameraMetrics)),
    fit: () => move(fitted),
  };
  // Frames the nodes the answer numbers.
  const zoomToSteps = () => {
    const steps = screen.map.nodes.filter((n) => n.step !== undefined);
    if (steps.length === 0) return;
    const left = Math.min(...steps.map((n) => n.x));
    const top = Math.min(...steps.map((n) => n.y));
    const right = Math.max(...steps.map((n) => n.x + n.width));
    const bottom = Math.max(...steps.map((n) => n.y + n.height));
    setCamera(
      frameArea(
        { x: left, y: top, width: right - left, height: bottom - top },
        mapSize,
        cameraMetrics.margin,
      ),
    );
  };
  // The camera flies to the node asked for over the semantic zoom's time,
  // once the map has it where it is going to be: a node just opened, once it
  // is drawn open, and only when it does not already fit where the map is
  // shown. Under reduced motion it is simply there.
  const reduced = useReducedMotion();
  const moved = useRef(0);
  const flight = useRef<{ stop: () => void }>(undefined);
  const latest = useRef(camera);
  latest.current = camera;
  useEffect(() => {
    if (!focus || !onNavigate || focus.seq === moved.current || mapSize.width === 0) return;
    const target = focus.opened
      ? screen.map.opened?.find((o) => o.id === focus.id)
      : (screen.map.nodes.find((n) => n.id === focus.id) ??
        screen.map.opened?.find((o) => o.id === focus.id));
    if (!target) return;
    moved.current = focus.seq;
    // A node that opens where the user can already see all of it leaves the
    // camera where it is: moving the view on every opened node disorients.
    if (focus.opened && inView(target, latest.current, mapSize, cameraMetrics.margin)) return;
    const to = frameArea(target, mapSize, cameraMetrics.margin);
    flight.current?.stop();
    if (reduced) {
      setCamera(to);
      return;
    }
    const from = latest.current;
    flight.current = animate(0, 1, {
      duration: duration.zoom,
      ease: [...ease],
      onUpdate: (t) => setCamera(between(from, to, t, mapSize)),
    });
  });
  useEffect(() => () => flight.current?.stop(), []);
  const chat = "kind" in screen.chat ? screen.chat : undefined;
  const answer = "kind" in screen.chat ? undefined : screen.chat;
  // What the panel shows: an answer moved into it, the past chats while the
  // chat bar's field is taken, or the panel of what is selected.
  const inPanel = answer && answerIn === "panel" ? answer : undefined;
  const shows = inPanel ? "answer" : pastChats ? "past" : "panel";
  const slide = { duration: duration.base, ease };
  // The first-run card covers the map's controls. A lost server greys the
  // map and the project panel, not the controls floating over the map.
  const controls = screen.overlay?.kind !== "onboarding";
  const faded = screen.offline ? offline.mapOpacity : 1;
  return (
    <ScreenFrame
      bar={screen.topbar}
      {...(onNavigate ? { onNavigate } : {})}
      {...(onChanges ? { onChanges } : {})}
      {...(onSearch ? { onSearch } : {})}
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
            {...(onSelect ? { onSelect } : {})}
            {...(onEmptyDoubleClick ? { onEmptyDoubleClick } : {})}
            {...(screen.offline
              ? { sceneStyle: { filter: offline.mapFilter, opacity: faded } }
              : {})}
          >
            {controls && (
              <>
                <div
                  style={{
                    position: "absolute",
                    left: frame.overlayInset,
                    bottom: frame.overlayInset,
                  }}
                >
                  <Legend />
                </div>
                <div
                  style={{
                    position: "absolute",
                    right: frame.overlayInset,
                    bottom: frame.overlayInset,
                  }}
                >
                  <ZoomControl level={screen.map.level} {...(onNavigate ? { onZoom: zoom } : {})} />
                </div>
              </>
            )}
            {chat && (
              <div
                style={{
                  position: "absolute",
                  left: chatBar.left,
                  bottom: chatBar.bottom,
                  width: chatBar.width,
                }}
              >
                <ChatBar
                  view={chat}
                  {...(onAsk ? { onAsk } : {})}
                  {...(onChatFocus ? { onFocus: onChatFocus } : {})}
                  {...(onChatBlur ? { onBlur: onChatBlur } : {})}
                />
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
                  style={{
                    position: "absolute",
                    left: chatBar.left,
                    bottom: chatBar.bottom,
                    width: chatBar.width,
                  }}
                >
                  <AskPanel
                    view={answer}
                    {...(onAsk ? { onAsk } : {})}
                    {...(onCloseAnswer ? { onClose: onCloseAnswer } : {})}
                    {...(onNavigate ? { onZoomToSteps: zoomToSteps } : {})}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            {screen.offline && (
              <OfflineBanner retryIn={screen.offline.retryIn} {...(onRetry ? { onRetry } : {})} />
            )}
          </MapCanvas>
        )}
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
        {onNavigate && (
          // A splitter the pointer drags and the arrow keys move; no HTML
          // element is one, and <hr> takes no input.
          // biome-ignore lint/a11y/useSemanticElements: see above
          <div
            role="separator"
            tabIndex={0}
            onKeyDown={(event) => {
              const step = event.key === "ArrowLeft" ? 1 : event.key === "ArrowRight" ? -1 : 0;
              if (step === 0) return;
              event.preventDefault();
              setDragged(
                Math.min(
                  widest,
                  Math.max(frame.panelWidth, panelWidth + step * frame.overlayInset),
                ),
              );
            }}
            aria-orientation="vertical"
            aria-label={en.chat.resizePanel}
            aria-valuemin={frame.panelWidth}
            aria-valuemax={Math.round(widest)}
            aria-valuenow={Math.round(panelWidth)}
            onPointerDown={(event) => {
              resizing.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!resizing.current) return;
              setDragged(
                Math.min(widest, Math.max(frame.panelWidth, windowWidth() - event.clientX)),
              );
            }}
            onPointerUp={() => {
              resizing.current = false;
            }}
            onPointerCancel={() => {
              resizing.current = false;
            }}
            style={{
              position: "fixed",
              top: topbar.height,
              bottom: 0,
              right: panelWidth - frame.resizeStrip / 2,
              width: frame.resizeStrip,
              cursor: "col-resize",
              zIndex: 1,
            }}
          />
        )}
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
                onBack={() => onAnswerBack?.()}
                {...(onAsk ? { onAsk } : {})}
                {...(onNavigate ? { onZoomToSteps: zoomToSteps } : {})}
              />
            ) : pastChats ? (
              <ChatHistory chats={pastChats.chats} onPick={pastChats.onPick} />
            ) : screen.panel.kind === "changes" ? (
              <ChangesPanel view={screen.panel} {...(onChanges ? { onClose: onChanges } : {})} />
            ) : (
              <DetailPanel
                view={screen.panel}
                dim={faded}
                {...(onExplanation ? { onExplanation } : {})}
                {...(code ? { code } : {})}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </aside>
      {/* The palette fades in and out over motion.base with its scrim; one
          that is there when the screen is drawn simply is. */}
      <AnimatePresence initial={false}>
        {screen.overlay?.kind === "palette" && (
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
            <Palette view={screen.overlay.palette} {...(palette ?? {})} />
          </motion.div>
        )}
      </AnimatePresence>
      {screen.overlay?.kind === "onboarding" && <OnboardingCard view={screen.overlay.onboarding} />}
    </ScreenFrame>
  );
}
