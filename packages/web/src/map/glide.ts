// SPDX-License-Identifier: Apache-2.0

import { animate, type MotionValue, useMotionValue } from "motion/react";
import { useLayoutEffect, useRef } from "react";
import { duration, ease, useReducedMotion } from "../design/motion";

// Something on the map that the layout moves glides from where it was to
// where it now is, over the semantic zoom's time, instead of jumping: opening
// a node moves the nodes around it aside. The offset is a transform, so the
// layout's own position stays exact. Under reduced motion it jumps.
export function useGlide(x: number, y: number): { x: MotionValue<number>; y: MotionValue<number> } {
  const reduced = useReducedMotion();
  const dx = useMotionValue(0);
  const dy = useMotionValue(0);
  const last = useRef({ x, y });
  useLayoutEffect(() => {
    const was = last.current;
    last.current = { x, y };
    if (was.x === x && was.y === y) return;
    if (reduced) {
      dx.set(0);
      dy.set(0);
      return;
    }
    // Start from wherever an earlier glide has got to, so an interrupted
    // glide does not jump.
    dx.set(dx.get() + was.x - x);
    dy.set(dy.get() + was.y - y);
    const moving = [dx, dy].map((v) => animate(v, 0, { duration: duration.zoom, ease }));
    return () => {
      for (const m of moving) m.stop();
    };
  }, [x, y, reduced, dx, dy]);
  return { x: dx, y: dy };
}

// The connections are drawn where the layout puts them at once; while the
// nodes glide there, they are hidden, and fade in as the nodes arrive. Only
// a node that moved hides them; a node that appears or disappears does not.
export function useSettle(
  nodes: readonly { id: string; x: number; y: number }[],
): MotionValue<number> {
  const reduced = useReducedMotion();
  const opacity = useMotionValue(1);
  const last = useRef(new Map<string, string>());
  const fading = useRef<{ stop: () => void }>(undefined);
  useLayoutEffect(() => {
    const now = new Map(nodes.map((n) => [n.id, `${n.x},${n.y}`]));
    const was = last.current;
    last.current = now;
    const moved = [...now].some(([id, at]) => was.has(id) && was.get(id) !== at);
    if (!moved || reduced) return;
    fading.current?.stop();
    opacity.set(0);
    fading.current = animate(opacity, 1, {
      duration: duration.base,
      delay: duration.zoom,
      ease,
    });
  }, [nodes, reduced, opacity]);
  useLayoutEffect(() => () => fading.current?.stop(), []);
  return opacity;
}
