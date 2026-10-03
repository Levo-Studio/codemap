// SPDX-License-Identifier: Apache-2.0

import { motion } from "motion/react";
import { enterOrSpace } from "../components/press";
import { map as m } from "../design/metrics";
import { duration, ease, useReducedMotion } from "../design/motion";
import { containerTitle, selectedOutline } from "../design/styles";
import { color, rule } from "../design/tokens";
import type { OpenedNode } from "../model/view";
import { useEntrance, useGlide } from "./glide";

interface OpenedBoxProps {
  box: OpenedNode;
  // A click on the title selects the opened node; a double click, or Enter,
  // closes it.
  onSelect?: ((id: string) => void) | undefined;
  onOpen?: (id: string) => void;
  // True when the box has just opened on the map the user is looking at.
  entering?: boolean;
}

// A node opened in place: the filled container of the map language around
// what it holds, its name and count as the container's title. The title is
// the handle, so the empty inside of the box still drags the map.
export function OpenedBox({ box, onSelect, onOpen, entering = false }: OpenedBoxProps) {
  const reduced = useReducedMotion();
  const glide = useGlide(box.x, box.y);
  const enter = useEntrance(entering, reduced);
  const interactive = !!onSelect || !!onOpen;
  return (
    <motion.div
      data-opened={box.id}
      initial={enter ? { opacity: 0 } : false}
      animate={enter ? { opacity: 1 } : {}}
      transition={{ duration: duration.enter, ease }}
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        x: glide.x,
        y: glide.y,
        borderRadius: m.container.radius,
        border: rule(color.line3),
        background: color.container,
        boxSizing: "border-box",
        ...(box.selected ? selectedOutline : {}),
      }}
    >
      <div
        {...(interactive
          ? {
              "data-node": box.id,
              role: "button",
              "aria-expanded": true,
              tabIndex: 0,
              onClick: () => onSelect?.(box.id),
              onDoubleClick: () => onOpen?.(box.id),
              onKeyDown: enterOrSpace(
                () => onOpen?.(box.id),
                () => onSelect?.(box.id),
              ),
            }
          : {})}
        style={{
          position: "absolute",
          left: m.container.titleX,
          right: m.container.titleX,
          top: m.container.titleY,
          display: "flex",
          alignItems: "baseline",
          gap: m.container.titleGap,
          whiteSpace: "nowrap",
          overflow: "hidden",
          ...(interactive ? { cursor: "pointer" } : {}),
        }}
      >
        <span style={containerTitle(box.mono)}>{box.title}</span>
        <span
          style={{
            fontSize: m.container.metaSize,
            color: color.text4,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {box.meta}
        </span>
      </div>
    </motion.div>
  );
}
