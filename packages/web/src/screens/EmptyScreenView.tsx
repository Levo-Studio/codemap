// SPDX-License-Identifier: Apache-2.0

import { Mark } from "../components/Mark";
import { empty as m } from "../design/metrics";
import { dotGrid } from "../design/styles";
import { color, font, lineHeight, radius, rule, size, tracking, weight } from "../design/tokens";
import type { EmptyScreen } from "../model/view";
import { en } from "../strings/en";
import { below, ScreenFrame } from "./ScreenFrame";

export function EmptyScreenView({ screen }: { screen: EmptyScreen }) {
  const prompt = <span style={{ color: color.text4 }}>{en.empty.prompt}</span>;
  return (
    <ScreenFrame bar={screen.topbar}>
      <div
        style={{
          ...below,
          display: "grid",
          placeItems: "center",
          ...dotGrid(),
        }}
      >
        <div
          style={{
            width: m.width,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: m.gap,
          }}
        >
          <Mark size={m.mark} callee="line3" />
          <div style={{ display: "flex", flexDirection: "column", gap: m.textGap }}>
            <span
              style={{ fontWeight: weight.bold, fontSize: m.title, letterSpacing: tracking.title }}
            >
              {en.empty.title}
            </span>
            <span style={{ fontSize: m.body, lineHeight: lineHeight.body, color: color.text3 }}>
              {en.empty.lookedIn}{" "}
              <span style={{ fontFamily: font.mono, fontSize: m.path, color: color.text1 }}>
                {screen.folder}
              </span>{" "}
              {en.empty.foundNothing}
            </span>
          </div>
          <div
            style={{
              width: "100%",
              boxSizing: "border-box",
              borderRadius: m.commands.radius,
              background: color.field,
              border: rule(color.line1),
              padding: `${m.commands.paddingY}px ${m.commands.paddingX}px`,
              fontFamily: font.mono,
              fontSize: m.commands.size,
              lineHeight: lineHeight.command,
              color: color.text2,
            }}
          >
            {prompt} {en.empty.changeDirectory}
            <br />
            {prompt} {en.empty.command}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: m.actions.gap }}>
            <span
              style={{
                padding: `${m.button.paddingY}px ${m.button.paddingX}px`,
                borderRadius: radius.md,
                border: rule(color.line3),
                fontWeight: weight.medium,
              }}
            >
              {en.empty.chooseFolder}
            </span>
            <span style={{ fontSize: size.s12_5, color: color.text4 }}>{en.empty.languages}</span>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}
