// SPDX-License-Identifier: Apache-2.0

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { color } from "../design/tokens";
import { en } from "../strings/en";
import { press } from "./press";

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
  onFocus?: (() => void) | undefined;
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
            // Enter during IME composition confirms the word, not the question.
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
