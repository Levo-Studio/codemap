// SPDX-License-Identifier: Apache-2.0

import { onboarding as m } from "../design/metrics";
import { floating } from "../design/styles";
import { color, lineHeight, radius, size, weight } from "../design/tokens";
import type { OnboardingView } from "../model/view";
import { en } from "../strings/en";

// The first-run explanation: everything but the node being explained sits
// under the scrim, and the card beside it says what the map is. Only step 1
// of 3 has a design; steps 2 and 3 are open questions in CONTEXT.md.
export function OnboardingCard({ view }: { view: OnboardingView }) {
  const { spotlight, card } = view;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: spotlight.x,
          top: spotlight.y,
          width: spotlight.width,
          height: spotlight.height,
          borderRadius: m.spotlightRadius,
          boxShadow: `0 0 0 ${m.spotlightSpread}px ${color.scrim}`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: card.x,
          top: card.y,
          width: m.card.width,
          borderRadius: m.card.radius,
          ...floating,
          padding: m.card.padding,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: m.card.gap,
        }}
      >
        <span style={{ fontSize: size.s12, color: color.text4 }}>
          {en.onboarding.step(view.step, view.total)}
        </span>
        <span style={{ fontWeight: weight.bold, fontSize: m.title }}>
          {en.onboarding.map.title}
        </span>
        <span style={{ fontSize: m.body, lineHeight: lineHeight.prose, color: color.text2 }}>
          {en.onboarding.map.body}
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: m.controls.gap,
            paddingTop: m.controls.top,
          }}
        >
          {Array.from({ length: view.total }, (_, index) => index + 1).map((step) => (
            <span
              key={step}
              style={{
                width: step === view.step ? m.step.active : m.step.inactive,
                height: m.step.height,
                borderRadius: m.step.radius,
                background: step === view.step ? color.text1 : color.line3,
              }}
            />
          ))}
          <span style={{ flex: 1 }} />
          <span
            style={{ padding: `${m.skip.paddingY}px ${m.skip.paddingX}px`, color: color.text3 }}
          >
            {en.onboarding.skip}
          </span>
          <span
            style={{
              padding: `${m.next.paddingY}px ${m.next.paddingX}px`,
              borderRadius: radius.md,
              background: color.text1,
              color: color.inv,
              fontWeight: weight.medium,
            }}
          >
            {en.onboarding.next}
          </span>
        </div>
      </div>
    </>
  );
}
