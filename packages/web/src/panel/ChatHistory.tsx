// SPDX-License-Identifier: Apache-2.0

import { chatPanel as m } from "../design/metrics";
import { color, lineHeight, size, weight } from "../design/tokens";
import type { ChatSummary } from "../model/view";
import { en } from "../strings/en";

// The past chats, the latest first, in the panel while the chat bar's field
// is taken (the owner's; not in the export). A chat is picked as the pointer
// goes down: the field loses its focus on the way up, and the list with it.
export function ChatHistory({
  chats,
  onPick,
}: {
  // None while they are on their way: then only the heading shows.
  chats?: ChatSummary[];
  onPick: (chat: ChatSummary) => void;
}) {
  return (
    <div
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
                onPointerDown={(event) => {
                  event.preventDefault();
                  onPick(chat);
                }}
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
