// SPDX-License-Identifier: Apache-2.0

import type { FocusEvent, Ref } from "react";
import { chatPanel as m } from "../design/metrics";
import { color, lineHeight, size, weight } from "../design/tokens";
import type { ChatSummary } from "../model/view";
import { en } from "../strings/en";

// The past chats, the latest first, in the panel while the chat bar's field
// or the list itself has the focus (the owner's; not in the export). A press
// on the list keeps the focus where it is, so the list stays for the click to
// land, and a scrollbar can be dragged. The arrow keys go through the chats,
// Escape back to the field.
export function ChatHistory({
  ref,
  chats,
  onPick,
  onBlur,
  onEscape,
}: {
  ref?: Ref<HTMLDivElement>;
  // None while they are on their way: then only the heading shows.
  chats?: ChatSummary[];
  onPick: (chat: ChatSummary) => void;
  onBlur?: (event: FocusEvent) => void;
  onEscape?: () => void;
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the keys and presses belong to the rows inside
    <div
      ref={ref}
      onMouseDown={(event) => event.preventDefault()}
      {...(onBlur ? { onBlur } : {})}
      onKeyDown={(event) => {
        const rows = [...event.currentTarget.querySelectorAll("button")];
        const at = rows.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "Escape") onEscape?.();
        else if (event.key === "ArrowDown") rows[Math.min(at + 1, rows.length - 1)]?.focus();
        else if (event.key === "ArrowUp") rows[Math.max(at - 1, 0)]?.focus();
        else return;
        event.preventDefault();
      }}
      style={{
        height: "100%",
        boxSizing: "border-box",
        padding: m.padding,
        display: "flex",
        flexDirection: "column",
        gap: m.gap,
        overflowY: "auto",
      }}
    >
      <span style={{ fontWeight: weight.bold, fontSize: size.s22 }}>{en.chat.past}</span>
      {!chats ? null : chats.length === 0 ? (
        <span style={{ fontSize: size.s13_5, color: color.text4 }}>{en.chat.noPast}</span>
      ) : (
        <ul
          aria-label={en.chat.past}
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: m.rowGap,
          }}
        >
          {chats.map((chat) => (
            <li key={chat.id}>
              <button
                type="button"
                onClick={() => onPick(chat)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: color.field,
                  borderRadius: m.row.radius,
                  padding: m.row.padding,
                  display: "flex",
                  flexDirection: "column",
                  gap: m.row.gap,
                  fontFamily: "inherit",
                  color: color.text1,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: size.s13_5, lineHeight: lineHeight.regular }}>
                  {chat.question}
                </span>
                <span style={{ fontSize: size.s12, color: color.text4 }}>{en.clock(chat.at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
