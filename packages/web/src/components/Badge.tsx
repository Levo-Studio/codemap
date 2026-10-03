// SPDX-License-Identifier: Apache-2.0

import { badge as m } from "../design/metrics";
import { type ColorToken, color, size, weight } from "../design/tokens";

export function Badge({ text, fg, bg }: { text: string; fg: ColorToken; bg: ColorToken }) {
  return (
    <span
      style={{
        padding: `${m.paddingY}px ${m.paddingX}px`,
        borderRadius: m.radius,
        background: color[bg],
        color: color[fg],
        fontSize: size.s12,
        fontWeight: weight.medium,
      }}
    >
      {text}
    </span>
  );
}
