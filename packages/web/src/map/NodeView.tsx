// SPDX-License-Identifier: Apache-2.0

import { type MotionStyle, motion } from "motion/react";
import { type CSSProperties, useState } from "react";
import { press } from "../components/press";
import { node as m } from "../design/metrics";
import { duration, ease, enterScale, loop, useReducedMotion } from "../design/motion";
import { color, font, lineHeight, radius, rule, weight } from "../design/tokens";
import type { MapNode, PlaceRef } from "../model/view";
import { en } from "../strings/en";
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
  onOpen?: (place: PlaceRef) => void;
  // The node has just appeared on the map the user is looking at.
  entering?: boolean;
}

export function NodeView({ node, onOpen, entering = false }: NodeViewProps) {
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  // A node that leads somewhere shows the design's hover state while the
  // pointer is on it, as long as it has no status of its own to show.
  const opens = onOpen && node.opens ? node.opens : undefined;
  const look = nodeLook(
    opens && hovered && node.state === "default" ? { ...node, state: "hover" } : node,
  );
  const fn = node.kind === "function";
  const file = node.kind === "file";
  const mono = fn || file;
  const status = look.status;
  const row = file && !status;
  const [padY, padX] = fn ? m.padding.function : file ? m.padding.file : m.padding.other;
  const line = status?.text ?? node.meta;

  const box: CSSProperties = {
    position: "absolute",
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
  const lineStyle: CSSProperties = {
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
  const interaction = opens
    ? {
        ...press(() => onOpen?.(opens)),
        onPointerEnter: () => setHovered(true),
        onPointerLeave: () => setHovered(false),
      }
    : {};
  // A node that appears while its map is open enters with scale and fade,
  // once; everything else stands where it is from the first frame.
  const enter = entering && !reduced;
  return (
    <motion.div
      data-node
      {...(enter ? { "data-entering": true } : {})}
      {...interaction}
      initial={enter ? { opacity: 0, scale: enterScale } : false}
      animate={enter ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: duration.enter, ease }}
      style={{ ...box, ...pulse, ...(opens ? { cursor: "pointer" } : {}) } as MotionStyle}
    >
      {content}
    </motion.div>
  );
}
