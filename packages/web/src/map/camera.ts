// SPDX-License-Identifier: Apache-2.0

import type { MapView } from "../model/view";

// Where the map is looked at from: an offset in screen pixels and a scale. A
// map that fits its viewport is shown as laid out, at 1:1 and unmoved, which
// is how the design draws every map; a larger one starts scaled down to fit.

export interface Camera {
  x: number;
  y: number;
  k: number;
}

export const identity: Camera = { x: 0, y: 0, k: 1 };

export const isIdentity = (c: Camera) => c.x === 0 && c.y === 0 && c.k === 1;

// The space the map's content takes, with the same margin kept on the right
// and below as the layout keeps on the left and above.
export function contentSize(view: MapView, margin: { right: number; bottom: number }) {
  const rects = [...view.nodes, ...(view.container ? [view.container] : [])];
  return {
    width: Math.max(0, ...rects.map((r) => r.x + r.width)) + margin.right,
    height: Math.max(0, ...rects.map((r) => r.y + r.height)) + margin.bottom,
  };
}

export function fit(
  content: { width: number; height: number },
  viewport: { width: number; height: number },
): Camera {
  if (content.width <= viewport.width && content.height <= viewport.height) return identity;
  const k = Math.min(viewport.width / content.width, viewport.height / content.height);
  return {
    k,
    x: (viewport.width - content.width * k) / 2,
    y: (viewport.height - content.height * k) / 2,
  };
}

// Zooms by a factor around a point on screen, which stays where it is.
export function zoomAt(
  camera: Camera,
  factor: number,
  at: { x: number; y: number },
  limits: { min: number; max: number },
): Camera {
  const k = Math.min(limits.max, Math.max(limits.min, camera.k * factor));
  const ratio = k / camera.k;
  return { k, x: at.x - (at.x - camera.x) * ratio, y: at.y - (at.y - camera.y) * ratio };
}

export function pan(camera: Camera, dx: number, dy: number): Camera {
  return { ...camera, x: camera.x + dx, y: camera.y + dy };
}
