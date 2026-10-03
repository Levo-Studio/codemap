// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";
import { Topbar } from "../components/Topbar";
import { topbar } from "../design/metrics";
import { color, font, size } from "../design/tokens";
import type { TopbarView } from "../model/view";

interface ScreenFrameProps {
  bar: TopbarView;
  onNavigate?: ((id: string | undefined) => void) | undefined;
  onChanges?: (() => void) | undefined;
  onSearch?: (() => void) | undefined;
  children: ReactNode;
}

export function ScreenFrame({ bar, onNavigate, onChanges, onSearch, children }: ScreenFrameProps) {
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
        <Topbar view={bar} onNavigate={onNavigate} onChanges={onChanges} onSearch={onSearch} />
      </div>
      {children}
    </div>
  );
}

export const below = {
  position: "absolute",
  left: 0,
  top: topbar.height,
  right: 0,
  bottom: 0,
} as const;
