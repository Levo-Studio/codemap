// SPDX-License-Identifier: Apache-2.0

import { map, node } from "./metrics";
import { color, font, rule, weight } from "./tokens";

export const dotGrid = (scale = 1) => ({
  backgroundImage: `radial-gradient(${color.dot} ${map.gridDot}px, transparent ${map.gridDot}px)`,
  backgroundSize: `${map.gridSize * scale}px ${map.gridSize * scale}px`,
});

export const containerTitle = (mono: boolean | undefined) =>
  mono
    ? { fontFamily: font.mono, fontWeight: weight.medium, fontSize: map.container.monoTitleSize }
    : { fontWeight: weight.bold, fontSize: map.container.titleSize };

export const selectedOutline = {
  outline: `${node.outline}px solid ${color.text1}`,
  outlineOffset: node.outlineOffset,
};

export const floating = {
  background: color.float,
  border: rule(color.line2),
  boxShadow: color.shadowFloating,
};
