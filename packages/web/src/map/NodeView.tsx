// SPDX-License-Identifier: Apache-2.0

import { type MotionStyle, motion } from "motion/react";
import { type CSSProperties, type KeyboardEvent, useState } from "react";
import { node as m } from "../design/metrics";
import { duration, ease, enterScale, loop, useReducedMotion } from "../design/motion";
import { color, font, lineHeight, radius, rule, weight } from "../design/tokens";
import type { MapNode } from "../model/view";
import { en } from "../strings/en";
import { useGlide } from "./glide";
import { nodeLook } from "./nodeLook";

const nameSize = {
  area: m.name.area,
  module: m.name.module,
  file: m.name.file,
  function: m.name.function,
  external: m.name.external,
};
const nameWeight = {
  area: weight.bold,
  module: weight.semibold,
  file: weight.medium,
  function: weight.medium,
  external: weight.medium,
};

interface NodeViewProps {
  node: MapNode;
  // Opens the node in place.
  onOpen?: () => void;
  // A click selects the node; the panel then shows it.
  onSelect?: ((id: string) => void) | undefined;
  // The node has just appeared on the map the user is looking at.
  entering?: boolean;
  // A function shows its explanation on the card, as the design's screens
  // draw it; on the live map only its name and line.
  explained?: boolean;
}

export function NodeView({
  node,
  onOpen,
  onSelect,
  entering = false,
  explained = true,
}: NodeViewProps) {
  const reduced = useReducedMotion();
  const glide = useGlide(node.x, node.y);
  const [hovered, setHovered] = useState(false);
  // A node that can be selected or opened shows the design's hover state
  // while the pointer is on it, as long as it has no status of its own.
  const opens = node.opens && onOpen ? onOpen : undefined;
  const interactive = !!opens || !!onSelect;
  const look = nodeLook(
    interactive && hovered && node.state === "default" ? { ...node, state: "hover" } : node,
  );
  // A function without its explanation is drawn as a file is: one line of
  // code, its name and its line, or its status.
  const fn = node.kind === "function" && explained;
  const file = node.kind === "file" || (node.kind === "function" && !explained);
  const mono = node.kind === "function" || node.kind === "file";
  const status = look.status;
  const row = file && !status;
  const [padY, padX] = fn ? m.padding.function : file ? m.padding.file : m.padding.other;
  const line = status?.text ?? node.meta;

  const box: CSSProperties = {
    position: "absolute",
    pointerEvents: "auto",
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    boxSizing: "border-box",
    borderRadius: look.radius,
    background: look.background === "transparent" ? "transparent" : color[look.background],
    border: `${look.border.width}px ${look.border.style} ${color[look.border.color]}`,
    display: "flex",
    flexDirection: row ? "row" : "column",
    alignItems: row ? "center" : "stretch",
    justifyContent: fn ? "flex-start" : row ? "space-between" : "center",
    gap: fn ? m.gap.function : row ? m.gap.fileRow : m.gap.other,
    padding: `${padY}px ${padX}px`,
    fontFamily: font.sans,
    color: color[look.nameColor],
    transition: `opacity ${duration.base}s`,
    opacity: look.opacity,
    ...(look.outline
      ? { outline: `${m.outline}px solid ${color.text1}`, outlineOffset: m.outlineOffset }
      : {}),
  };

  const name: CSSProperties = {
    fontFamily: mono ? font.mono : "inherit",
    fontSize: nameSize[node.kind],
    fontWeight: nameWeight[node.kind],
    whiteSpace: fn ? "normal" : "nowrap",
    ...(fn ? { overflowWrap: "anywhere" } : { overflow: "hidden", textOverflow: "ellipsis" }),
    color: color[look.nameColor],
    minWidth: 0,
  };
  // A function's line number is set as the design sets it on its card, in
  // the mono face; its status as a file's.
  const lineStyle: CSSProperties =
    node.kind === "function" && !status
      ? { fontFamily: font.mono, fontSize: m.meta, color: color.text4, whiteSpace: "nowrap" }
      : {
          fontSize: file ? m.line.file : m.line.other,
          color: status ? color[status.color] : color.text4,
          whiteSpace: "nowrap",
        };

  const content = (
    <>
      {fn ? (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: m.headerGap,
              minWidth: 0,
            }}
          >
            <span style={name}>{node.label}</span>
            <span
              style={{
                fontFamily: font.mono,
                fontSize: m.meta,
                color: color.text4,
                whiteSpace: "nowrap",
              }}
            >
              {node.meta}
            </span>
          </div>
          <span
            style={{
              fontSize: m.description,
              lineHeight: lineHeight.description,
              color: color.text2,
            }}
          >
            {node.description}
          </span>
          {status && <span style={lineStyle}>{status.text}</span>}
        </>
      ) : (
        <>
          <span style={name}>{node.label}</span>
          {line && <span style={lineStyle}>{line}</span>}
        </>
      )}
      {/* The design shows no badge for a step of 0. */}
      {node.step ? (
        <span
          style={{
            position: "absolute",
            right: m.stepBadge.inset,
            top: m.stepBadge.inset,
            width: m.stepBadge.size,
            height: m.stepBadge.size,
            borderRadius: radius.full,
            background: color.text1,
            color: color.inv,
            fontSize: m.stepBadge.text,
            fontWeight: weight.bold,
            display: "grid",
            placeItems: "center",
            fontFamily: font.sans,
          }}
        >
          {node.step}
        </span>
      ) : null}
      {node.error && (
        <span
          style={{
            position: "absolute",
            right: m.errorBadge.inset,
            top: m.errorBadge.inset,
            width: m.errorBadge.size,
            height: m.errorBadge.size,
            borderRadius: radius.full,
            background: color.bg,
            border: rule(color.err),
            boxSizing: "border-box",
            color: color.err,
            fontSize: m.errorBadge.glyph,
            display: "grid",
            placeItems: "center",
          }}
        >
          {en.glyph.error}
        </span>
      )}
    </>
  );

  // The ring size reaches the keyframe in motion.css as a custom property.
  const pulse =
    look.pulse && !reduced
      ? {
          animation: `cm-editing-pulse ${loop.editingPulse}s ease-in-out infinite`,
          "--cm-pulse-ring": `${loop.editingPulseRing}px`,
        }
      : {};
  // A click selects, a double click opens the node in place. From the
  // keyboard Enter opens (or selects what holds nothing) and Space selects.
  const select = () => onSelect?.(node.id);
  const open = () => (opens ? opens() : select());
  const interaction = interactive
    ? {
        role: "button",
        tabIndex: 0,
        ...(opens ? { "aria-expanded": false } : {}),
        onClick: select,
        onDoubleClick: () => opens?.(),
        onKeyDown: (event: KeyboardEvent) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (event.key === "Enter") open();
          else select();
        },
        onPointerEnter: () => setHovered(true),
        onPointerLeave: () => setHovered(false),
      }
    : {};
  // A node that appears while its map is open enters with scale and fade,
  // once; everything else stands where it is from the first frame. Decided
  // when it appears: the map renders again while it enters, the camera
  // flying for one, and the entrance must not stop halfway.
  const [enter] = useState(entering && !reduced);
  return (
    <motion.div
      data-node={node.id}
      {...(enter ? { "data-entering": true } : {})}
      {...interaction}
      initial={enter ? { opacity: 0, scale: enterScale } : false}
      animate={enter ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: duration.enter, ease }}
      style={
        {
          ...box,
          ...pulse,
          x: glide.x,
          y: glide.y,
          ...(opens ? { cursor: "pointer" } : {}),
        } as MotionStyle
      }
    >
      {content}
    </motion.div>
  );
}
