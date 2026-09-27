// SPDX-License-Identifier: Apache-2.0

import { toggle as m } from "../design/metrics";
import { color, radius } from "../design/tokens";

// On: ink track, knob right in the canvas colour. Off: line-3 track, ink knob
// left.
export function Toggle({ on }: { on: boolean }) {
  return (
    <span
      style={{
        width: m.width,
        height: m.height,
        borderRadius: m.radius,
        background: on ? color.text1 : color.line3,
        position: "relative",
      }}
    >
      <span
        style={{
          position: "absolute",
          ...(on ? { right: m.inset } : { left: m.inset }),
          top: m.inset,
          width: m.knob,
          height: m.knob,
          borderRadius: radius.full,
          background: on ? color.bg : color.text1,
        }}
      />
    </span>
  );
}
