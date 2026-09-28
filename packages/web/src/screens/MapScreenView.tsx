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
import { camera as cameraMetrics, chatBar, frame, offline, topbar } from "../design/metrics";
import { duration, ease, useReducedMotion } from "../design/motion";
import { color, rule } from "../design/tokens";
import {
  between,
  type Camera,
  contentSize,
  fit,
  frame as frameArea,
  identity,
  zoomAt,
} from "../map/camera";
import { MapCanvas } from "../map/MapCanvas";
import type { MapScreen, PaletteRow } from "../model/view";
import { ChangesPanel } from "../panel/ChangesPanel";
import type { CodeState } from "../panel/CodeExcerpt";
import { DetailPanel } from "../panel/DetailPanel";
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
}: MapScreenViewProps) {
  const [mapRef, mapSize] = useSize();
  // The map starts fitted, and again at a new window size: 1:1 when it fits,
  // scaled down to fit when it does not. A static screen stays as the design
  // draws it.
  const fitted =
    onNavigate && mapSize.width > 0
      ? fit(contentSize(screen.map, cameraMetrics.margin), mapSize)
      : identity;
  // The camera belongs to the window size, not to one map: the live map
  // arrives again with every change and every node opened, and the user keeps
  // looking where they moved to. It is reset while rendering, so a new size
  // never shows a frame of the old one.
  const key = JSON.stringify([mapSize.width, mapSize.height]);
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
    const seen = latest.current;
    const fits =
      seen.x + target.x * seen.k >= 0 &&
      seen.y + target.y * seen.k >= 0 &&
      seen.x + (target.x + target.width) * seen.k <= mapSize.width &&
      seen.y + (target.y + target.height) * seen.k <= mapSize.height;
    if (focus.opened && fits) return;
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
          right: frame.panelWidth,
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
                <ChatBar view={chat} {...(onAsk ? { onAsk } : {})} />
              </div>
            )}
            {answer && (
              <div
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
              </div>
            )}
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
          width: frame.panelWidth,
          bottom: 0,
          background: color.panel,
          borderLeft: rule(color.line1),
          boxSizing: "border-box",
        }}
      >
        {screen.panel.kind === "changes" ? (
          <ChangesPanel view={screen.panel} {...(onChanges ? { onClose: onChanges } : {})} />
        ) : (
          <DetailPanel
            view={screen.panel}
            dim={faded}
            {...(onExplanation ? { onExplanation } : {})}
            {...(code ? { code } : {})}
          />
        )}
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
