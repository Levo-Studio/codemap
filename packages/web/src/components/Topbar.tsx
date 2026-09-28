// SPDX-License-Identifier: Apache-2.0

import { Fragment } from "react";
import { topbar as m } from "../design/metrics";
import { type ColorToken, color, font, radius, rule, size, weight } from "../design/tokens";
import type { ConnectionStatus, PlaceRef, TopbarView } from "../model/view";
import { en } from "../strings/en";
import { Mark } from "./Mark";
import { press } from "./press";
import { Wordmark } from "./Wordmark";

const statusLook: Record<ConnectionStatus, { dot: ColorToken; text: ColorToken }> = {
  live: { dot: "neu", text: "text3" },
  offline: { dot: "err", text: "errText" },
  indexing: { dot: "edit", text: "text3" },
};

interface TopbarProps {
  view: TopbarView;
  // Going back up to where a crumb leads.
  onNavigate?: (place: PlaceRef) => void;
}

export function Topbar({ view, onNavigate }: TopbarProps) {
  const look = statusLook[view.status];
  return (
    <header
      style={{
        width: "100%",
        height: m.height,
        display: "flex",
        alignItems: "center",
        gap: m.gap,
        padding: `0 ${m.paddingX}px`,
        boxSizing: "border-box",
        borderBottom: rule(color.topbarLine1),
        background: color.bg,
        color: color.text1,
        fontFamily: font.sans,
        fontSize: size.s13,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: m.brandGap }}>
        <Mark size={m.markSize} />
        <Wordmark size={m.wordmarkSize} />
      </div>
      <span style={{ ...m.divider, background: color.topbarLine2 }} />
      <span style={{ color: color.text3 }}>{view.project}</span>
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: m.crumbs.gap,
          padding: `${m.crumbs.paddingY}px ${m.crumbs.paddingX}px`,
          borderRadius: radius.md,
          background: color.topbarField,
        }}
      >
        {view.crumbs.map((crumb, index) => {
          // A crumb is identified by the path up to it: two levels may share a name.
          const path = view.crumbs.slice(0, index + 1).join("\u0000");
          const last = index === view.crumbs.length - 1;
          const target = !last && onNavigate ? view.trail?.[index] : undefined;
          const go = press(target && (() => onNavigate?.(target)));
          return (
            <Fragment key={path}>
              {index > 0 && (
                <span style={{ color: color.topbarLine3 }}>{en.topbar.crumbSeparator}</span>
              )}
              <span
                {...go}
                style={{
                  color: last ? color.text1 : color.text4,
                  fontWeight: last ? weight.medium : weight.regular,
                  ...(target ? { cursor: "pointer" } : {}),
                }}
              >
                {crumb}
              </span>
            </Fragment>
          );
        })}
      </nav>
      <div style={{ flex: 1 }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: m.button.gap,
          height: m.button.height,
          padding: `0 ${m.button.paddingX}px`,
          borderRadius: radius.md,
          border: rule(view.changesOpen ? color.topbarLine3 : color.topbarLine2),
          background: view.changesOpen ? color.topbarField : "transparent",
          color: color.text2,
        }}
      >
        {en.topbar.changes}
        <span
          style={{
            padding: `${m.badge.paddingY}px ${m.badge.paddingX}px`,
            borderRadius: m.badge.radius,
            background: color.topbarLine2,
            fontSize: size.s11,
            color: color.text1,
          }}
        >
          {view.changes}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: m.search.gap,
          width: m.search.width,
          height: m.button.height,
          padding: `0 ${m.button.paddingX}px`,
          borderRadius: radius.md,
          background: color.topbarField,
          boxSizing: "border-box",
          color: color.text4,
        }}
      >
        <span style={{ flex: 1 }}>{en.topbar.search}</span>
        <span
          style={{
            fontFamily: font.mono,
            fontSize: size.s11,
            padding: `${m.key.paddingY}px ${m.key.paddingX}px`,
            borderRadius: radius.xs,
            border: rule(color.topbarLine2),
          }}
        >
          {en.topbar.searchKey}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: m.status.gap,
          fontSize: size.s12,
          color: color[look.text],
          minWidth: m.status.minWidth,
        }}
      >
        <span
          style={{
            width: m.status.dot,
            height: m.status.dot,
            borderRadius: radius.full,
            background: color[look.dot],
          }}
        />
        {en.topbar.status[view.status]}
      </div>
    </header>
  );
}
