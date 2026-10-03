// SPDX-License-Identifier: Apache-2.0

import { motion } from "motion/react";
import { chatBar as m } from "../design/metrics";
import { cssEase, loop, useReducedMotion } from "../design/motion";
import { floating } from "../design/styles";
import { type ColorToken, color, font, size } from "../design/tokens";
import type { ChatBarView } from "../model/view";
import { en } from "../strings/en";
import { agentDot, agentFile, chatHeader, sendStyle } from "./chatStyle";
import { Question } from "./Question";

const look: Record<ChatBarView["kind"], { dot: ColorToken; text: string }> = {
  editing: { dot: "edit", text: en.chat.agentEditing },
  idle: { dot: "neu", text: en.chat.agentIdle },
  offline: { dot: "text4", text: en.chat.offline },
};

export function ChatBar({
  view,
  onAsk,
  onFocus,
}: {
  view: ChatBarView;
  onAsk?: ((question: string) => void) | undefined;
  onFocus?: (() => void) | undefined;
}) {
  const reduced = useReducedMotion();
  const { dot, text } = look[view.kind];
  const offline = view.kind === "offline";
  const blinking = view.kind === "editing" && !reduced;
  const dotStyle = agentDot(color[dot]);
  return (
    <div
      style={{
        width: "100%",
        borderRadius: m.radius,
        ...floating,
        fontFamily: font.sans,
        fontSize: size.s13,
        color: color.text1,
        opacity: offline ? m.offlineOpacity : 1,
      }}
    >
      <div style={chatHeader(m.header)}>
        {blinking ? (
          <motion.span
            style={dotStyle}
            animate={{ opacity: [1, loop.chatDotLow, 1] }}
            transition={{
              duration: loop.chatDot,
              ease: cssEase,
              repeat: Infinity,
            }}
          />
        ) : (
          <span style={dotStyle} />
        )}
        {text}
        {view.kind === "editing" && view.file && <span style={agentFile}>{view.file}</span>}
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
          onAsk={onAsk}
          onFocus={onFocus}
          send={sendStyle(offline ? color.line2 : color.text1)}
        />
      </div>
    </div>
  );
}
