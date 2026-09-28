// SPDX-License-Identifier: Apache-2.0

import type { CSSProperties, ReactNode } from "react";
import { edge as edgeMetrics, map as m } from "../design/metrics";
import { color, font, rule, size, tracking, weight } from "../design/tokens";
import type { MapView } from "../model/view";
import { en } from "../strings/en";
import { EdgeLayer } from "./EdgeLayer";
import { midpoint } from "./edgeLook";
import { NodeView } from "./NodeView";

interface MapCanvasProps {
  view: MapView;
  width: number;
  height: number;
  // Applied to the drawn map only, not to the controls floating over it: the
  // disconnected state greys the map and leaves the controls alone.
  sceneStyle?: CSSProperties;
  children?: ReactNode;
}

// The map as the design layers it: column labels, the filled container you
// are in, the connections, then the nodes on top, all on the dot grid.
export function MapCanvas({ view, width, height, sceneStyle, children }: MapCanvasProps) {
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
            key={column.id}
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
                border: rule(color.line3),
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
        <EdgeLayer edges={view.edges} width={width} height={height} />
        {view.edges.map((edge) => {
          // A bundle carries its count in a pill halfway along, above the line.
          const at =
            edge.kind === "bundled" && edge.count !== undefined ? midpoint(edge.points) : null;
          if (!at) return null;
          const pill = edgeMetrics.bundle;
          return (
            <span
              key={`${edge.id}-count`}
              style={{
                position: "absolute",
                left: at.x,
                top: at.y,
                transform: "translate(-50%, -50%)",
                width: pill.width,
                height: pill.height,
                boxSizing: "border-box",
                borderRadius: pill.radius,
                background: color.bg,
                border: rule(color.line2),
                display: "grid",
                placeItems: "center",
                fontFamily: font.mono,
                fontSize: pill.size,
                color: color.text3,
              }}
            >
              {en.meta.bundle(edge.count ?? 0)}
            </span>
          );
        })}
        {view.nodes.map((node) => (
          <NodeView key={node.id} node={node} />
        ))}
      </div>
      {children}
    </div>
  );
}
