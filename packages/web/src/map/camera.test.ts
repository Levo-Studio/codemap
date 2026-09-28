// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { between, fit, frame, identity, pan, wheelFactor, zoomAt } from "./camera";

describe("camera", () => {
  it("shows a map that fits as laid out, unscaled and unmoved", () => {
    expect(fit({ width: 1000, height: 600 }, { width: 1060, height: 844 })).toEqual(identity);
  });

  it("scales a larger map down to fit and centres it", () => {
    expect(fit({ width: 2120, height: 844 }, { width: 1060, height: 844 })).toEqual({
      k: 0.5,
      x: 0,
      y: 211,
    });
  });

  it("keeps the point under the pointer in place while zooming", () => {
    const camera = zoomAt(identity, 2, { x: 100, y: 50 }, { min: 0.1, max: 4 });
    expect(camera).toEqual({ k: 2, x: -100, y: -50 });
    expect(zoomAt(camera, 10, { x: 0, y: 0 }, { min: 0.1, max: 4 }).k).toBe(4);
  });

  it("pans by the distance dragged", () => {
    expect(pan(identity, 12, -5)).toEqual({ x: 12, y: -5, k: 1 });
  });

  it("frames an area in the middle, with its margin, never beyond 1:1", () => {
    const viewport = { width: 1000, height: 800 };
    const margin = { right: 60, bottom: 64 };
    expect(frame({ x: 100, y: 100, width: 200, height: 100 }, viewport, margin)).toEqual({
      k: 1,
      x: 300,
      y: 250,
    });
    const wide = frame({ x: 0, y: 0, width: 1880, height: 100 }, viewport, margin);
    expect(wide.k).toBeCloseTo(0.5);
    expect(wide.x).toBeCloseTo(500 - 940 * 0.5);
  });

  it("moves between two cameras with the zoom growing evenly and the middle travelling straight", () => {
    const viewport = { width: 1000, height: 800 };
    const from = { k: 1, x: 0, y: 0 };
    // Zoomed in twice, around the top left quarter: its middle is (250, 200).
    const to = { k: 2, x: 0, y: 0 };
    expect(between(from, to, 0, viewport)).toEqual(from);
    expect(between(from, to, 1, viewport)).toEqual(to);
    const half = between(from, to, 0.5, viewport);
    expect(half.k).toBeCloseTo(Math.SQRT2);
    expect((500 - half.x) / half.k).toBeCloseTo(375);
    expect((400 - half.y) / half.k).toBeCloseTo(300);
  });

  it("zooms a pinch in small steps and a mouse notch by a bounded one", () => {
    const zoom = { rate: 0.01, limit: 50, line: 16, page: 800 };
    expect(wheelFactor(-4, 0, zoom)).toBeCloseTo(Math.exp(0.04));
    expect(wheelFactor(-100, 0, zoom)).toBeCloseTo(Math.exp(0.5));
    expect(wheelFactor(100, 0, zoom)).toBeCloseTo(Math.exp(-0.5));
    expect(wheelFactor(-3, 1, zoom)).toBeCloseTo(Math.exp(0.48));
    expect(wheelFactor(-1, 2, zoom)).toBeCloseTo(Math.exp(0.5));
  });
});
