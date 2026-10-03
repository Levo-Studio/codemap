// SPDX-License-Identifier: Apache-2.0

import { motion } from "motion/react";
import { mark } from "../design/metrics";
import { loop, useReducedMotion } from "../design/motion";
import { type ColorToken, color } from "../design/tokens";

interface MarkProps {
  size: number;
  // The callee is the live colour, except where nothing is live yet: the
  // empty state draws it in line-3.
  callee?: ColorToken;
  // The indexing loop. Under reduced motion the mark stands complete.
  indexing?: boolean;
}

const cycle = {
  duration: loop.markIndexing,
  ease: "easeInOut",
  repeat: Infinity,
} as const;

export function Mark({ size, callee = "edit", indexing = false }: MarkProps) {
  const reduced = useReducedMotion();
  const animate = indexing && !reduced;
  const node = { y: mark.nodeY, width: mark.node, height: mark.node, rx: mark.cornerRadius };
  const line = { d: mark.link, stroke: color.text1, strokeWidth: mark.stroke };
  const filled = { ...node, x: mark.calleeX, fill: color[callee] };
  return (
    <svg
      width={size}
      height={size}
      viewBox={mark.viewBox}
      style={{ display: "block", flex: "none" }}
      aria-hidden
    >
      <rect {...node} x={mark.callerX} fill="none" stroke={color.text1} strokeWidth={mark.stroke} />
      {animate ? (
        <>
          <motion.path
            {...line}
            strokeDasharray={mark.linkLength}
            animate={{ strokeDashoffset: [mark.linkLength, mark.linkLength, 0, 0] }}
            transition={{ ...cycle, times: [...mark.linkDrawn] }}
          />
          <motion.rect
            {...filled}
            animate={{ opacity: [0, 0, 1, 1] }}
            transition={{ ...cycle, times: [...mark.calleeShown] }}
          />
        </>
      ) : (
        <>
          <path {...line} />
          <rect {...filled} />
        </>
      )}
    </svg>
  );
}
