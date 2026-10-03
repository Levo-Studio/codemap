// SPDX-License-Identifier: Apache-2.0

import { chatBar } from "../design/metrics";
import { color, font, radius, rule, size } from "../design/tokens";

// What the chat bar and an answer over the map both draw: the header that
// says what the agent is doing, its dot and file, and the send button.

export const chatHeader = (m: { paddingY: number; paddingX: number; gap: number }) =>
  ({
    display: "flex",
    alignItems: "center",
    gap: m.gap,
    padding: `${m.paddingY}px ${m.paddingX}px`,
    borderBottom: rule(color.line1),
    fontSize: size.s12_5,
    color: color.text2,
  }) as const;

export const agentDot = (background: string) => ({
  width: chatBar.dot,
  height: chatBar.dot,
  borderRadius: radius.full,
  background,
});

export const agentFile = { fontFamily: font.mono, fontSize: size.s11_5, color: color.text1 };

export const sendStyle = (background: string) =>
  ({
    width: chatBar.send.size,
    height: chatBar.send.size,
    borderRadius: chatBar.send.radius,
    background,
    color: color.inv,
    display: "grid",
    placeItems: "center",
    fontSize: chatBar.send.glyph,
  }) as const;
