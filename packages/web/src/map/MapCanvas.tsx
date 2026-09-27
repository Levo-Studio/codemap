// SPDX-License-Identifier: Apache-2.0

import type { CSSProperties, ReactNode } from "react";
import { map as m } from "../design/metrics";
import { color, font, size, type Theme, tracking, weight } from "../design/tokens";
import type { MapView } from "../model/view";
import { EdgeLayer } from "./EdgeLayer";
import { NodeView } from "./NodeView";

interface MapCanvasProps {
  view: MapView;
  theme: Theme;
  width: number;
  height: number;
  // Applied to the drawn map only, not to the controls floating over it: the
  // disconnected state greys the map and leaves the controls alone.
  sceneStyle?: CSSProperties;
  children?: ReactNode;
}

// The map as the design layers it: column labels, the filled container you
// are in, the connections, then the nodes on top, all on the dot grid.
export function MapCanvas({ view, theme, width, height, sceneStyle, children }: MapCanvasProps) {
  const { container } = view;
  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        backgroundImage: `radial-gradient(${color.dot} ${m.gridDot}px, transparent ${m.gridDot}px)`,
        backgroundSize: `${m.gridSize}px ${m.gridSize}px`,
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, width, height, ...sceneStyle }}>
        {view.columns.map((column) => (
          <div
            key={column.label}
            style={{
              position: "absolute",
              left: column.x,
              top: m.column.top,
              fontSize: m.column.size,
              fontWeight: weight.semibold,
              letterSpacing: tracking.caps,
              color: color.text4,
            }}
          >
            {column.label}
          </div>
        ))}
        {container && (
          <>
            <div
              style={{
                position: "absolute",
                left: container.x,
                top: container.y,
                width: container.width,
                height: container.height,
                borderRadius: m.container.radius,
                border: `1px solid ${color.line3}`,
                background: color.container,
                boxSizing: "border-box",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: container.x + m.container.titleX,
                top: container.y + m.container.titleY,
                display: "flex",
                alignItems: "baseline",
                gap: m.container.titleGap,
              }}
            >
              <span
                style={
                  container.mono
                    ? {
                        fontFamily: font.mono,
                        fontWeight: weight.medium,
                        fontSize: m.container.monoTitleSize,
                      }
                    : { fontWeight: weight.bold, fontSize: m.container.titleSize }
                }
              >
                {container.title}
              </span>
              <span style={{ fontSize: size.s12, color: color.text4 }}>{container.meta}</span>
            </div>
          </>
        )}
        <EdgeLayer edges={view.edges} theme={theme} width={width} height={height} />
        {view.nodes.map((node) => (
          <NodeView key={node.id} node={node} />
        ))}
      </div>
      {children}
    </div>
  );
}
