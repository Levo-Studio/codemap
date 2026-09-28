// SPDX-License-Identifier: Apache-2.0

import { animate } from "motion/react";
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
import { type Camera, contentSize, fit, frame as frameArea, identity, zoomAt } from "../map/camera";
import { MapCanvas } from "../map/MapCanvas";
import type { MapNode, MapScreen, PaletteRow, PlaceRef } from "../model/view";
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
  // Where opening a node or a crumb goes; without it the screen is static.
  onNavigate?: (place: PlaceRef) => void;
  // Opens and closes the changes timeline.
  onChanges?: () => void;
  // Selects a node, or nothing.
  onSelect?: (id: string | undefined) => void;
  // Switches the explanations between Simple and Technical.
  onExplanation?: (value: "simple" | "technical") => void;
  // Asks a question about the place shown, and closes the answer.
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
  // A place, entered or at a new window size, starts fitted: 1:1 when it
  // fits, scaled down to fit when it does not. A static screen stays as the
  // design draws it.
  const fitted =
    onNavigate && mapSize.width > 0
      ? fit(contentSize(screen.map, cameraMetrics.margin), mapSize)
      : identity;
  // The camera belongs to one place at one window size, not to one map: the
  // live map of the same place arrives again with every change, and the user
  // keeps looking where they moved to. It is reset while rendering, so a new
  // place never shows a frame where the last one was moved.
  const placeKey = JSON.stringify(screen.topbar.trail?.at(-1) ?? screen.topbar.crumbs);
  const key = JSON.stringify([placeKey, mapSize.width, mapSize.height]);
  const [view, setView] = useState({ key, camera: fitted });
  const current = view.key === key;
  if (!current) setView({ key, camera: fitted });
  const camera = current ? view.camera : fitted;
  const setCamera = (next: Camera | ((c: Camera) => Camera)) =>
    setView((v) => ({ ...v, camera: typeof next === "function" ? next(v.camera) : next }));
  const centre = { x: mapSize.width / 2, y: mapSize.height / 2 };
  const zoom = {
    in: () => setCamera((c) => zoomAt(c, cameraMetrics.step, centre, cameraMetrics)),
    out: () => setCamera((c) => zoomAt(c, 1 / cameraMetrics.step, centre, cameraMetrics)),
    fit: () => setCamera(fitted),
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
  // Opening a node: the camera flies into it over the semantic zoom's time,
  // the rest dims and the map fades, then the place it leads to fades in.
  // Under reduced motion it simply opens.
  const reduced = useReducedMotion();
  const [opening, setOpening] = useState<{ id: string; progress: number }>();
  const [arrival, setArrival] = useState(1);
  const arriving = useRef(false);
  const open = (place: PlaceRef, node: MapNode) => {
    if (!onNavigate) return;
    if (reduced || opening) {
      onNavigate(place);
      return;
    }
    const from = camera;
    const centre = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
    const start = { x: from.x + centre.x * from.k, y: from.y + centre.y * from.k };
    const end = { x: mapSize.width / 2, y: mapSize.height / 2 };
    const k = Math.min(
      cameraMetrics.max,
      (mapSize.width * cameraMetrics.open.share) / node.width,
      (mapSize.height * cameraMetrics.open.share) / node.height,
    );
    animate(0, 1, {
      duration: duration.zoom,
      ease: [...ease],
      onUpdate: (t) => {
        // The zoom grows evenly and the node's centre travels to the middle.
        const scale = from.k * (k / from.k) ** t;
        const at = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
        setCamera({ k: scale, x: at.x - centre.x * scale, y: at.y - centre.y * scale });
        setOpening({ id: node.id, progress: t });
      },
      onComplete: () => {
        arriving.current = true;
        setOpening(undefined);
        onNavigate(place);
      },
    });
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new place is what fades in
  useEffect(() => {
    if (!arriving.current) return;
    arriving.current = false;
    setArrival(0);
    const fade = animate(0, 1, { duration: duration.base, ease: [...ease], onUpdate: setArrival });
    return () => fade.stop();
  }, [placeKey]);
  const fadeFrom = cameraMetrics.open.fadeFrom;
  const flight = opening ? Math.max(0, (opening.progress - fadeFrom) / (1 - fadeFrom)) : 0;
  const shownMap = opening
    ? {
        ...screen.map,
        nodes: screen.map.nodes.map((n) => (n.id === opening.id ? n : { ...n, dimmed: true })),
      }
    : screen.map;
  const chat = "kind" in screen.chat ? screen.chat : undefined;
  const answer = "kind" in screen.chat ? undefined : screen.chat;
  // The first-run card covers the map's controls. A lost server greys the
  // map and the project panel, not the controls floating over the map.
  const controls = screen.overlay?.kind !== "onboarding";
  const faded = (screen.offline ? offline.mapOpacity : 1) * arrival * (1 - flight);
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
            view={shownMap}
            width={mapSize.width}
            height={mapSize.height}
            camera={camera}
            onCamera={setCamera}
            {...(onNavigate ? { onOpen: open, place: placeKey } : {})}
            {...(onSelect ? { onSelect } : {})}
            {...(screen.offline
              ? { sceneStyle: { filter: offline.mapFilter, opacity: faded } }
              : faded < 1
                ? { sceneStyle: { opacity: faded } }
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
      {screen.overlay?.kind === "palette" && (
        <>
          <div
            style={{ position: "absolute", inset: 0, background: color.scrim }}
            {...(palette ? { onClick: palette.onClose } : {})}
          />
          <Palette view={screen.overlay.palette} {...(palette ?? {})} />
        </>
      )}
      {screen.overlay?.kind === "onboarding" && <OnboardingCard view={screen.overlay.onboarding} />}
    </ScreenFrame>
  );
}
