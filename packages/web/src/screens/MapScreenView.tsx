// SPDX-License-Identifier: Apache-2.0

import { useLayoutEffect, useRef, useState } from "react";
import { AskPanel } from "../components/AskPanel";
import { ChatBar } from "../components/ChatBar";
import { Legend } from "../components/Legend";
import { OfflineBanner } from "../components/OfflineBanner";
import { OnboardingCard } from "../components/OnboardingCard";
import { Palette } from "../components/Palette";
import { ZoomControl } from "../components/ZoomControl";
import { chatBar, frame, offline, topbar } from "../design/metrics";
import { color, rule } from "../design/tokens";
import { MapCanvas } from "../map/MapCanvas";
import type { MapScreen } from "../model/view";
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

export function MapScreenView({ screen }: { screen: MapScreen }) {
  const [mapRef, mapSize] = useSize();
  const chat = "kind" in screen.chat ? screen.chat : undefined;
  const answer = "kind" in screen.chat ? undefined : screen.chat;
  // The first-run card covers the map's controls; a lost server greys the
  // map and the panel's live content, not the controls over them.
  const controls = screen.overlay?.kind !== "onboarding";
  const faded = screen.offline ? offline.mapOpacity : 1;
  return (
    <ScreenFrame bar={screen.topbar}>
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
                  <ZoomControl level={screen.map.level} />
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
            {screen.offline && <OfflineBanner retryIn={screen.offline.retryIn} />}
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
          <ChangesPanel view={screen.panel} />
        ) : (
          <DetailPanel view={screen.panel} dim={faded} />
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
