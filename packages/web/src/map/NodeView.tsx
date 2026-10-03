// SPDX-License-Identifier: Apache-2.0

import { type MotionStyle, motion } from "motion/react";
import { type CSSProperties, useState } from "react";
import { enterOrSpace } from "../components/press";
import { node as m } from "../design/metrics";
import { duration, ease, enterScale, loop, useReducedMotion } from "../design/motion";
import { selectedOutline } from "../design/styles";
import { color, font, lineHeight, radius, rule, weight } from "../design/tokens";
import type { MapNode } from "../model/view";
import { en } from "../strings/en";
import { useEntrance, useGlide } from "./glide";
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

// The ring size reaches motion.css's keyframe as a custom property.
function pulseStyle(pulsing: boolean) {
  return pulsing
    ? {
        animation: `cm-editing-pulse ${loop.editingPulse}s ease-in-out infinite`,
        "--cm-pulse-ring": `${loop.editingPulseRing}px`,
      }
    : {};
}

function StepBadge({ step }: { step: number | undefined }) {
  return step ? (
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
      {step}
    </span>
  ) : null;
}

function ErrorBadge() {
  return (
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
  );
}

interface NodeViewProps {
  node: MapNode;
  onOpen?: () => void;
  onSelect?: ((id: string) => void) | undefined;
  entering?: boolean;
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
  const opens = node.opens && onOpen ? onOpen : undefined;
  const interactive = !!opens || !!onSelect;
  const look = nodeLook(
    interactive && hovered && node.state === "default" ? { ...node, state: "hover" } : node,
  );
  // A function without its explanation is drawn as a file.
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
    ...(look.outline ? selectedOutline : {}),
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
      <StepBadge step={node.step} />
      {node.error && <ErrorBadge />}
    </>
  );

  const pulse = pulseStyle(look.pulse && !reduced);
  const select = () => onSelect?.(node.id);
  const open = () => (opens ? opens() : select());
  const interaction = interactive
    ? {
        role: "button",
        tabIndex: 0,
        ...(opens ? { "aria-expanded": false } : {}),
        onClick: select,
        onDoubleClick: () => opens?.(),
        onKeyDown: enterOrSpace(open, select),
        onPointerEnter: () => setHovered(true),
        onPointerLeave: () => setHovered(false),
      }
    : {};
  const enter = useEntrance(entering, reduced);
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
