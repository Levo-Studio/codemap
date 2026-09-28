// SPDX-License-Identifier: Apache-2.0

import { type CSSProperties, type KeyboardEvent, useEffect, useState } from "react";
import { palette as m } from "../design/metrics";
import { color, font, radius, rule, size, weight } from "../design/tokens";
import type { PaletteRow, PaletteView } from "../model/view";
import { en } from "../strings/en";
import { press } from "./press";

// Search across functions, modules and files, with a way to ask instead. The
// match is underlined, not coloured: colour belongs to status.

const nameStyle: Record<PaletteRow["kind"], CSSProperties> = {
  function: { fontFamily: font.mono, fontSize: m.row.size, fontWeight: weight.medium },
  module: { fontWeight: weight.semibold },
  file: { fontFamily: font.mono, fontSize: m.row.size },
};

function Row({ row, onPick }: { row: PaletteRow; onPick?: () => void }) {
  return (
    <div
      {...press(onPick)}
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

interface PaletteProps {
  view: PaletteView;
  // Live: what is typed, a row picked, the query asked instead, closing.
  onQuery?: (query: string) => void;
  onPick?: (row: PaletteRow) => void;
  onAsk?: (query: string) => void;
  onClose?: () => void;
  // Whether the rows are the results for what is typed now; until they are,
  // the last ones stay on screen and Enter waits for the new ones.
  ready?: boolean;
}

export function Palette({ view, onQuery, onPick, onAsk, onClose, ready = true }: PaletteProps) {
  // The row ↑↓ moves to; the first until the user moves. Drawn, it is the
  // row the view marks active.
  const rows = [...view.functions, ...view.modulesAndFiles];
  const [moved, setMoved] = useState<{ query: string; index: number } | undefined>();
  const index = moved && moved.query === view.query ? moved.index : 0;
  const live = !!onQuery;
  const active = (row: PaletteRow) => (live ? rows[index] === row : !!row.active);
  // What the Ask row says is what it asks.
  const question = view.ask[0]?.name;
  const choose = (at: number) => {
    const row = rows[at];
    if (row) onPick?.(row);
    else if (question) onAsk?.(question);
  };
  // The query Enter was pressed for before its results came; typing on
  // takes the Enter back.
  const [waiting, setWaiting] = useState<string | undefined>();
  useEffect(() => {
    if (waiting === undefined) return;
    if (waiting !== view.query) setWaiting(undefined);
    else if (ready) {
      setWaiting(undefined);
      choose(index);
    }
  });
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    // A key that confirms or moves within a word being composed is the input
    // method's (keyCode 229 is how Safari reports it).
    if (event.nativeEvent.isComposing || event.keyCode === m.composingKey) return;
    const total = rows.length + view.ask.length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (total === 0) return;
      const step = event.key === "ArrowDown" ? 1 : total - 1;
      setMoved({ query: view.query, index: (index + step) % total });
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (ready) choose(index);
      else setWaiting(view.query);
    } else if (event.key === "Tab") {
      event.preventDefault();
      if (question) onAsk?.(question);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose?.();
    }
  };
  return (
    <div
      {...(live ? { role: "dialog", "aria-modal": true, "aria-label": en.palette.label } : {})}
      style={{
        position: "absolute",
        // Centred on its content width, which puts it at the design's 400 px
        // on a 1440 px window; the border sits outside that width.
        left: `calc(50% - ${m.width}px / 2)`,
        top: m.top,
        width: m.width,
        borderRadius: m.radius,
        background: color.float,
        border: rule(color.line2),
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
          borderBottom: rule(color.line1),
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
        {live ? (
          <input
            className="cm-question"
            // biome-ignore lint/a11y/noAutofocus: the palette opens to be typed into
            autoFocus
            value={view.query}
            aria-label={en.palette.label}
            maxLength={m.longest}
            onChange={(event) => onQuery?.(event.target.value)}
            onKeyDown={keys}
          />
        ) : (
          <>
            <span>{view.query}</span>
            <span
              style={{ width: m.caret.width, height: m.caret.height, background: color.text1 }}
            />
            <span style={{ flex: 1 }} />
          </>
        )}
        <span
          {...press(onClose, en.palette.close)}
          style={{
            fontFamily: font.mono,
            fontSize: size.s11,
            color: color.text4,
            padding: `${m.key.paddingY}px ${m.key.paddingX}px`,
            border: rule(color.line2),
            borderRadius: m.key.radius,
          }}
        >
          {en.palette.escape}
        </span>
      </div>
      <div style={{ padding: m.list }}>
        <Group label={en.palette.groups.functions} />
        {view.functions.map((row) => (
          <Row
            key={row.id}
            row={{ ...row, active: active(row) }}
            {...(onPick ? { onPick: () => onPick(row) } : {})}
          />
        ))}
        <Group label={en.palette.groups.modulesAndFiles} />
        {view.modulesAndFiles.map((row) => (
          <Row
            key={row.id}
            row={{ ...row, active: active(row) }}
            {...(onPick ? { onPick: () => onPick(row) } : {})}
          />
        ))}
        <Group label={en.palette.groups.ask} />
        {view.ask.map((question) => (
          <div
            key={question.id}
            {...press(onAsk ? () => onAsk(question.name) : undefined)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: m.row.gap,
              padding: `${m.row.paddingY}px ${m.row.paddingX}px`,
              ...(live && index === rows.length
                ? { borderRadius: m.row.radius, background: color.hover }
                : {}),
            }}
          >
            <span>{question.name}</span>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          gap: m.footer.gap,
          padding: `${m.footer.paddingY}px ${m.footer.paddingX}px`,
          borderTop: rule(color.line1),
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
