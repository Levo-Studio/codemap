// SPDX-License-Identifier: Apache-2.0

import { Mark } from "../components/Mark";
import { loading as m, map } from "../design/metrics";
import { type ColorToken, color, font, lineHeight, rule, size, weight } from "../design/tokens";
import type { LoadingScreen, StepState } from "../model/view";
import { en } from "../strings/en";
import { below, ScreenFrame } from "./ScreenFrame";

const glyph: Record<StepState, { text: string; color: ColorToken }> = {
  done: { text: en.loading.done, color: "neu" },
  running: { text: en.loading.running, color: "edit" },
  pending: { text: en.loading.pending, color: "text4" },
};

// The first run in the browser, before the map exists: the same steps as the
// terminal, over faint outlines of where the map will appear.
export function LoadingScreenView({ screen }: { screen: LoadingScreen }) {
  return (
    <ScreenFrame bar={screen.topbar}>
      <div
        style={{
          ...below,
          backgroundImage: `radial-gradient(${color.dot} ${map.gridDot}px, transparent ${map.gridDot}px)`,
          backgroundSize: `${map.gridSize}px ${map.gridSize}px`,
        }}
      >
        {screen.ghosts.map((ghost) => (
          <div
            key={`${ghost.x},${ghost.y}`}
            style={{
              position: "absolute",
              left: ghost.x,
              top: ghost.y,
              width: ghost.width,
              height: ghost.height,
              borderRadius: m.ghostRadius,
              border: ghost.dashed ? rule(color.line3, "dashed") : rule(color.line2),
              opacity: m.ghostOpacity,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: m.card.top,
            transform: "translateX(-50%)",
            width: m.card.width,
            padding: m.card.padding,
            boxSizing: "border-box",
            borderRadius: m.card.radius,
            background: color.float,
            border: rule(color.line2),
            boxShadow: color.shadowFloating,
            display: "flex",
            flexDirection: "column",
            gap: m.card.gap,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: m.header.gap }}>
            <Mark size={m.header.mark} indexing />
            <span style={{ fontWeight: weight.bold, fontSize: m.header.title }}>
              {en.loading.title(screen.project)}
            </span>
            <span
              style={{ fontSize: m.header.body, lineHeight: lineHeight.prose, color: color.text3 }}
            >
              {en.loading.body}
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `${m.steps.glyph}px 1fr auto`,
              gap: `${m.steps.gap}px ${m.steps.gap}px`,
              fontSize: m.steps.size,
            }}
          >
            {screen.steps.map((step) => (
              <Step key={step.id} state={step.state} label={step.label} result={step.result} />
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: m.progress.gap }}>
            <div
              style={{
                flex: 1,
                height: m.progress.height,
                borderRadius: m.progress.radius,
                background: color.line2,
                overflow: "hidden",
              }}
            >
              <div
                style={{ width: `${screen.progress}%`, height: "100%", background: color.edit }}
              />
            </div>
            <span style={{ fontFamily: font.mono, fontSize: size.s12, color: color.text4 }}>
              {en.loading.percent(screen.progress)}
            </span>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

function Step({
  state,
  label,
  result,
}: {
  state: StepState;
  label: string;
  result?: string | undefined;
}) {
  const running = state === "running";
  return (
    <>
      <span style={{ color: color[glyph[state].color] }}>{glyph[state].text}</span>
      <span
        style={{
          ...(running ? { fontWeight: weight.semibold } : {}),
          ...(state === "pending" ? { color: color.text4 } : {}),
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: font.mono,
          fontSize: size.s12,
          color: running ? color.edit : color.text4,
        }}
      >
        {result}
      </span>
    </>
  );
}
