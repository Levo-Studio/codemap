// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { fit, identity, pan, zoomAt } from "./camera";

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
});
