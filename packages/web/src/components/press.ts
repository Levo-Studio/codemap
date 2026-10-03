// SPDX-License-Identifier: Apache-2.0

import type { KeyboardEvent } from "react";

// The keys of a drawn button: Enter runs one action and Space another, as a
// node opens with Enter and is selected with Space.
export function enterOrSpace(enter: () => void, space: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    // Space would also scroll whatever holds the element.
    event.preventDefault();
    if (event.key === "Enter") enter();
    else space();
  };
}

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
    onKeyDown: enterOrSpace(action, action),
  };
}
