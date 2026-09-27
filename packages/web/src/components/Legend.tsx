// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";
import { legend as m } from "../design/metrics";
import { color, font, size } from "../design/tokens";
import { en } from "../strings/en";

function Row({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: m.rowGap }}>
      {swatch}
      {children}
    </span>
  );
}

const glyph = (token: "neu" | "err", text: string) => (
  <span
    style={{
      width: m.glyph.width,
      textAlign: "center",
      color: color[token],
      fontSize: m.glyph.size,
    }}
  >
    {text}
  </span>
);

// Every status the map uses, with its shape. Reading the legend must not
// depend on telling colours apart.
export function Legend() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: m.gap,
        fontFamily: font.sans,
        fontSize: size.s12,
        color: color.text3,
      }}
    >
      <Row
        swatch={
          <span
            style={{
              width: m.line.width,
              height: 0,
              borderTop: `${m.line.stroke}px solid ${color.text3}`,
              position: "relative",
            }}
          >
            <span
              style={{
                position: "absolute",
                right: m.line.arrowRight,
                top: m.line.arrowTop,
                width: 0,
                height: 0,
                borderLeft: `${m.line.arrowLength}px solid ${color.text3}`,
                borderTop: `${m.line.arrowHalf}px solid transparent`,
                borderBottom: `${m.line.arrowHalf}px solid transparent`,
              }}
            />
          </span>
        }
      >
        {en.legend.calls}
      </Row>
      <Row
        swatch={
          <span
            style={{
              width: m.swatch.size,
              height: m.swatch.size,
              borderRadius: m.swatch.radius,
              boxShadow: `0 0 0 ${m.swatch.ring}px ${color.edit}`,
              margin: `0 ${m.swatch.marginX}px`,
            }}
          />
        }
      >
        {en.legend.editing}
      </Row>
      <Row
        swatch={
          <span
            style={{
              width: m.swatch.size,
              height: m.swatch.size,
              borderRadius: m.swatch.radius,
              border: `1px dashed ${color.read}`,
              boxSizing: "border-box",
              margin: `0 ${m.swatch.marginX}px`,
            }}
          />
        }
      >
        {en.legend.reading}
      </Row>
      <Row swatch={glyph("neu", en.glyph.changed)}>{en.legend.changed}</Row>
      <Row swatch={glyph("err", en.glyph.error)}>{en.legend.error}</Row>
    </div>
  );
}
