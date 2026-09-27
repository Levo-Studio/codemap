// SPDX-License-Identifier: Apache-2.0

import type { CSSProperties } from "react";
import { node as m } from "../design/metrics";
import { duration, loop, useReducedMotion } from "../design/motion";
import { color, font, lineHeight, radius, weight } from "../design/tokens";
import type { MapNode } from "../model/view";
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

export function NodeView({ node }: { node: MapNode }) {
  const reduced = useReducedMotion();
  const look = nodeLook(node);
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
      {node.step !== undefined && (
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
      )}
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
            border: `1px solid ${color.err}`,
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
  return <div style={{ ...box, ...pulse } as CSSProperties}>{content}</div>;
}
