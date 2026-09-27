// SPDX-License-Identifier: Apache-2.0

import type { CSSProperties } from "react";
import { palette as m } from "../design/metrics";
import { color, font, radius, size, weight } from "../design/tokens";
import type { PaletteRow, PaletteView } from "../model/view";
import { en } from "../strings/en";

// Search across functions, modules and files, with a way to ask instead. The
// match is underlined, not coloured: colour belongs to status.

const nameStyle: Record<PaletteRow["kind"], CSSProperties> = {
  function: { fontFamily: font.mono, fontSize: m.row.size, fontWeight: weight.medium },
  module: { fontWeight: weight.semibold },
  file: { fontFamily: font.mono, fontSize: m.row.size },
};

function Row({ row }: { row: PaletteRow }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: m.row.gap,
        padding: `${m.row.paddingY}px ${m.row.paddingX}px`,
        ...(row.active ? { borderRadius: m.row.radius, background: color.hover } : {}),
      }}
    >
      <span style={nameStyle[row.kind]}>
        {row.before}
        {row.match && (
          <span style={{ textDecoration: "underline", textUnderlineOffset: m.underlineOffset }}>
            {row.match}
          </span>
        )}
        {row.after}
      </span>
      <span style={{ fontSize: size.s12_5, color: color.text4 }}>{row.location}</span>
      {row.active && (
        <>
          <span style={{ flex: 1 }} />
          {row.editing && (
            <span style={{ fontSize: size.s12, color: color.edit }}>{en.status.editing}</span>
          )}
          <span style={{ fontSize: size.s12, color: color.text4 }}>{en.palette.enter}</span>
        </>
      )}
    </div>
  );
}

function Group({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: `${m.group.top}px ${m.group.x}px ${m.group.bottom}px`,
        fontSize: size.s12,
        color: color.text4,
      }}
    >
      {label}
    </div>
  );
}

export function Palette({ view }: { view: PaletteView }) {
  return (
    <div
      style={{
        position: "absolute",
        left: m.left,
        top: m.top,
        width: m.width,
        borderRadius: m.radius,
        background: color.float,
        border: `1px solid ${color.line2}`,
        boxShadow: color.shadowFloating,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: m.input.gap,
          height: m.input.height,
          padding: `0 ${m.input.paddingX}px`,
          borderBottom: `1px solid ${color.line1}`,
          fontSize: m.input.size,
        }}
      >
        <span
          style={{
            width: m.searchIcon.size,
            height: m.searchIcon.size,
            border: `${m.searchIcon.stroke}px solid ${color.text3}`,
            borderRadius: radius.full,
            boxSizing: "border-box",
          }}
        />
        <span>{view.query}</span>
        <span style={{ width: m.caret.width, height: m.caret.height, background: color.text1 }} />
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: font.mono,
            fontSize: size.s11,
            color: color.text4,
            padding: `${m.key.paddingY}px ${m.key.paddingX}px`,
            border: `1px solid ${color.line2}`,
            borderRadius: m.key.radius,
          }}
        >
          {en.palette.escape}
        </span>
      </div>
      <div style={{ padding: m.list }}>
        <Group label={en.palette.groups.functions} />
        {view.functions.map((row) => (
          <Row key={row.before + row.match + row.after} row={row} />
        ))}
        <Group label={en.palette.groups.modulesAndFiles} />
        {view.modulesAndFiles.map((row) => (
          <Row key={row.before + row.match + row.after} row={row} />
        ))}
        <Group label={en.palette.groups.ask} />
        {view.ask.map((question) => (
          <div
            key={question}
            style={{
              display: "flex",
              alignItems: "center",
              gap: m.row.gap,
              padding: `${m.row.paddingY}px ${m.row.paddingX}px`,
            }}
          >
            <span>{question}</span>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          gap: m.footer.gap,
          padding: `${m.footer.paddingY}px ${m.footer.paddingX}px`,
          borderTop: `1px solid ${color.line1}`,
          fontSize: size.s12,
          color: color.text4,
        }}
      >
        <span>{en.palette.hints.move}</span>
        <span>{en.palette.hints.open}</span>
        <span>{en.palette.hints.ask}</span>
      </div>
    </div>
  );
}
