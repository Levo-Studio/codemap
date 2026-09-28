// SPDX-License-Identifier: Apache-2.0

import { chatBar, ask as m } from "../design/metrics";
import { color, font, lineHeight, radius, size, weight } from "../design/tokens";
import type { AskView } from "../model/view";
import { en } from "../strings/en";

// An answer in Ask mode. The chat only explains: the answer is numbered steps
// that match the numbered nodes on the map, and the actions move the map, not
// the code.
export function AskPanel({ view }: { view: AskView }) {
  const chip = {
    padding: `${m.actions.paddingY}px ${m.actions.paddingX}px`,
    borderRadius: radius.md,
    border: `1px solid ${color.line2}`,
    fontSize: size.s12_5,
    color: color.text1,
  } as const;
  return (
    // Width and height are the content box, as in the export: the border adds
    // to them, the same as for the chat bar.
    <div
      style={{
        width: "100%",
        height: m.height,
        borderRadius: m.radius,
        background: color.float,
        border: `1px solid ${color.line2}`,
        boxShadow: color.shadowFloating,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: m.header.gap,
          padding: `${m.header.paddingY}px ${m.header.paddingX}px`,
          borderBottom: `1px solid ${color.line1}`,
          fontSize: size.s12_5,
          color: color.text2,
        }}
      >
        <span
          style={{
            width: chatBar.dot,
            height: chatBar.dot,
            borderRadius: radius.full,
            background: color.edit,
          }}
        />
        {en.chat.agentEditing}
        <span style={{ fontFamily: font.mono, fontSize: size.s11_5, color: color.text1 }}>
          {view.editingFile}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ color: color.text4, fontSize: m.header.close }}>{en.chat.close}</span>
      </div>
      <div
        style={{
          flex: 1,
          padding: `${m.body.paddingY}px ${m.body.paddingX}px`,
          display: "flex",
          flexDirection: "column",
          gap: m.body.gap,
        }}
      >
        <div
          style={{
            alignSelf: "flex-end",
            maxWidth: m.question.maxWidth,
            padding: `${m.question.paddingY}px ${m.question.paddingX}px`,
            borderRadius: m.question.radius,
            background: color.hover,
            fontSize: size.s13_5,
          }}
        >
          {view.question}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: m.answerGap,
            fontSize: size.s13_5,
            lineHeight: lineHeight.code,
            color: color.text2,
          }}
        >
          <span>{view.intro}</span>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `${m.steps.badgeColumn}px 1fr`,
              gap: `${m.steps.gap}px ${m.steps.gap}px`,
              alignItems: "start",
            }}
          >
            {view.steps.map((step, index) => (
              <StepRow key={step.id} number={index + 1} name={step.name} text={step.text} />
            ))}
          </div>
          <div style={{ display: "flex", gap: m.actions.gap }}>
            <span style={chip}>{en.chat.zoomToSteps}</span>
            <span style={chip}>{en.chat.explainStep(view.explainStep)}</span>
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: m.input.gap,
          margin: `0 ${m.input.margin}px ${m.input.margin}px`,
          padding: `${m.input.paddingY}px ${m.input.paddingRight}px ${m.input.paddingY}px ${m.input.paddingLeft}px`,
          borderRadius: m.input.radius,
          background: color.field,
        }}
      >
        <span style={{ flex: 1, color: color.text4 }}>{en.chat.followUp}</span>
        <span
          style={{
            width: chatBar.send.size,
            height: chatBar.send.size,
            borderRadius: chatBar.send.radius,
            background: color.text1,
            color: color.inv,
            display: "grid",
            placeItems: "center",
            fontSize: chatBar.send.glyph,
          }}
        >
          {en.chat.send}
        </span>
      </div>
    </div>
  );
}

function StepRow({ number, name, text }: { number: number; name: string; text: string }) {
  return (
    <>
      <span
        style={{
          width: m.steps.badge,
          height: m.steps.badge,
          borderRadius: radius.full,
          background: color.text1,
          color: color.inv,
          fontSize: size.s11,
          fontWeight: weight.bold,
          display: "grid",
          placeItems: "center",
        }}
      >
        {number}
      </span>
      <span>
        <span style={{ color: color.text1, fontWeight: weight.semibold }}>{name}</span>
        {en.meta.separator}
        {text}
      </span>
    </>
  );
}
