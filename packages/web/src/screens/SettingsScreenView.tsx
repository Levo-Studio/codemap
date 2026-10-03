// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";
import { Segmented } from "../components/Segmented";
import { Toggle } from "../components/Toggle";
import { settings as m } from "../design/metrics";
import { color, font, radius, rule, size, weight } from "../design/tokens";
import type { SettingsScreen } from "../model/view";
import { en } from "../strings/en";
import { below, ScreenFrame } from "./ScreenFrame";

const sections = ["general", "map", "explanations", "server", "shortcuts"] as const;

function Row({
  label,
  hint,
  top,
  children,
}: {
  label: string;
  hint: string;
  top?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: top ? "flex-start" : "center",
        justifyContent: "space-between",
        gap: m.row.gap,
        padding: `${m.row.paddingY}px 0`,
        borderBottom: rule(color.line1),
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: m.row.textGap }}>
        <span style={{ fontSize: m.row.label }}>{label}</span>
        <span style={{ fontSize: size.s12_5, color: color.text4 }}>{hint}</span>
      </div>
      {children}
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span
        style={{
          fontWeight: weight.semibold,
          fontSize: m.heading.size,
          paddingBottom: m.heading.bottom,
        }}
      >
        {heading}
      </span>
      {children}
    </div>
  );
}

export function SettingsScreenView({ screen }: { screen: SettingsScreen }) {
  const chip = {
    padding: `${m.chips.paddingY}px ${m.chips.paddingX}px`,
    borderRadius: radius.sm,
  } as const;
  return (
    <ScreenFrame bar={screen.topbar}>
      <div style={{ ...below, display: "flex" }}>
        <div
          style={{
            width: m.nav.width,
            padding: `${m.nav.paddingY}px ${m.nav.paddingX}px`,
            boxSizing: "border-box",
            borderRight: rule(color.line1),
            display: "flex",
            flexDirection: "column",
            gap: m.nav.gap,
            fontSize: m.nav.size,
          }}
        >
          <span
            style={{
              padding: `0 ${m.navTitle.x}px ${m.navTitle.bottom}px`,
              fontWeight: weight.bold,
              fontSize: m.navTitle.size,
            }}
          >
            {en.settings.title}
          </span>
          {sections.map((section) => (
            <span
              key={section}
              style={{
                padding: `${m.navItem.paddingY}px ${m.navItem.paddingX}px`,
                ...(section === "general"
                  ? { borderRadius: radius.md, background: color.hover, fontWeight: weight.medium }
                  : { color: color.text3 }),
              }}
            >
              {en.settings.sections[section]}
            </span>
          ))}
        </div>
        <div
          style={{
            flex: 1,
            padding: `${m.content.paddingY}px ${m.content.paddingX}px`,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              maxWidth: m.content.maxWidth,
              display: "flex",
              flexDirection: "column",
              gap: m.content.gap,
            }}
          >
            <Section heading={en.settings.appearance}>
              <Row label={en.settings.theme.label} hint={en.settings.theme.hint}>
                <Segmented
                  width="narrow"
                  value={screen.choice}
                  options={[
                    { value: "system", label: en.settings.theme.system },
                    { value: "dark", label: en.settings.theme.dark },
                    { value: "light", label: en.settings.theme.light },
                  ]}
                />
              </Row>
              <Row label={en.settings.reduceMotion.label} hint={en.settings.reduceMotion.hint}>
                <Toggle on={screen.reduceMotion} />
              </Row>
            </Section>
            <Section heading={en.settings.map}>
              <Row label={en.settings.agentActivity.label} hint={en.settings.agentActivity.hint}>
                <Toggle on={screen.agentActivity} />
              </Row>
              <Row label={en.settings.changedMarker.label} hint={en.settings.changedMarker.hint}>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: m.select.gap,
                    padding: `${m.select.paddingY}px ${m.select.paddingX}px`,
                    borderRadius: radius.md,
                    border: rule(color.line2),
                    fontSize: size.s13,
                  }}
                >
                  {en.settings.changedMarker.minutes(screen.changedMinutes)}
                  <span style={{ color: color.text4 }}>{en.settings.open}</span>
                </span>
              </Row>
              <Row
                label={en.settings.defaultExplanation.label}
                hint={en.settings.defaultExplanation.hint}
              >
                <Segmented
                  width="narrow"
                  value={screen.explanation}
                  options={[
                    { value: "simple", label: en.panel.simple },
                    { value: "technical", label: en.panel.technical },
                  ]}
                />
              </Row>
            </Section>
            <Section heading={en.settings.server}>
              <Row label={en.settings.port.label} hint={en.settings.port.hint}>
                <span
                  style={{
                    width: m.port.width,
                    padding: `${m.port.paddingY}px ${m.port.paddingX}px`,
                    boxSizing: "border-box",
                    borderRadius: radius.md,
                    border: rule(color.line2),
                    background: color.field,
                    fontFamily: font.mono,
                    fontSize: size.s13,
                  }}
                >
                  {screen.port}
                </span>
              </Row>
              <Row label={en.settings.ignoredPaths.label} hint={en.settings.ignoredPaths.hint} top>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                    gap: m.chips.gap,
                    maxWidth: m.chips.maxWidth,
                    fontFamily: font.mono,
                    fontSize: size.s12,
                  }}
                >
                  {screen.ignored.map((path) => (
                    <span key={path} style={{ ...chip, background: color.hover }}>
                      {path} {en.settings.ignoredPaths.remove}
                    </span>
                  ))}
                  <span
                    style={{ ...chip, border: rule(color.line3, "dashed"), color: color.text3 }}
                  >
                    {en.settings.ignoredPaths.add}
                  </span>
                </div>
              </Row>
            </Section>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}
