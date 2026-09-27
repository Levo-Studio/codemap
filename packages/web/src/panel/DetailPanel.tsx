// SPDX-License-Identifier: Apache-2.0

import type { CSSProperties, ReactNode } from "react";
import { Badge } from "../components/Badge";
import { Divider } from "../components/Divider";
import { Segmented } from "../components/Segmented";
import { badge, panel as m } from "../design/metrics";
import { color, font, lineHeight, radius, size, tracking, weight } from "../design/tokens";
import type {
  Explanation,
  FilePanel,
  FunctionPanel,
  ModulePanel,
  ProjectPanel,
  RecentChange,
  Relation,
} from "../model/view";
import { en } from "../strings/en";

// The detail panel for what is selected on the map: the project on the
// system level, a module, a file or a function further in. Every panel leads
// with the plain-language explanation, Simple or Technical.

const column = (gap: number): CSSProperties => ({ display: "flex", flexDirection: "column", gap });
const label: CSSProperties = { fontSize: size.s12, color: color.text4 };
const title: CSSProperties = {
  fontWeight: weight.bold,
  fontSize: size.s28,
  letterSpacing: tracking.title,
};
const explanationText: CSSProperties = {
  margin: 0,
  fontSize: size.s15,
  lineHeight: lineHeight.body,
  color: color.text2,
  textWrap: "pretty",
};

function ExplanationSwitch({ value }: { value: Explanation }) {
  return (
    <Segmented
      value={value}
      options={[
        { value: "simple", label: en.panel.simple },
        { value: "technical", label: en.panel.technical },
      ]}
    />
  );
}

function Relations({ heading, items }: { heading: string; items: Relation[] }) {
  return (
    <div style={column(m.listGap)}>
      <span style={label}>{heading}</span>
      {items.map((item) => (
        <div key={item.name} style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{item.name}</span>
          <span style={{ fontSize: size.s12, color: item.live ? color.edit : color.text4 }}>
            {item.note}
          </span>
        </div>
      ))}
    </div>
  );
}

function Recent({ items, align }: { items: RecentChange[]; align?: "baseline" }) {
  return (
    <div style={column(m.sectionGap)}>
      <span style={label}>{en.panel.recent}</span>
      {items.map((item) => (
        <div
          key={item.title}
          style={{ display: "flex", gap: m.rowGap, ...(align ? { alignItems: align } : {}) }}
        >
          <span style={{ flex: 1 }}>{item.title}</span>
          {item.added !== undefined && (
            <span style={{ fontFamily: font.mono, fontSize: size.s11_5, color: color.neu }}>
              {en.panel.added(item.added)}
            </span>
          )}
          {item.removed !== undefined && (
            <span style={{ fontFamily: font.mono, fontSize: size.s11_5, color: color.errText }}>
              {en.panel.removed(item.removed)}
            </span>
          )}
          <span style={{ fontSize: size.s12, color: color.text4 }}>{item.time}</span>
        </div>
      ))}
    </div>
  );
}

function NameColumns({
  calledBy,
  calls,
  mono,
}: {
  calledBy: string[];
  calls: string[];
  mono?: boolean;
}) {
  const list = (heading: string, names: string[]) => (
    <div style={column(m.headerGap)}>
      <span style={{ ...label, fontFamily: font.sans }}>{heading}</span>
      {names.map((name) => (
        <span key={name}>{name}</span>
      ))}
    </div>
  );
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: m.columnsGap,
        ...(mono ? { fontFamily: font.mono, fontSize: size.s12 } : {}),
      }}
    >
      {list(en.panel.calledBy, calledBy)}
      {list(en.panel.calls, calls)}
    </div>
  );
}

function Project({ view, dim }: { view: ProjectPanel; dim: number }) {
  return (
    <div style={{ padding: m.padding, ...column(m.gap), opacity: dim }}>
      <div style={column(m.headerGap)}>
        <span style={label}>{en.panel.project}</span>
        <span style={title}>{view.name}</span>
        <span style={{ fontSize: size.s12_5, color: color.text4 }}>{view.meta}</span>
      </div>
      <div style={column(m.explanationGap)}>
        <ExplanationSwitch value={view.explanation} />
        <p style={explanationText}>{view.text}</p>
      </div>
      <Divider />
      <div style={column(m.sectionGap)}>
        <span style={label}>
          {view.activityTime ? en.panel.lastKnownActivity(view.activityTime) : en.panel.liveNow}
        </span>
        {view.activity.map((item) => (
          <div key={item.kind} style={{ display: "flex", alignItems: "center", gap: m.rowGap }}>
            <span
              style={{
                width: m.dot,
                height: m.dot,
                borderRadius: radius.full,
                ...(item.kind === "editing"
                  ? { background: color.edit }
                  : { border: `1px dashed ${color.read}`, boxSizing: "border-box" }),
              }}
            />
            <span style={{ flex: 1 }}>
              {item.kind === "editing" ? en.panel.editing : en.panel.reading}{" "}
              <span style={{ color: color.text3 }}>{item.where}</span>
            </span>
          </div>
        ))}
      </div>
      <Divider />
      <div style={column(m.sectionGap)}>
        <span style={label}>{en.panel.thisSession}</span>
        {view.session.map((item) => (
          <div key={item.title} style={{ display: "flex", gap: m.rowGap, alignItems: "center" }}>
            <span style={{ color: color.neu, fontSize: m.glyph, width: m.dot }}>
              {en.glyph.changed}
            </span>
            <span style={{ flex: 1 }}>{item.title}</span>
            <span style={{ fontSize: size.s12, color: color.text4 }}>{item.time}</span>
          </div>
        ))}
        <span style={{ fontSize: size.s12_5, color: color.text2 }}>
          {en.panel.allChanges(view.totalChanges)}
        </span>
      </div>
    </div>
  );
}

function Module({ view }: { view: ModulePanel }) {
  return (
    <>
      <div style={column(m.headerGap)}>
        <span style={label}>{view.eyebrow}</span>
        <span style={title}>{view.name}</span>
        <div style={{ display: "flex", gap: badge.gap }}>
          {view.badges.editing && <Badge text={en.status.editing} fg="edit" bg="editBg" />}
          {view.badges.failing !== undefined && (
            <Badge text={en.status.testsFailing(view.badges.failing)} fg="errText" bg="errBg" />
          )}
        </div>
      </div>
      <div style={column(m.explanationGap)}>
        <ExplanationSwitch value={view.explanation} />
        <p style={explanationText}>{view.text}</p>
      </div>
      <Divider />
      <Relations heading={en.panel.calledBy} items={view.calledBy} />
      <Relations heading={en.panel.calls} items={view.calls} />
      <Divider />
      <Recent items={view.recent} />
    </>
  );
}

function File({ view }: { view: FilePanel }) {
  return (
    <>
      <div style={column(m.headerGap)}>
        <span style={label}>{view.eyebrow}</span>
        <span style={{ fontFamily: font.mono, fontWeight: weight.medium, fontSize: size.s22 }}>
          {view.name}
        </span>
        <span style={{ fontSize: size.s12_5, color: color.text4 }}>{view.meta}</span>
      </div>
      <div style={column(m.explanationGap)}>
        <ExplanationSwitch value={view.explanation} />
        <p style={explanationText}>{view.text}</p>
      </div>
      <Divider />
      <div style={column(m.listGap)}>
        <span style={label}>{en.panel.functions(view.functions.length)}</span>
        {view.functions.map((fn) => (
          <div key={fn.name} style={{ display: "flex", alignItems: "center", gap: m.rowGap }}>
            <span
              style={{
                flex: 1,
                fontFamily: font.mono,
                fontSize: size.s12_5,
                color: fn.status ? color.text1 : color.text2,
              }}
            >
              {fn.name}
            </span>
            <span
              style={{
                fontSize: size.s12,
                color:
                  fn.status === "editing"
                    ? color.edit
                    : fn.status === "new"
                      ? color.neu
                      : color.text4,
              }}
            >
              {fn.status === "editing"
                ? en.status.editing
                : fn.status === "new"
                  ? en.status.new
                  : ""}
            </span>
          </div>
        ))}
      </div>
      <Divider />
      <NameColumns calledBy={view.calledBy} calls={view.calls} />
    </>
  );
}

function FunctionDetail({ view }: { view: FunctionPanel }) {
  const code: CSSProperties = { fontFamily: font.mono, fontSize: size.s12_5, color: color.text1 };
  return (
    <>
      <div style={column(m.headerGap)}>
        <span style={label}>{view.eyebrow}</span>
        <span style={{ fontFamily: font.mono, fontWeight: weight.medium, fontSize: size.s20 }}>
          {view.name}
        </span>
        {view.editingLine !== undefined && (
          <div style={{ display: "flex", gap: badge.gap }}>
            <Badge text={en.status.editingAtLine(view.editingLine)} fg="edit" bg="editBg" />
          </div>
        )}
      </div>
      <div style={column(m.explanationGap)}>
        <ExplanationSwitch value={view.explanation} />
        <p style={{ ...explanationText, fontSize: size.s14 }}>
          {view.text.map((part, index) =>
            typeof part === "string" ? (
              part
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one sentence never reorder
              <span key={index} style={code}>
                {part.code}
              </span>
            ),
          )}
        </p>
        <div
          style={{
            borderRadius: m.signature.radius,
            background: color.field,
            border: `1px solid ${color.line1}`,
            padding: `${m.signature.paddingY}px ${m.signature.paddingX}px`,
            fontFamily: font.mono,
            fontSize: size.s12,
            lineHeight: lineHeight.body,
            color: color.text2,
          }}
        >
          <span style={{ color: color.text4 }}>{view.signature.keyword}</span>
          {view.signature.lines.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the lines of one signature never reorder
            <Line key={index} first={index === 0}>
              {line}
            </Line>
          ))}
        </div>
      </div>
      <Divider />
      <NameColumns calledBy={view.calledBy} calls={view.calls} mono />
      <Divider />
      <Recent items={view.recent} align="baseline" />
    </>
  );
}

function Line({ first, children }: { first: boolean; children: ReactNode }) {
  return (
    <>
      {!first && <br />}
      {children}
    </>
  );
}

export function DetailPanel({
  view,
  dim = 1,
}: {
  view: ProjectPanel | ModulePanel | FilePanel | FunctionPanel;
  dim?: number;
}) {
  if (view.kind === "project") return <Project view={view} dim={dim} />;
  return (
    <div
      style={{
        padding: m.padding,
        ...column(view.kind === "function" ? m.functionGap : m.gap),
        boxSizing: "border-box",
      }}
    >
      {view.kind === "module" && <Module view={view} />}
      {view.kind === "file" && <File view={view} />}
      {view.kind === "function" && <FunctionDetail view={view} />}
    </div>
  );
}
