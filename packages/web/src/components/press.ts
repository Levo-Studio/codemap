// SPDX-License-Identifier: Apache-2.0

import type { KeyboardEvent } from "react";

export function enterOrSpace(enter: () => void, space: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    // Space would also scroll whatever holds the element.
    event.preventDefault();
    if (event.key === "Enter") enter();
    else space();
  };
}

// Drawn spans and divs become buttons, keeping their markup.
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
