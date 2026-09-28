// SPDX-License-Identifier: Apache-2.0

import { zoomControl as m } from "../design/metrics";
import { color, font, radius, rule, size, weight } from "../design/tokens";
import type { Level } from "../model/view";
import { en } from "../strings/en";

const levels: Level[] = ["system", "area", "file", "function"];

// The four zoom levels by name, the current one marked, beside zoom in, zoom
// out and fit.
export function ZoomControl({ level }: { level: Level }) {
  const button = {
    width: m.button,
    height: m.button,
    display: "grid",
    placeItems: "center",
    fontSize: m.glyphSize,
  } as const;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: m.gap,
        fontFamily: font.sans,
        fontSize: size.s12,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: m.levelGap,
        }}
      >
        {levels.map((name) => {
          const current = name === level;
          return (
            <span
              key={name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: m.levelDotGap,
                color: current ? color.text1 : color.text4,
                fontWeight: current ? weight.semibold : weight.regular,
              }}
            >
              {en.levels[name]}
              <span
                style={{
                  width: m.dot,
                  height: m.dot,
                  borderRadius: radius.full,
                  background: current ? color.text1 : "transparent",
                }}
              />
            </span>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderRadius: m.radius,
          border: rule(color.line2),
          background: color.float,
          overflow: "hidden",
          color: color.text2,
        }}
      >
        <span style={button}>{en.zoom.in}</span>
        <span style={{ ...button, borderTop: rule(color.line2) }}>{en.zoom.out}</span>
        <span style={{ ...button, borderTop: rule(color.line2) }}>
          <span
            style={{
              width: m.fit.size,
              height: m.fit.size,
              border: `${m.fit.stroke}px solid ${color.text2}`,
              borderRadius: m.fit.radius,
              boxSizing: "border-box",
            }}
          />
        </span>
      </div>
    </div>
  );
}
