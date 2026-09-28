// SPDX-License-Identifier: Apache-2.0

import { type CSSProperties, useState } from "react";
import { color } from "../design/tokens";
import { en } from "../strings/en";
import { press } from "./press";

// Where the user types a question: a field that looks exactly like the
// drawn placeholder, and the send button beside it. Enter or the button
// sends; an empty question sends nothing.
export function Question({
  placeholder,
  onAsk,
  send,
  disabled = false,
}: {
  placeholder: string;
  onAsk?: (question: string) => void;
  send: CSSProperties;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const submit = onAsk
    ? () => {
        const question = text.trim();
        if (question === "") return;
        onAsk(question);
        setText("");
      }
    : undefined;
  return (
    <>
      {onAsk ? (
        <input
          className="cm-question"
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={placeholder}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit?.();
          }}
        />
      ) : (
        <span style={{ flex: 1, color: color.text4 }}>{placeholder}</span>
      )}
      <span {...press(disabled ? undefined : submit, en.chat.sendLabel)} style={send}>
        {en.chat.send}
      </span>
    </>
  );
}
