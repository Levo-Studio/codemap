// SPDX-License-Identifier: Apache-2.0

import type { KeyboardEvent } from "react";

// Makes a drawn element a button: clickable, reachable with Tab, pressed with
// Enter or Space, and named for assistive technology where it shows only a
// glyph. The design draws these as spans and divs, so they keep their markup.
// Without an action the element stays as drawn.
export function press(action: (() => void) | undefined, label?: string) {
  if (!action) return {};
  return {
    role: "button",
    tabIndex: 0,
    ...(label ? { "aria-label": label } : {}),
    onClick: action,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      // Space would also scroll whatever holds the element.
      event.preventDefault();
      action();
    },
  };
}
