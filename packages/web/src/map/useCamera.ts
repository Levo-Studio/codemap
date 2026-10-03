// SPDX-License-Identifier: Apache-2.0

import { animate } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { camera as cameraMetrics } from "../design/metrics";
import { duration, ease, useReducedMotion } from "../design/motion";
import type { MapView } from "../model/view";
import {
  between,
  type Camera,
  contentSize,
  fit,
  frame as frameArea,
  identity,
  inView,
  zoomAt,
} from "./camera";

interface Size {
  width: number;
  height: number;
}

export interface Focus {
  id: string;
  opened: boolean;
  seq: number;
}

export function useCamera(map: MapView, size: Size, focus: Focus | undefined, live: boolean) {
  const fitted =
    live && size.width > 0 ? fit(contentSize(map, cameraMetrics.margin), size) : identity;
  // Reset in render, so no frame shows the old camera.
  const key = JSON.stringify(
    size.width > 0 ? [window.innerWidth, window.innerHeight] : "unmeasured",
  );
  const [view, setView] = useState({ key, camera: fitted });
  const current = view.key === key;
  if (!current) setView({ key, camera: fitted });
  const camera = current ? view.camera : fitted;
  const setCamera = (next: Camera | ((c: Camera) => Camera)) =>
    setView((v) => ({ ...v, camera: typeof next === "function" ? next(v.camera) : next }));
  const centre = { x: size.width / 2, y: size.height / 2 };

  const reduced = useReducedMotion();
  const moved = useRef(0);
  const flight = useRef<{ stop: () => void }>(undefined);
  const latest = useRef(camera);
  latest.current = camera;

  const move = (next: Camera | ((c: Camera) => Camera)) => {
    // Ends any flight, which would pull the camera back.
    flight.current?.stop();
    setCamera(next);
  };
  const zoom = {
    in: () => move((c) => zoomAt(c, cameraMetrics.step, centre, cameraMetrics)),
    out: () => move((c) => zoomAt(c, 1 / cameraMetrics.step, centre, cameraMetrics)),
    fit: () => move(fitted),
  };
  const zoomToSteps = () => {
    const steps = map.nodes.filter((n) => n.step !== undefined);
    if (steps.length === 0) return;
    const left = Math.min(...steps.map((n) => n.x));
    const top = Math.min(...steps.map((n) => n.y));
    const right = Math.max(...steps.map((n) => n.x + n.width));
    const bottom = Math.max(...steps.map((n) => n.y + n.height));
    setCamera(
      frameArea(
        { x: left, y: top, width: right - left, height: bottom - top },
        size,
        cameraMetrics.margin,
      ),
    );
  };

  useEffect(() => {
    if (!focus || !live || focus.seq === moved.current || size.width === 0) return;
    const target = focus.opened
      ? map.opened?.find((o) => o.id === focus.id)
      : (map.nodes.find((n) => n.id === focus.id) ?? map.opened?.find((o) => o.id === focus.id));
    if (!target) return;
    moved.current = focus.seq;
    if (focus.opened && inView(target, latest.current, size, cameraMetrics.margin)) return;
    const to = frameArea(target, size, cameraMetrics.margin);
    flight.current?.stop();
    if (reduced) {
      setCamera(to);
      return;
    }
    const from = latest.current;
    flight.current = animate(0, 1, {
      duration: duration.zoom,
      ease,
      onUpdate: (t) => setCamera(between(from, to, t, size)),
    });
  });
  useEffect(() => () => flight.current?.stop(), []);

  return { camera, move, zoom, zoomToSteps };
}
