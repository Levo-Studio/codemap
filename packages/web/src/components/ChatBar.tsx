// SPDX-License-Identifier: Apache-2.0

import { motion } from "motion/react";
import { chatBar as m } from "../design/metrics";
import { cssEase, loop, useReducedMotion } from "../design/motion";
import { type ColorToken, color, font, radius, rule, size } from "../design/tokens";
import type { ChatBarView } from "../model/view";
import { en } from "../strings/en";
import { Question } from "./Question";

const look: Record<ChatBarView["kind"], { dot: ColorToken; text: string }> = {
  editing: { dot: "edit", text: en.chat.agentEditing },
  idle: { dot: "neu", text: en.chat.agentIdle },
  offline: { dot: "text4", text: en.chat.offline },
};

// The Ask entry at rest: what the agent is doing right now above the input.
// The chat only explains; there is nothing here that changes code.
export function ChatBar({
  view,
  onAsk,
}: {
  view: ChatBarView;
  // Sends a question; without it the bar is drawn at rest.
  onAsk?: (question: string) => void;
}) {
  const reduced = useReducedMotion();
  const { dot, text } = look[view.kind];
  const offline = view.kind === "offline";
  const blinking = view.kind === "editing" && !reduced;
  const dotStyle = {
    width: m.dot,
    height: m.dot,
    borderRadius: radius.full,
    background: color[dot],
  };
  return (
    <div
      style={{
        width: "100%",
        borderRadius: m.radius,
        background: color.float,
        border: rule(color.line2),
        boxShadow: color.shadowFloating,
        fontFamily: font.sans,
        fontSize: size.s13,
        color: color.text1,
        opacity: offline ? m.offlineOpacity : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: m.header.gap,
          padding: `${m.header.paddingY}px ${m.header.paddingX}px`,
          borderBottom: rule(color.line1),
          fontSize: size.s12_5,
          color: color.text2,
        }}
      >
        {blinking ? (
          <motion.span
            style={dotStyle}
            animate={{ opacity: [1, loop.chatDotLow, 1] }}
            transition={{
              duration: loop.chatDot,
              ease: [...cssEase],
              repeat: Number.POSITIVE_INFINITY,
            }}
          />
        ) : (
          <span style={dotStyle} />
        )}
        {text}
        {view.kind === "editing" && view.file && (
          <span style={{ fontFamily: font.mono, fontSize: size.s11_5, color: color.text1 }}>
            {view.file}
          </span>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: m.input.gap,
          padding: `${m.input.paddingY}px ${m.input.paddingRight}px ${m.input.paddingY}px ${m.input.paddingLeft}px`,
        }}
      >
        <Question
          placeholder={en.chat.placeholder}
          disabled={offline}
          {...(onAsk ? { onAsk } : {})}
          send={{
            width: m.send.size,
            height: m.send.size,
            borderRadius: m.send.radius,
            background: offline ? color.line2 : color.text1,
            color: color.inv,
            display: "grid",
            placeItems: "center",
            fontSize: m.send.glyph,
          }}
        />
      </div>
    </div>
  );
}
