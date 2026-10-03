// SPDX-License-Identifier: Apache-2.0

import { ask as m } from "../design/metrics";
import { floating } from "../design/styles";
import { color, lineHeight, radius, rule, size, weight } from "../design/tokens";
import type { AskView } from "../model/view";
import { en } from "../strings/en";
import { agentDot, agentFile, chatHeader, sendStyle } from "./chatStyle";
import { press } from "./press";
import { Question } from "./Question";

// An answer in Ask mode. The chat only explains: the answer is numbered steps
// that match the numbered nodes on the map, and the actions move the map, not
// the code.
interface AskPanelProps {
  view: AskView;
  onClose?: (() => void) | undefined;
  // Asks a follow-up question, or to explain a step.
  onAsk?: ((question: string) => void) | undefined;
  onZoomToSteps?: (() => void) | undefined;
  // The follow-up field takes the focus as the panel appears.
  focusFollowUp?: boolean;
}

export function AskPanel({
  view,
  onClose,
  onAsk,
  onZoomToSteps,
  focusFollowUp = false,
}: AskPanelProps) {
  return (
    // Width and height are the content box, as in the export: the border adds
    // to them, the same as for the chat bar.
    <div
      style={{
        width: "100%",
        height: m.height,
        borderRadius: m.radius,
        ...floating,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div style={chatHeader(m.header)}>
        <span style={agentDot(view.editingFile ? color.edit : color.neu)} />
        {view.editingFile ? en.chat.agentEditing : en.chat.agentIdle}
        {view.editingFile && <span style={agentFile}>{view.editingFile}</span>}
        <span style={{ flex: 1 }} />
        <span
          {...press(onClose, en.chat.closeLabel)}
          style={{ color: color.text4, fontSize: m.header.close }}
        >
          {en.chat.close}
        </span>
      </div>
      <AnswerBody view={view} onAsk={onAsk} onZoomToSteps={onZoomToSteps} />
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
        <Question
          placeholder={en.chat.followUp}
          onAsk={onAsk}
          focused={focusFollowUp}
          send={sendStyle(color.text1)}
        />
      </div>
    </div>
  );
}

// The question and its answer: the numbered steps, and what can be done with
// them. It scrolls when it is longer than where it is shown, over the map or
// in the panel.
export function AnswerBody({
  view,
  onAsk,
  onZoomToSteps,
}: {
  view: AskView;
  onAsk?: ((question: string) => void) | undefined;
  onZoomToSteps?: (() => void) | undefined;
}) {
  const last = view.steps[view.explainStep - 1];
  const chip = {
    padding: `${m.actions.paddingY}px ${m.actions.paddingX}px`,
    borderRadius: radius.md,
    border: rule(color.line2),
    fontSize: size.s12_5,
    color: color.text1,
  } as const;
  return (
    <div
      style={{
        flex: 1,
        // A long answer scrolls inside its panel.
        minHeight: 0,
        overflowY: "auto",
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
      {view.thinking ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: m.thinking.gap,
            fontSize: size.s12_5,
            color: color.text4,
          }}
        >
          {(["text4", "line3", "line3"] as const).map((dot, index) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: three fixed dots
              key={index}
              style={{
                width: m.thinking.dot,
                height: m.thinking.dot,
                borderRadius: radius.full,
                background: color[dot],
              }}
            />
          ))}
          {en.chat.thinking}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: m.answerGap,
            fontSize: size.s13_5,
            lineHeight: lineHeight.regular,
            color: color.text2,
          }}
        >
          <span>{view.intro}</span>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `${m.steps.badgeColumn}px 1fr`,
              gap: m.steps.gap,
              alignItems: "start",
            }}
          >
            {view.steps.map((step, index) => (
              <StepRow key={step.id} number={index + 1} name={step.name} text={step.text} />
            ))}
          </div>
          {view.steps.length > 0 && (
            <div style={{ display: "flex", gap: m.actions.gap }}>
              <span {...press(onZoomToSteps)} style={chip}>
                {en.chat.zoomToSteps}
              </span>
              <span
                {...press(
                  onAsk && last
                    ? () =>
                        onAsk(`${en.chat.explainStep(view.explainStep)}: ${last.name} ${last.text}`)
                    : undefined,
                )}
                style={chip}
              >
                {en.chat.explainStep(view.explainStep)}
              </span>
            </div>
          )}
        </div>
      )}
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
