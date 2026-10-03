// SPDX-License-Identifier: Apache-2.0

import { map, node } from "./metrics";
import { color, font, rule, weight } from "./tokens";

// Style fragments the design repeats across its parts, built from the tokens
// and metrics alone.

// The map's dot grid, at the camera's scale.
export const dotGrid = (scale = 1) => ({
  backgroundImage: `radial-gradient(${color.dot} ${map.gridDot}px, transparent ${map.gridDot}px)`,
  backgroundSize: `${map.gridSize * scale}px ${map.gridSize * scale}px`,
});

// The name in a filled container's title: in the mono face for a file.
export const containerTitle = (mono: boolean | undefined) =>
  mono
    ? { fontFamily: font.mono, fontWeight: weight.medium, fontSize: map.container.monoTitleSize }
    : { fontWeight: weight.bold, fontSize: map.container.titleSize };

export const selectedOutline = {
  outline: `${node.outline}px solid ${color.text1}`,
  outlineOffset: node.outlineOffset,
};

// A card floating over the map: the chat, the palette, the first-run card.
export const floating = {
  background: color.float,
  border: rule(color.line2),
  boxShadow: color.shadowFloating,
};
