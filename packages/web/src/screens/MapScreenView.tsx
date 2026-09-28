// SPDX-License-Identifier: Apache-2.0

import { useLayoutEffect, useRef, useState } from "react";
import { AskPanel } from "../components/AskPanel";
import { ChatBar } from "../components/ChatBar";
import { Legend } from "../components/Legend";
import { OfflineBanner } from "../components/OfflineBanner";
import { OnboardingCard } from "../components/OnboardingCard";
import { Palette } from "../components/Palette";
import { ZoomControl } from "../components/ZoomControl";
import { camera as cameraMetrics, chatBar, frame, offline, topbar } from "../design/metrics";
import { color, rule } from "../design/tokens";
import { type Camera, contentSize, fit, identity, zoomAt } from "../map/camera";
import { MapCanvas } from "../map/MapCanvas";
import type { MapScreen, PlaceRef } from "../model/view";
import { ChangesPanel } from "../panel/ChangesPanel";
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
  // Tries to reach the server again at once.
  onRetry?: () => void;
}

export function MapScreenView({
  screen,
  onNavigate,
  onChanges,
  onSelect,
  onExplanation,
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
            onCamera={setCamera}
            {...(onNavigate ? { onOpen: onNavigate, place: placeKey } : {})}
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
                <ChatBar view={chat} />
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
                <AskPanel view={answer} />
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
          />
        )}
      </aside>
      {screen.overlay?.kind === "palette" && (
        <>
          <div style={{ position: "absolute", inset: 0, background: color.scrim }} />
          <Palette view={screen.overlay.palette} />
        </>
      )}
      {screen.overlay?.kind === "onboarding" && <OnboardingCard view={screen.overlay.onboarding} />}
    </ScreenFrame>
  );
}
