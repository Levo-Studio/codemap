// SPDX-License-Identifier: Apache-2.0

import { useRef } from "react";
import { frame, topbar } from "../design/metrics";
import { en } from "../strings/en";

// The panel is dragged wider by its left edge, from its drawn width up to a
// share of the window.
export const widestPanel = () =>
  Math.max(frame.panelWidth, window.innerWidth * frame.panelMaxShare);

interface PanelResizerProps {
  width: number;
  widest: number;
  onResize: (width: number) => void;
}

export function PanelResizer({ width, widest, onResize }: PanelResizerProps) {
  const resizing = useRef(false);
  const resize = (to: number) => onResize(Math.min(widest, Math.max(frame.panelWidth, to)));
  return (
    // A splitter the pointer drags and the arrow keys move; no HTML element
    // is one, and <hr> takes no input.
    // biome-ignore lint/a11y/useSemanticElements: see above
    <div
      role="separator"
      tabIndex={0}
      onKeyDown={(event) => {
        const step = event.key === "ArrowLeft" ? 1 : event.key === "ArrowRight" ? -1 : 0;
        if (step === 0) return;
        event.preventDefault();
        resize(width + step * frame.resizeStep);
      }}
      aria-orientation="vertical"
      aria-label={en.panel.resize}
      aria-valuemin={frame.panelWidth}
      aria-valuemax={Math.round(widest)}
      aria-valuenow={Math.round(width)}
      onPointerDown={(event) => {
        // The main button only, and no text selected on the way.
        if (event.button !== 0) return;
        event.preventDefault();
        resizing.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!resizing.current) return;
        resize(window.innerWidth - event.clientX);
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
        right: width - frame.resizeStrip / 2,
        width: frame.resizeStrip,
        cursor: "col-resize",
        zIndex: frame.resizeLayer,
      }}
    />
  );
}
