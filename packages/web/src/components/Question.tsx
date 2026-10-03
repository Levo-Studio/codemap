// SPDX-License-Identifier: Apache-2.0

import { type CSSProperties, useEffect, useRef, useState } from "react";
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
  onFocus,
  focused = false,
}: {
  placeholder: string;
  onAsk?: ((question: string) => void) | undefined;
  send: CSSProperties;
  disabled?: boolean;
  // Called when the field takes focus, so the caller can show something
  // beside it meanwhile.
  onFocus?: (() => void) | undefined;
  // When true, the field takes focus as it mounts.
  focused?: boolean;
}) {
  const [text, setText] = useState("");
  const field = useRef<HTMLInputElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only as it appears
  useEffect(() => {
    if (focused) field.current?.focus();
  }, []);
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
          ref={field}
          className="cm-question"
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={placeholder}
          onChange={(event) => setText(event.target.value)}
          onFocus={onFocus}
          onKeyDown={(event) => {
            // Enter while an input method is composing a word confirms the
            // word, so it must not send the question.
            if (event.key === "Enter" && !event.nativeEvent.isComposing) submit?.();
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
