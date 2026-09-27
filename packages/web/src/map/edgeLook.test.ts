// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { arrow, dashes, edgeLook, slice } from "./edgeLook";

const p = (x: number, y: number) => ({ x, y });

describe("edgeLook", () => {
  it("draws a call in the edge colour at 1.25", () => {
    expect(edgeLook({ kind: "call" })).toEqual({ color: "edge", width: 1.25, flowing: false });
  });

  it("draws an active call dashed, flowing and at 1.75", () => {
    expect(edgeLook({ kind: "active", strong: true })).toEqual({
      color: "edit",
      width: 1.75,
      dash: [6, 4],
      flowing: true,
    });
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
    const { line, head } = arrow([p(240, 236), p(270, 236), p(270, 310), p(300, 310)]);
    expect(line.at(-1)).toEqual(p(293, 310));
    expect(head).toEqual([p(300, 310), p(293, 314), p(293, 306)]);
  });

  it("points up along a vertical last segment", () => {
    const { head } = arrow([p(600, 160), p(600, 104)]);
    expect(head).toEqual([p(600, 104), p(604, 111), p(596, 111)]);
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
