// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { press } from "../components/press";
import { Segmented } from "../components/Segmented";
import { timeline as m } from "../design/metrics";
import { color, lineHeight, radius, rule, size, weight } from "../design/tokens";
import type { ChangeItem, ChangesPanel as ChangesView } from "../model/view";
import { en } from "../strings/en";

type Filter = "all" | "structure" | "behavior";

export function ChangesPanel({
  view,
  onClose,
}: {
  view: ChangesView;
  onClose?: (() => void) | undefined;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  return (
    <div
      style={{
        padding: m.padding,
        display: "flex",
        flexDirection: "column",
        gap: m.gap,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: m.titleGap }}>
          <span style={{ fontWeight: weight.bold, fontSize: size.s22 }}>{en.changes.title}</span>
          <span style={{ fontSize: size.s12_5, color: color.text4 }}>
            {en.changes.since(view.since, view.minutes)}
          </span>
        </div>
        <span
          {...press(onClose, en.changes.closeLabel)}
          style={{ color: color.text4, fontSize: m.close }}
        >
          {en.changes.close}
        </span>
      </div>
      <Segmented<Filter>
        width="narrow"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: en.changes.filter.all },
          { value: "structure", label: en.changes.filter.structure },
          { value: "behavior", label: en.changes.filter.behavior },
        ]}
      />
      {filter !== "behavior" && (
        <Group label={en.changes.group.structure(view.structure.length)} items={view.structure} />
      )}
      {filter !== "structure" && (
        <Group label={en.changes.group.behavior(view.behavior.length)} items={view.behavior} />
      )}
      {filter === "all" && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: `${m.footerPaddingY}px 0`,
            borderTop: rule(color.line1),
            fontSize: size.s13,
            color: color.text3,
          }}
        >
          <span>{en.changes.group.minor(view.minor)}</span>
          <span>{en.changes.show}</span>
        </div>
      )}
    </div>
  );
}

function Group({ label, items }: { label: string; items: ChangeItem[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: m.groupGap }}>
      <span style={{ fontSize: size.s12, color: color.text4, paddingBottom: m.groupLabelBottom }}>
        {label}
      </span>
      {items.map((item) => (
        <Item key={item.id} item={item} />
      ))}
    </div>
  );
}

function Item({ item }: { item: ChangeItem }) {
  const editing = item.marker === "editing";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${m.item.marker}px 1fr auto`,
        gap: `${m.item.rowGap}px ${m.item.columnGap}px`,
        padding: m.item.padding,
        margin: `0 -${m.item.padding}px`,
        ...(item.selected ? { borderRadius: m.item.radius, background: color.hover } : {}),
      }}
    >
      {editing ? (
        <span
          style={{
            width: m.dot,
            height: m.dot,
            borderRadius: radius.full,
            background: color.edit,
            marginTop: m.dotTop,
          }}
        />
      ) : (
        <span style={{ color: color.neu, fontSize: size.s9, paddingTop: m.glyphTop }}>
          {en.glyph.changed}
        </span>
      )}
      <span style={{ fontWeight: weight.semibold }}>{item.title}</span>
      <span style={{ fontSize: size.s12, color: editing ? color.edit : color.text4 }}>
        {item.time}
      </span>
      <span />
      <span
        style={{ fontSize: size.s12_5, color: color.text3, lineHeight: lineHeight.description }}
      >
        {item.line}
      </span>
      <span />
    </div>
  );
}
