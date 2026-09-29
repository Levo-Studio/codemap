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
  onBlur,
  focused = false,
}: {
  placeholder: string;
  onAsk?: (question: string) => void;
  send: CSSProperties;
  disabled?: boolean;
  // The field taken and left, for what is shown beside it meanwhile.
  onFocus?: () => void;
  onBlur?: () => void;
  // Takes the focus as it appears.
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
          {...(onFocus ? { onFocus } : {})}
          {...(onBlur ? { onBlur } : {})}
          onKeyDown={(event) => {
            // Enter while an input method composes a word confirms the word.
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
