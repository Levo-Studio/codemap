// SPDX-License-Identifier: Apache-2.0

import { animate, type MotionValue, useMotionValue } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { duration, ease, useReducedMotion } from "../design/motion";

// A transform offset, so the layout's own position stays exact.
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
    // Start from where an interrupted glide got to.
    dx.set(dx.get() + was.x - x);
    dy.set(dy.get() + was.y - y);
    const moving = [dx, dy].map((v) => animate(v, 0, { duration: duration.zoom, ease }));
    return () => {
      for (const m of moving) m.stop();
    };
  }, [x, y, reduced, dx, dy]);
  return { x: dx, y: dy };
}

// Only a moved node hides edges, not an added one.
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

// Fixed at mount: re-renders must not stop the entrance halfway.
export function useEntrance(entering: boolean, reduced: boolean): boolean {
  const [enter] = useState(entering && !reduced);
  return enter;
}
