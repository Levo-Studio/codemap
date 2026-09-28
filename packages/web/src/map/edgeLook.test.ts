// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { arrow, dashes, edgeLook, midpoint, slice } from "./edgeLook";

const p = (x: number, y: number) => ({ x, y });

describe("edgeLook", () => {
  it("draws a call in the edge colour at 1.25", () => {
    expect(edgeLook({ kind: "call" })).toEqual({ color: "edge", width: 1.25, flowing: false });
  });

  it("draws an active call dashed, flowing and at 1.75", () => {
    expect(edgeLook({ kind: "active" })).toEqual({
      color: "edit",
      width: 1.75,
      dash: [6, 4],
      flowing: true,
    });
  });

  it("draws an answer path at 1.75 without being told", () => {
    expect(edgeLook({ kind: "path" })).toEqual({ color: "text2", width: 1.75, flowing: false });
  });

  it("keeps the heavier stroke of an active edge that an answer dims", () => {
    expect(edgeLook({ kind: "dimmed", strong: true })).toMatchObject({
      color: "edgeDim",
      width: 1.75,
    });
  });

  it("draws a bundle at 2.5", () => {
    expect(edgeLook({ kind: "bundled" }).width).toBe(2.5);
  });
});

describe("arrow", () => {
  it("ends the line 7 before the callee and puts a 7 × 8 head on it", () => {
    const shape = arrow([p(240, 236), p(270, 236), p(270, 310), p(300, 310)]);
    expect(shape?.line.at(-1)).toEqual(p(293, 310));
    expect(shape?.head).toEqual([p(300, 310), p(293, 314), p(293, 306)]);
  });

  it("points up along a vertical last segment", () => {
    expect(arrow([p(600, 160), p(600, 104)])?.head).toEqual([
      p(600, 104),
      p(604, 111),
      p(596, 111),
    ]);
  });
});

describe("arrow on routes the layout may produce", () => {
  it("ignores a repeated last bend point", () => {
    expect(arrow([p(240, 236), p(300, 236), p(300, 236)])?.head).toEqual([
      p(300, 236),
      p(293, 240),
      p(293, 232),
    ]);
  });

  it("draws nothing for a route without two distinct points", () => {
    expect(arrow([p(10, 10)])).toBeNull();
    expect(arrow([p(10, 10), p(10, 10)])).toBeNull();
  });

  it("keeps the head 7 long on a diagonal segment", () => {
    const shape = arrow([p(0, 0), p(30, 40)]);
    const base = shape?.line.at(-1);
    expect(base?.x).toBeCloseTo(25.8);
    expect(base?.y).toBeCloseTo(34.4);
  });
});

describe("midpoint", () => {
  it("is halfway along the route, across corners", () => {
    expect(midpoint([p(0, 0), p(10, 0), p(10, 10)])).toEqual(p(10, 0));
  });
});

describe("dashes", () => {
  it("starts with a dash at offset 0", () => {
    expect(dashes([p(0, 0), p(20, 0)], [6, 4], 0)).toEqual([
      [p(0, 0), p(6, 0)],
      [p(10, 0), p(16, 0)],
    ]);
  });

  it("moves the pattern toward the end for a negative offset, as the flow animation does", () => {
    expect(dashes([p(0, 0), p(20, 0)], [6, 4], -3)).toEqual([
      [p(3, 0), p(9, 0)],
      [p(13, 0), p(19, 0)],
    ]);
  });

  it("keeps the corner inside a dash", () => {
    expect(dashes([p(0, 0), p(4, 0), p(4, 10)], [6, 4], 0)[0]).toEqual([p(0, 0), p(4, 0), p(4, 2)]);
  });
});

describe("slice", () => {
  it("cuts a polyline between two distances", () => {
    expect(slice([p(0, 0), p(10, 0), p(10, 10)], 5, 15)).toEqual([p(5, 0), p(10, 0), p(10, 5)]);
  });
});
