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
  const rects = [
    ...view.nodes,
    ...(view.container ? [view.container] : []),
    ...(view.opened ?? []),
  ];
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

// Frames an area of the map, the steps of an answer for instance: centred,
// with the margin around it, never larger than 1:1.
export function frame(
  area: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  margin: { right: number; bottom: number },
): Camera {
  const k = Math.min(
    1,
    viewport.width / (area.width + 2 * margin.right),
    viewport.height / (area.height + 2 * margin.bottom),
  );
  return {
    k,
    x: viewport.width / 2 - (area.x + area.width / 2) * k,
    y: viewport.height / 2 - (area.y + area.height / 2) * k,
  };
}

// A camera part of the way from one to another: the zoom grows evenly, and
// the point of the map in the middle of the viewport travels straight.
export function between(
  from: Camera,
  to: Camera,
  t: number,
  viewport: { width: number; height: number },
): Camera {
  const middle = (c: Camera) => ({
    x: (viewport.width / 2 - c.x) / c.k,
    y: (viewport.height / 2 - c.y) / c.k,
  });
  const a = middle(from);
  const b = middle(to);
  const k = from.k * (to.k / from.k) ** t;
  const at = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  return { k, x: viewport.width / 2 - at.x * k, y: viewport.height / 2 - at.y * k };
}

// How much one wheel event zooms. A trackpad pinch sends many small deltas, a
// mouse wheel few large ones, a line- or page-based wheel counts lines or
// pages: each is taken in pixels, and no single event zooms by more than its
// limit, so a mouse notch does not jump while a pinch follows the fingers.
export function wheelFactor(
  delta: number,
  deltaMode: number,
  zoom: { rate: number; limit: number; pixels: readonly [number, number, number] },
): number {
  // A mode the browser does not name counts as pixels.
  const pixels = delta * (zoom.pixels[deltaMode] ?? zoom.pixels[0]);
  const bounded = Math.max(-zoom.limit, Math.min(zoom.limit, pixels));
  return Math.exp(-bounded * zoom.rate);
}
