// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";
import { Topbar } from "../components/Topbar";
import { topbar } from "../design/metrics";
import { color, font, size } from "../design/tokens";
import type { PlaceRef, TopbarView } from "../model/view";

// Every screen: the topbar across the top and the screen's content below it.
interface ScreenFrameProps {
  bar: TopbarView;
  onNavigate?: (place: PlaceRef) => void;
  onChanges?: () => void;
  children: ReactNode;
}

export function ScreenFrame({ bar, onNavigate, onChanges, children }: ScreenFrameProps) {
  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: color.bg,
        color: color.text1,
        fontFamily: font.sans,
        fontSize: size.s13,
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, right: 0 }}>
        <Topbar
          view={bar}
          {...(onNavigate ? { onNavigate } : {})}
          {...(onChanges ? { onChanges } : {})}
        />
      </div>
      {children}
    </div>
  );
}

// The area below the topbar.
export const below = {
  position: "absolute",
  left: 0,
  top: topbar.height,
  right: 0,
  bottom: 0,
} as const;
