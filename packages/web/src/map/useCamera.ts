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

// The node the camera moves to, once the map has it (opened, when it was just
// opened); a new sequence number asks again.
export interface Focus {
  id: string;
  opened: boolean;
  seq: number;
}

// Where the live map is looked at from, and the ways the user and the app
// move it. A static map keeps the design's 1:1 camera.
export function useCamera(map: MapView, size: Size, focus: Focus | undefined, live: boolean) {
  // The map starts fitted, and again at a new window size: 1:1 when it fits,
  // scaled down to fit when it does not. A static screen stays as the design
  // draws it.
  const fitted =
    live && size.width > 0 ? fit(contentSize(map, cameraMetrics.margin), size) : identity;
  // The camera belongs to the window size, not to one map: the live map
  // arrives again with every change and every node opened, and the user keeps
  // looking where they moved to; a panel dragged wider leaves it too. It is
  // reset while rendering, once the map is measured and at a new window size,
  // so a new size never shows a frame of the old one.
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

  // The camera flies to the node asked for over the semantic zoom's time,
  // once the map has it where it is going to be: a node just opened, once it
  // is drawn open, and only when it does not already fit where the map is
  // shown. Under reduced motion it is simply there.
  const reduced = useReducedMotion();
  const moved = useRef(0);
  const flight = useRef<{ stop: () => void }>(undefined);
  const latest = useRef(camera);
  latest.current = camera;

  // The user moving the camera ends a flight: it would take the camera back
  // on its next frame.
  const move = (next: Camera | ((c: Camera) => Camera)) => {
    flight.current?.stop();
    setCamera(next);
  };
  const zoom = {
    in: () => move((c) => zoomAt(c, cameraMetrics.step, centre, cameraMetrics)),
    out: () => move((c) => zoomAt(c, 1 / cameraMetrics.step, centre, cameraMetrics)),
    fit: () => move(fitted),
  };
  // Frames the nodes the answer numbers.
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
    // A node that opens where the user can already see all of it leaves the
    // camera where it is: moving the view on every opened node disorients.
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
